import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteEngineService, RouteLeg } from '../routes/route-engine.service';
import { toMinutes } from '../common/time.util';

export type RiskLevel = 'aman' | 'waspada' | 'berisiko';

export interface LegRisk {
  provider: string;
  name: string;
  serviceKey: string;
  routeKey: string;
  hour: number;
  /** kelonggaran transit sebelum leg ini berangkat (menit) */
  slackMin: number;
  samples: number;
  delayAvg: number;
  delayMax: number;
  /** persentase sampel historis yang akan melewatkan sambungan (0..1) */
  missProbability: number;
  score: number; // 0..100
  level: RiskLevel;
}

export interface PlanBReport {
  routeId: string;
  overall: { score: number; level: RiskLevel };
  legs: LegRisk[];
  planB: {
    triggered: boolean;
    triggerLeg: string | null;
    reason: string | null;
    alternatives: { id: string; label: string; totalPrice: number; totalDuration: string; arrivalTime: string }[];
  };
}

const LEVEL_WASPADA = 30;
const LEVEL_BERISIKO = 60;

interface DelayRow {
  provider: string;
  routeKey: string;
  hour: number;
  delayMinutes: number;
}

function levelOf(score: number): RiskLevel {
  if (score >= LEVEL_BERISIKO) return 'berisiko';
  if (score >= LEVEL_WASPADA) return 'waspada';
  return 'aman';
}

/**
 * Plan B / skor risiko (patch PRD v1, bagian P1).
 * Sumber data: DelayHistory (seed simulasi). Rumus per leg:
 *   score = round(min(100, 50 * delayAvg/slack + 50 * missProbability))
 * Trigger Plan B: ada leg dengan score >= 60 → tawarkan rute alternatif
 * dengan layanan lanjutan yang sama (engine.alternativesFor).
 */
@Injectable()
export class PlanBService {
  /** Cache DelayHistory (tabel mungil) — 1 query per menit, bukan per leg.
   * Tanpa ini, 16 request paralel dari layar hasil = puluhan query ke cloud DB
   * dan badge RISIKO telat muncul di jendela muat layar. */
  private delayCache: { at: number; rows: DelayRow[] } | null = null;
  /** Cache laporan per routeId — skor berbasis riwayat statis, aman 60 detik. */
  private reportCache = new Map<string, { at: number; rep: PlanBReport }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RouteEngineService,
  ) {}

  private async delayRows(): Promise<DelayRow[]> {
    if (this.delayCache && Date.now() - this.delayCache.at < 60_000) {
      return this.delayCache.rows;
    }
    const rows = await this.prisma.delayHistory.findMany();
    this.delayCache = { at: Date.now(), rows };
    return rows;
  }

  async report(routeId: string): Promise<PlanBReport> {
    const hit = this.reportCache.get(routeId);
    if (hit && Date.now() - hit.at < 60_000) return hit.rep;

    const route = this.engine.reconstruct(routeId);
    if (!route) throw new NotFoundException(`routeId ${routeId} tidak dikenal.`);

    const rows = await this.delayRows();
    const legs: LegRisk[] = [];
    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      if (leg.provider === 'taxi') continue; // taksi simulasi: tidak ada riwayat delay
      legs.push(this.riskForLeg(leg, i > 0 ? route.legs[i - 1] : null, rows));
    }

    const overallScore = legs.length ? Math.max(...legs.map((l) => l.score)) : 0;
    const trigger = legs.find((l) => l.level === 'berisiko') ?? null;

    let alternatives: PlanBReport['planB']['alternatives'] = [];
    if (trigger) {
      alternatives = this.engine
        .alternativesFor(route)
        .slice(0, 3)
        .map((r) => ({
          id: r.id,
          label: r.legs.find((l) => !['whoosh', 'feeder', 'taxi'].includes(l.provider))?.name ?? r.id,
          totalPrice: r.totalPrice,
          totalDuration: r.totalDuration,
          arrivalTime: r.arrivalTime,
        }));
    }

    const result: PlanBReport = {
      routeId,
      overall: { score: overallScore, level: levelOf(overallScore) },
      legs,
      planB: {
        triggered: trigger !== null,
        triggerLeg: trigger?.name ?? null,
        reason: trigger
          ? `Riwayat delay ${trigger.name} rata-rata ${trigger.delayAvg} menit dengan kelonggaran transit ${trigger.slackMin} menit.`
          : null,
        alternatives,
      },
    };
    this.reportCache.set(routeId, { at: Date.now(), rep: result });
    return result;
  }

  private riskForLeg(leg: RouteLeg, prev: RouteLeg | null, allRows: DelayRow[]): LegRisk {
    const routeKey = `${leg.fromId}-${leg.toId}`;
    const hour = Number(leg.departure.slice(0, 2));
    const slackMin = prev ? Math.max(1, toMinutes(leg.departure) - toMinutes(prev.arrival)) : 60;

    const rows = allRows.filter((r) => r.provider === leg.provider && r.routeKey === routeKey && r.hour === hour);
    const samples = rows.length;
    const delayAvg = samples ? rows.reduce((s, r) => s + r.delayMinutes, 0) / samples : 0;
    const delayMax = samples ? Math.max(...rows.map((r) => r.delayMinutes)) : 0;
    const missProbability = samples ? rows.filter((r) => r.delayMinutes > slackMin).length / samples : 0;

    const score = samples
      ? Math.round(Math.min(100, 50 * (delayAvg / slackMin) + 50 * missProbability))
      : 0; // tanpa data historis: netral, jangan menakuti user

    return {
      provider: leg.provider,
      name: leg.name,
      serviceKey: leg.serviceKey,
      routeKey,
      hour,
      slackMin,
      samples,
      delayAvg: Math.round(delayAvg * 10) / 10,
      delayMax,
      missProbability: Math.round(missProbability * 100) / 100,
      score,
      level: levelOf(score),
    };
  }
}
