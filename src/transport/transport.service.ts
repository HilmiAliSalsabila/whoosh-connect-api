import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/providers.module';
import { ScheduleDataService } from '../routes/schedule-data.service';
import { toDateTime } from '../common/time.util';

@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly data: ScheduleDataService,
  ) {}

  /** Opsi moda lanjutan (taksi/ojek simulasi) dari stasiun tujuan. */
  options(fromStation: string, destination?: string) {
    const drop = this.data.drops[fromStation];
    if (!drop) {
      // cocokkan longgar: "Stasiun Garut" → GRT
      const key = Object.keys(this.data.drops).find((k) =>
        this.data.drops[k].label.toLowerCase().includes((fromStation || '').toLowerCase()),
      );
      if (!key) throw new NotFoundException(`Tidak ada moda lanjutan dari ${fromStation}.`);
      return { fromStation: key, ...this.data.drops[key] };
    }
    void destination;
    return { fromStation, ...drop };
  }

  /** Pesan taksi simulasi — menyimpan BookingLeg tunggal bertipe taxi. */
  async bookTaxi(
    userId: string,
    body: { station: string; destination: string; time: string; mode?: string },
  ) {
    const drop = this.data.drops[body.station] ?? null;
    const opt =
      drop?.options.find((o) => (body.mode ? o.mode === body.mode : true)) ?? drop?.options[0];
    if (!opt) throw new NotFoundException(`Tidak ada ${body.mode ?? 'taksi'} di ${body.station}.`);

    const provider = this.registry.get('taxi');
    const issued = await provider.issueTicket({
      serviceKey: `${body.station}-${opt.mode.toLowerCase()}`,
      seats: [],
      passengerName: userId,
      idempotencyKey: `taxi:${userId}:${Date.now()}`,
    });

    const now = new Date();
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        routeId: `taxi_${body.station}`,
        status: 'confirmed',
        totalPrice: opt.price,
        idempotencyKey: `taxi-${issued.ticketCode}`,
        legs: {
          create: {
            provider: 'taxi',
            status: 'issued',
            ticketCode: issued.ticketCode,
            serviceKey: `${body.station}-${opt.mode.toLowerCase()}`,
            label: `${opt.mode} (simulasi)`,
            fromLabel: drop?.label ?? body.station,
            toLabel: body.destination,
            price: opt.price,
            departAt: toDateTime(now.toISOString(), body.time ?? '00:00'),
            arriveAt: new Date(toDateTime(now.toISOString(), body.time ?? '00:00').getTime() + opt.durationMin * 60_000),
          },
        },
      },
      include: { legs: true },
    });
    return { status: 'success', booking: booking.id, orderCode: issued.ticketCode, legs: booking.legs };
  }
}
