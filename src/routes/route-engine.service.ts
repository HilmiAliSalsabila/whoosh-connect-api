import { Injectable } from '@nestjs/common';
import {
  ScheduleDataService,
  OnwardService,
  LastMileOption,
} from './schedule-data.service';
import { toMinutes, toHHMM, formatDuration } from '../common/time.util';

export interface RouteLeg {
  order: number;
  mode: string;
  name: string;
  provider: string;
  operator: string;
  serviceKey: string;
  from: string;
  to: string;
  /** id stasiun/simpul — dipakai routeKey skor risiko Plan B */
  fromId: string;
  toId: string;
  departure: string;
  arrival: string;
  price: number;
  priceNote?: string;
  /** true bila leg ini punya denah kursi (whoosh/kai/bus/travel) */
  seatSelectable: boolean;
}

export interface RouteOption {
  id: string;
  labels: string[];
  markers: string[];
  transitStation: string;
  whooshDeparture: string;
  arrivalTime: string;
  totalDuration: string;
  totalMinutes: number;
  totalPrice: number;
  legs: RouteLeg[];
}

export interface SearchQuery {
  origin: string;
  destination: string;
  date?: string;
  transitStation?: string;
  sort?: 'earliest' | 'fastest' | 'cheapest';
}

const LONG_TRANSIT_MIN = 180;
const FEEDER_BUFFER_MIN = 10;
const CLASS_RANK: Record<string, number> = {
  economy: 1,
  bus: 2,
  shuttle: 2,
  comfort: 3,
  premium: 4,
  executive: 5,
};

/**
 * Route Engine (PRD bagian 5). Opsi rute tidak ditulis manual — engine
 * merangkai semua kombinasi yang secara jadwal bisa dikejar.
 * Tidak ada opsi yang dibuang; transit > 3 jam hanya diberi penanda.
 */
@Injectable()
export class RouteEngineService {
  constructor(private readonly data: ScheduleDataService) {}

  search(q: SearchQuery): RouteOption[] {
    const origin = this.data.resolveOrigin(q.origin);
    if (!origin) return [];
    const destNodes = this.data.destNodes(q.destination);

    const candidates: RouteOption[] = [];
    for (const trip of this.data.whooshTrips.filter((t) => t.from === origin)) {
      for (const hub of this.hubsFor(trip.to)) {
        // Hub PDL: siap langsung. Hub BDG: feeder pertama setelah tiba + buffer.
        let readyAt = toMinutes(trip.arrival);
        let feederLeg: RouteLeg | null = null;
        if (hub !== trip.to) {
          const feeder = this.data.feederTrips.find(
            (f) => f.from === trip.to && toMinutes(f.departure) >= readyAt + FEEDER_BUFFER_MIN,
          );
          if (!feeder) continue;
          readyAt = toMinutes(feeder.arrival);
          feederLeg = {
            order: 0,
            mode: 'Feeder Whoosh',
            name: feeder.name,
            provider: 'feeder',
            operator: 'KCIC',
            serviceKey: feeder.serviceKey,
            from: this.data.stationLabel(feeder.from),
            to: this.data.stationLabel(feeder.to),
            fromId: feeder.from,
            toId: feeder.to,
            departure: feeder.departure,
            arrival: feeder.arrival,
            price: 0,
            priceNote: this.data.feederNote,
            seatSelectable: false,
          };
        }

        for (const svc of this.data.hubs[hub] ?? []) {
          if (!destNodes.includes(svc.to)) continue;
          if (toMinutes(svc.departure) < readyAt + svc.bufferMin) continue;

          const onwardWait = toMinutes(svc.departure) - readyAt;
          if (svc.doorToDoor) {
            candidates.push(this.build(trip, hub, feederLeg, svc, null, onwardWait, 0));
          } else {
            for (const lm of this.data.drops[svc.to]?.options ?? []) {
              candidates.push(this.build(trip, hub, feederLeg, svc, lm, onwardWait, 0));
            }
          }
        }
      }
    }

    this.mark(candidates);
    this.label(candidates);
    return this.sort(candidates, q.sort).filter(
      (r) => !q.transitStation || r.transitStation === q.transitStation,
    );
  }

