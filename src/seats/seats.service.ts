import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import seatData from '../data/seat-layouts.json';

interface Layout {
  patterns: string[];
  letters: string[];
  rows: number;
}

export interface SeatCell {
  label: string;
  occupied: boolean;
}

/**
 * Denah kursi per penyedia (PRD: pola "S"=kursi, "_"=lorong, "X"=>sopir).
 * Terisi = daftar statis di seat-layouts.json + SeatHold aktif di database.
 */
@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  private layouts(): Record<string, Layout> {
    return seatData.seatLayouts as Record<string, Layout>;
  }

  async availability(provider: string, serviceKey: string) {
    const layout = this.layouts()[provider];
    if (!layout) throw new NotFoundException(`Denah untuk penyedia ${provider} tidak ada.`);

    const staticTaken: string[] =
      (seatData.occupied as Record<string, string[]>)[serviceKey] ?? [];
    const holds = await this.prisma.seatHold.findMany({
      where: { expiresAt: { gt: new Date() }, leg: { serviceKey } },
      select: { seat: true },
    });
    const taken = new Set([...staticTaken, ...holds.map((h) => h.seat)]);

    const rows: { row: number; seats: SeatCell[] }[] = [];
    for (let r = 1; r <= layout.rows; r++) {
      const pattern = layout.patterns[(r - 1) % layout.patterns.length];
      const letters = layout.letters[(r - 1) % layout.letters.length];
      const seats: SeatCell[] = [];
      [...pattern].forEach((ch, i) => {
        if (ch === 'S' && letters[i] && letters[i] !== '_') {
          seats.push({ label: `${r}${letters[i]}`, occupied: taken.has(`${r}${letters[i]}`) });
        }
      });
      rows.push({ row: r, seats });
    }
    return { provider, serviceKey, layout: rows };
  }
}
