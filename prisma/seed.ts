/**
 * Seed demo (PRD bagian 8 langkah 5): user demo + riwayat keterlambatan simulasi.
 * Jalankan: npx prisma db seed  |  reset: npx prisma migrate reset --force
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('whoosh123', 10);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@whoosh.id' },
    update: {},
    create: { email: 'demo@whoosh.id', name: 'Penumpang Demo', passwordHash },
  });
  console.log('User demo:', demo.email, '(password: whoosh123)');

  // Riwayat keterlambatan simulasi — hanya untuk skor risiko Plan B.
  const delays = [
    { provider: 'whoosh', routeKey: 'HLM-PDL', hour: 7, delayMinutes: 2 },
    { provider: 'whoosh', routeKey: 'HLM-PDL', hour: 11, delayMinutes: 5 },
    { provider: 'whoosh', routeKey: 'HLM-PDL', hour: 15, delayMinutes: 8 },
    { provider: 'kai', routeKey: 'BDG-PDL', hour: 13, delayMinutes: 35 }, // Cikuray rawan delay
    { provider: 'kai', routeKey: 'BDG-GRT', hour: 13, delayMinutes: 28 },
    { provider: 'kai', routeKey: 'BDG-GRT', hour: 13, delayMinutes: 60 }, // sering lewat kelonggaran transit
    { provider: 'kai', routeKey: 'BDG-GRT', hour: 13, delayMinutes: 75 },
    { provider: 'bus', routeKey: 'BDG-GRT', hour: 14, delayMinutes: 12 },
  ];
  const existing = await prisma.delayHistory.count();
  if (existing === 0) {
    const count = await prisma.delayHistory.createMany({ data: delays });
    console.log('DelayHistory masuk:', count, 'baris');
  } else {
    console.log('DelayHistory sudah ada:', existing, 'baris — seed dilewati');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