  findById(routeId: string, q: SearchQuery): RouteOption | undefined {
    // id bersifat deterministik; cari dengan meng-generate ulang untuk kota yang sama.
    return this.search(q).find((r) => r.id === routeId);
  }

  /**
   * Bangkit ulang satu rute HANYA dari id (dipakai BookingService yang cuma
   * menerima routeId). Format id: wc_<trip>_<hub>_<serviceKey>[_<lastmile>].
   */
  reconstruct(routeId: string): RouteOption | undefined {
    const parts = routeId.split('_');
    if (parts.length < 4 || parts[0] !== 'wc') return undefined;
    const [, tripKey, hub, svcKey] = parts;
    const trip = this.data.whooshTrips.find((t) => t.serviceKey === tripKey);
    const svc = (this.data.hubs[hub] ?? []).find((s) => s.serviceKey === svcKey);
    if (!trip || !svc) return undefined;
    const list = this.search({ origin: trip.from, destination: svc.to });
    return list.find((r) => r.id === routeId);
  }

  /**
   * Rute alternatif untuk Plan B / kegagalan sebagian: Whoosh sama,
   * moda lanjutan BERBEDA (yang gagal/berisiko diganti). Bila tidak ada
   * dengan Whoosh yang sama, longgarkan ke semua kombinasi tujuan.
   */
  alternativesFor(route: RouteOption): RouteOption[] {
    const onward = route.legs.find((l) => !['whoosh', 'feeder', 'taxi'].includes(l.provider));
    if (!onward) return [];
    const q: SearchQuery = {
      origin: route.legs[0].fromId,
      destination: this.data.cityOfNode(onward.toId),
    };
    const all = this.search(q).filter((r) => {
      const o = r.legs.find((l) => !['whoosh', 'feeder', 'taxi'].includes(l.provider));
      return r.id !== route.id && o && o.serviceKey !== onward.serviceKey;
    });
    const sameWhoosh = all.filter((r) => r.legs[0].serviceKey === route.legs[0].serviceKey);
    const picked = sameWhoosh.length > 0 ? sameWhoosh : all;
    return picked.sort((a, b) => toMinutes(a.arrivalTime) - toMinutes(b.arrivalTime));
  }

  private hubsFor(whooshArriveStation: string): string[] {
    // PDL langsung, atau BDG via feeder.
    return whooshArriveStation === 'PDL' ? ['PDL', 'BDG'] : [whooshArriveStation];
  }

