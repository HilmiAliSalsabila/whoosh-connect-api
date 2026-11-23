# Whoosh Connect API

Backend multi-modal booking untuk **Whoosh Connect** (Hackathon KCIC) — merekomendasikan rute Jakarta→Garut lintas moda (Whoosh, Feeder, KAI, Bus, Travel, Shuttle, taksi simulasi) dan memesan semuanya dalam satu booking. Dibangun sesuai PRD: NestJS + Prisma/SQLite + JWT, dengan Route Engine yang merangkai kombinasi jadwal dari data mentah JSON.

## Run

```bash
npm ci
cp .env.example .env      # isi nilai lokal; JWT_SECRET wajib diganti di produksi
npx prisma migrate dev    # buat tabel SQLite + generate client + seed otomatis
npm run start:dev         # http://localhost:3000/api
```

User demo hasil seed: `demo@whoosh.id` / `whoosh123`.

## Verify

```bash
npm run check             # typecheck + build
node scripts/smoke.mjs    # uji end-to-end semua endpoint (server harus hidup; SMOKE_BASE utk port lain)
```

Reset DB sebelum demo: `npx prisma migrate reset --force`.

## Layout

```
src/auth        register/login/me, JWT + Passport
src/routes      Route Engine + schedule data (kombinasi otomatis, label, filter)
src/booking     status machine multi-leg, hold kursi, idempotency, pay simulasi
src/seats       denah kursi per penyedia (tidak dicampur)
src/transport   opsi moda lanjutan + taksi simulasi
src/providers   kontrak TravelProvider + adapter mock (ganti ke API real via .env)
src/data        jadwal mentah JSON (tambah kota cukup di sini, engine tidak berubah)
prisma/         schema (User, Booking, BookingLeg, SeatHold, DelayHistory) + seed
```

## Catatan

- `PROVIDER_MODE=mock|real` di `.env`; adapter real kerangka di `src/providers/real`.
- Kegagalan sebagian untuk demo: `POST /booking/:id/pay` dengan `{"simulateLegFailure":"kai"}`.
- Port 3000 bentrok di mesin dev → pakai `PORT=3005` di `.env`.
