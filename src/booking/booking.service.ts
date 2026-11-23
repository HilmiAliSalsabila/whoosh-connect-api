import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/providers.module';
import { RouteEngineService } from '../routes/route-engine.service';
import { RouteLeg } from '../routes/route-engine.service';
import { toDateTime } from '../common/time.util';
import { CreateBookingDto, PayBookingDto } from './dto/create-booking.dto';

const HOLD_MINUTES = Number(process.env.SEAT_HOLD_MINUTES ?? 10);

export interface BookingView {
  status: string;
  booking: {
    id: string;
    routeId: string;
    passengers: number;
    totalPrice: number;
    holdExpiresAt: Date | null;
    createdAt: Date;
  };
  legs: {
    order?: number;
    provider: string;
    name: string;
    status: string;
    ticketCode: string | null;
    seat: string | null;
    price: number;
    from: string;
    to: string;
    departure: Date;
    arrival: Date;
  }[];
  alternatives?: string[];
  message?: string;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly engine: RouteEngineService,
  ) {}

  /**
   * Aturan PRD bagian 7:
   * 1. Tahan kursi semua leg lebih dulu; bila satu gagal, booking tidak dilanjutkan.
   * 2. Pembayaran ditagih hanya setelah semua leg tertahan.
   * 4. Idempotency key mencegah tagihan ganda.
   * 5. Tahanan lepas otomatis setelah SEAT_HOLD_MINUTES.
   */
  async create(userId: string, dto: CreateBookingDto) {
    const existing = await this.prisma.booking.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { legs: true },
    });
    if (existing) return this.serialize(existing); // retry → hasil yang sama, tidak beli dua kali

    const route = this.engine.reconstruct(dto.routeId);
    if (!route) throw new NotFoundException(`routeId ${dto.routeId} tidak dikenal.`);

    const passengers = dto.passengers ?? 1;
    const date = new Date().toISOString().slice(0, 10);
    const seatByLeg = new Map((dto.seats ?? []).map((s) => [s.legOrder, s]));

    // Validasi: setiap leg yang bisa dipilih kursinya butuh kursi sejumlah penumpang.
    for (const leg of route.legs) {
      if (!leg.seatSelectable) continue;
      const choice = seatByLeg.get(leg.order);
      if (!choice || choice.provider !== leg.provider) {
        throw new BadRequestException(
          `Kursi wajib dipilih untuk leg ${leg.order} (${leg.name}, penyedia ${leg.provider}).`,
        );
      }
    }

    // 1. Tahan kursi di semua penyedia; rollback bila ada yang gagal.
    const held: { leg: RouteLeg; seats: string[] }[] = [];
    for (const leg of route.legs) {
      const seats = leg.seatSelectable
        ? (seatByLeg.get(leg.order) ? [seatByLeg.get(leg.order)!.seat] : [])
        : [];
      const result = await this.registry.get(leg.provider).holdSeats({
        serviceKey: leg.serviceKey,
        seats,
        holdMinutes: HOLD_MINUTES,
      });
      if (!result.ok) {
        await Promise.all(
          held.map((h) =>
            this.registry.get(h.leg.provider).cancel({ serviceKey: h.leg.serviceKey, seats: h.seats }),
          ),
        );
        throw new ConflictException({
          message: `Gagal menahan kursi pada ${leg.name}: ${result.reason}`,
          failedProvider: leg.provider,
          alternatives: this.engine
            .alternativesFor(route)
            .slice(0, 3)
            .map((a) => a.id),
        });
      }
      held.push({ leg, seats: result.heldSeats });
    }

    // 2. Semua tertahan → simpan booking pending_payment dalam satu transaksi.
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    const booking = await this.prisma.$transaction(
      async (tx) => {
      const created = await tx.booking.create({
        data: {
          userId,
          routeId: route.id,
          passengers,
          status: 'pending_payment',
          totalPrice: route.totalPrice * passengers,
          idempotencyKey: dto.idempotencyKey,
          holdExpiresAt,
          legs: {
            create: route.legs.map((leg) => ({
              provider: leg.provider,
              status: 'held',
              seat: seatByLeg.get(leg.order)?.seat ?? null,
              serviceKey: leg.serviceKey,
              label: leg.name,
              fromLabel: leg.from,
              toLabel: leg.to,
              price: leg.price * passengers,
              departAt: toDateTime(date, leg.departure),
              arriveAt: toDateTime(date, leg.arrival),
              seatHolds: seatByLeg.get(leg.order)
                ? {
                    create: {
                      seat: seatByLeg.get(leg.order)!.seat,
                      expiresAt: holdExpiresAt,
                    },
                  }
                : undefined,
            })),
          },
        },
        include: { legs: true },
      });
      return created;
      },
      // Neon free: compute tidur (scale-to-zero) — bangun compute bisa > 2s,
      // default maxWait Prisma menyebabkan "Transaction not found".
      { maxWait: 15_000, timeout: 20_000 },
    );

    return this.serialize(booking);
  }

  /**
   * Bayar sekali → terbitkan tiket tiap leg (idempotent).
   * simulateLegFailure dipakai untuk demo kegagalan sebagian (PRD bagian 7).
   */
  async pay(id: string, dto: PayBookingDto) {
    let booking = await this.loadWithCheckExpiry(id);
    if (booking.status === 'expired') throw new ConflictException('Batas waktu pembayaran habis.');
    if (booking.status !== 'pending_payment') {
      if (booking.status === 'confirmed') return this.serialize(booking); // sudah dibayar
      throw new ConflictException(`Status booking ${booking.status} tidak bisa dibayar.`);
    }

    await this.prisma.booking.update({ where: { id }, data: { status: 'processing' } });
    const user = await this.prisma.user.findUnique({ where: { id: booking.userId } });

    let anyFailed = false;
    for (const leg of booking.legs) {
      const provider = this.registry.get(leg.provider);
      const simulateFail = dto.simulateLegFailure && dto.simulateLegFailure === leg.provider;
      if (simulateFail) {
        await provider.cancel({ serviceKey: leg.serviceKey, seats: leg.seat ? [leg.seat] : [] });
        await this.prisma.bookingLeg.update({
          where: { id: leg.id },
          data: { status: 'failed', seat: null },
        });
        anyFailed = true;
        continue;
      }
      const result = await provider.issueTicket({
        serviceKey: leg.serviceKey,
        seats: leg.seat ? [leg.seat] : [],
        passengerName: user?.name ?? 'Penumpang',
        idempotencyKey: `${booking.idempotencyKey}:${leg.id}`,
      });
      if (result.ok && result.ticketCode) {
        await this.prisma.bookingLeg.update({
          where: { id: leg.id },
          data: { status: 'issued', ticketCode: result.ticketCode },
        });
      } else {
        await this.prisma.bookingLeg.update({ where: { id: leg.id }, data: { status: 'failed' } });
        anyFailed = true;
      }
    }

    const finalStatus = anyFailed ? 'partially_failed' : 'confirmed';
    await this.prisma.booking.update({
      where: { id },
      data: { status: finalStatus, holdExpiresAt: null },
    });
    if (!anyFailed) {
      await this.prisma.seatHold.deleteMany({ where: { leg: { bookingId: id } } });
    }

    booking = await this.load(id);
    const serialized = this.serialize(booking);
    if (finalStatus === 'partially_failed') {
      const route = this.engine.reconstruct(booking.routeId);
      serialized.alternatives = route
        ? this.engine.alternativesFor(route).slice(0, 3).map((a) => a.id)
        : [];
      serialized.message =
        'Sebagian leg gagal terbit. Penumpang ditawari rute alternatif; leg lain tetap valid.';
    }
    return serialized;
  }

  async cancel(id: string) {
    const booking = await this.load(id);
    if (['cancelled', 'expired'].includes(booking.status)) return this.serialize(booking);
    for (const leg of booking.legs) {
      if (leg.status === 'issued') {
        await this.registry.get(leg.provider).cancel({
          serviceKey: leg.serviceKey,
          seats: leg.seat ? [leg.seat] : [],
          ticketCode: leg.ticketCode ?? undefined,
        });
        await this.prisma.bookingLeg.update({ where: { id: leg.id }, data: { status: 'refunded' } });
      } else if (leg.status === 'held') {
        await this.registry.get(leg.provider).cancel({
          serviceKey: leg.serviceKey,
          seats: leg.seat ? [leg.seat] : [],
        });
        await this.prisma.bookingLeg.update({ where: { id: leg.id }, data: { status: 'failed' } });
      }
    }
    await this.prisma.seatHold.deleteMany({ where: { leg: { bookingId: id } } });
    await this.prisma.booking.update({ where: { id }, data: { status: 'cancelled' } });
    return this.serialize(await this.load(id));
  }

  async detail(id: string) {
    return this.serialize(await this.loadWithCheckExpiry(id));
  }

  /** Tab Sedang berjalan vs Riwayat (PRD: confirmed & belum selesai = berjalan;
   *  partially_failed / pending selalu aktif karena butuh tindakan user). */
  async forUser(userId: string, filter: 'active' | 'history') {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: { legs: { orderBy: { departAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    const needsAttention = ['pending_payment', 'processing', 'partially_failed'];
    const isActive = (b: (typeof bookings)[number]) =>
      needsAttention.includes(b.status) ||
      (b.status === 'confirmed' && b.legs.some((l) => new Date(l.arriveAt).getTime() >= now));
    const picked = bookings.filter((b) => (filter === 'active' ? isActive(b) : !isActive(b)));
    return picked.map((b) => this.serialize(b));
  }

  /** Simpan/ubah pilihan kursi satu leg sebelum bayar (hanya saat pending_payment). */
  async saveSeat(id: string, body: { legOrder: number; provider: string; seat: string }) {
    const booking = await this.loadWithCheckExpiry(id);
    if (booking.status !== 'pending_payment') {
      throw new ConflictException('Kursi hanya bisa diubah sebelum pembayaran.');
    }
    const legs = [...booking.legs].sort((a, b) => a.departAt.getTime() - b.departAt.getTime());
    const leg = legs.find((l) => l.provider === body.provider);
    if (!leg) throw new NotFoundException(`Leg ${body.provider} tidak ada di booking ini.`);
    const result = await this.registry.get(leg.provider).holdSeats({
      serviceKey: leg.serviceKey,
      seats: [body.seat],
      holdMinutes: HOLD_MINUTES,
    });
    if (!result.ok) throw new ConflictException(result.reason ?? 'Kursi tidak tersedia.');
    await this.prisma.$transaction([
      this.prisma.seatHold.deleteMany({ where: { legId: leg.id } }),
      this.prisma.bookingLeg.update({ where: { id: leg.id }, data: { seat: body.seat } }),
      this.prisma.seatHold.create({
        data: { legId: leg.id, seat: body.seat, expiresAt: booking.holdExpiresAt ?? new Date() },
      }),
    ]);
    return this.serialize(await this.load(id));
  }

  /** expired dicek saat dibaca (tanpa cron — cukup untuk hackathon). */
  private async loadWithCheckExpiry(id: string) {
    const booking = await this.load(id);
    if (
      booking.status === 'pending_payment' &&
      booking.holdExpiresAt &&
      booking.holdExpiresAt.getTime() < Date.now()
    ) {
      for (const leg of booking.legs) {
        if (leg.status === 'held') {
          await this.registry
            .get(leg.provider)
            .cancel({ serviceKey: leg.serviceKey, seats: leg.seat ? [leg.seat] : [] });
        }
      }
      await this.prisma.seatHold.deleteMany({ where: { leg: { bookingId: id } } });
      await this.prisma.booking.update({ where: { id }, data: { status: 'expired' } });
      return this.load(id);
    }
    return booking;
  }

  private load(id: string) {
    return this.prisma.booking
      .findUnique({ where: { id }, include: { legs: { orderBy: { departAt: 'asc' } } } })
      .then((b) => {
        if (!b) throw new NotFoundException(`Booking ${id} tidak ditemukan.`);
        return b;
      });
  }

  private serialize(b: Awaited<ReturnType<BookingService['load']>>): BookingView {
    return {
      status: b.status,
      booking: {
        id: b.id,
        routeId: b.routeId,
        passengers: b.passengers,
        totalPrice: b.totalPrice,
        holdExpiresAt: b.holdExpiresAt,
        createdAt: b.createdAt,
      },
      legs: b.legs.map((l) => ({
        order: undefined, // urutan sudah tercermin dari departAt
        provider: l.provider,
        name: l.label,
        status: l.status,
        ticketCode: l.ticketCode,
        seat: l.seat,
        price: l.price,
        from: l.fromLabel,
        to: l.toLabel,
        departure: l.departAt,
        arrival: l.arriveAt,
      })),
    };
  }
}