  private build(
    trip: { serviceKey: string; name: string; from: string; to: string; departure: string; arrival: string; price: number; class?: string },
    hub: string,
    feederLeg: RouteLeg | null,
    svc: OnwardService,
    lm: LastMileOption | null,
    onwardWait: number,
    _unused: number,
  ): RouteOption {
    const legs: RouteLeg[] = [];
    legs.push({
      order: 1,
      mode: 'Whoosh',
      name: trip.name,
      provider: 'whoosh',
      operator: 'KCIC',
      serviceKey: trip.serviceKey,
      from: this.data.stationLabel(trip.from),
      to: this.data.stationLabel(trip.to),
      fromId: trip.from,
      toId: trip.to,
      departure: trip.departure,
      arrival: trip.arrival,
      price: trip.price,
      seatSelectable: true,
    });
    if (feederLeg) {
      feederLeg.order = legs.length + 1;
      legs.push(feederLeg);
    }
    legs.push({
      order: legs.length + 1,
      mode: svc.mode,
      name: svc.name,
      provider: svc.provider,
      operator: svc.operator,
      serviceKey: svc.serviceKey,
      from: this.data.stationLabel(hub),
      to: svc.toLabel,
      fromId: hub,
      toId: svc.to,
      departure: svc.departure,
      arrival: svc.arrival,
      price: svc.price,
      seatSelectable: ['kai', 'bus', 'travel'].includes(svc.provider),
    });
    let arrivalMin = toMinutes(svc.arrival);
    if (lm) {
      const dep = toHHMM(arrivalMin);
      arrivalMin += lm.durationMin;
      legs.push({
        order: legs.length + 1,
        mode: lm.mode,
        name: `${lm.mode} (simulasi)`,
        provider: lm.provider,
        operator: lm.operator,
        serviceKey: `${svc.to}-${lm.mode.toLowerCase()}`,
        from: svc.toLabel,
        to: 'Tujuan Akhir',
        fromId: svc.to,
        toId: 'DEST',
        departure: dep,
        arrival: toHHMM(arrivalMin),
        price: lm.price,
        seatSelectable: false,
      });
    }

    const total = legs.reduce((s, l) => s + l.price, 0);
    const totalMinutes = arrivalMin - toMinutes(trip.departure);
    const lmKey = lm ? `_${lm.mode.toLowerCase()}` : '_dd';
    return {
      id: `wc_${trip.serviceKey}_${hub}_${svc.serviceKey}${lmKey}`,
      labels: [],
      markers: onwardWait > LONG_TRANSIT_MIN ? ['Transit lama'] : [],
      transitStation: hub,
      whooshDeparture: trip.departure,
      arrivalTime: toHHMM(arrivalMin),
      totalDuration: formatDuration(totalMinutes),
      totalMinutes,
      totalPrice: total,
      legs,
    };
  }

  private mark(list: RouteOption[]): void {
    // penanda lain (mis. "cuma sisa 5 menit") bisa ditambahkan di sini
    void list;
  }

  private label(list: RouteOption[]): void {
    if (list.length === 0) return;
    const earliestArrival = Math.min(...list.map((r) => toMinutes(r.arrivalTime)));
    const cheapest = Math.min(...list.map((r) => r.totalPrice));
    const comfortableClass = Math.max(
      ...list.map((r) => {
        const onward = r.legs.find((l) => !['whoosh', 'feeder', 'taxi'].includes(l.provider));
        return onward ? CLASS_RANK[this.classOf(onward.serviceKey)] ?? 0 : 0;
      }),
    );
    const fastest = [...list].sort((a, b) => a.totalMinutes - b.totalMinutes)[0];

    for (const r of list) {
      if (toMinutes(r.arrivalTime) === earliestArrival) r.labels.push('Tiba paling awal');
      if (r === fastest) r.labels.push('Tercepat');
      if (r.totalPrice === cheapest) r.labels.push('Termurah');
      const onward = r.legs.find((l) => !['whoosh', 'feeder', 'taxi'].includes(l.provider));
      if (onward && (this.classOf(onward.serviceKey)) && CLASS_RANK[this.classOf(onward.serviceKey)] === comfortableClass && comfortableClass >= 3) {
        r.labels.push('Nyaman');
      }
      r.labels.push(r.transitStation === 'PDL' ? 'Via Padalarang' : 'Via Bandung');
    }
  }

  private classOf(serviceKey: string): string {
    for (const svcs of Object.values(this.data.hubs)) {
      const s = svcs.find((x) => x.serviceKey === serviceKey);
      if (s) return s.class ?? '';
    }
    return '';
  }

  private sort(list: RouteOption[], mode?: string): RouteOption[] {
    const by =
      mode === 'fastest'
        ? (r: RouteOption) => r.totalMinutes
        : mode === 'cheapest'
          ? (r: RouteOption) => r.totalPrice
          : (r: RouteOption) => toMinutes(r.whooshDeparture); // default: jam berangkat
    return [...list].sort((a, b) => by(a) - by(b));
  }
}
