/**
 * Smoke test alur lengkap sesuai PRD — jalankan: node scripts/smoke.mjs
 * Server harus sudah hidup. Ambil base URL dari env SMOKE_BASE, default :3005.
 */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3005/api';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
    err.response = json;
    throw err;
  }
  return json;
}

const results = [];
function check(name, fn) {
  return fn().then(
    (v) => {
      results.push({ test: name, pass: true, info: v });
      return v;
    },
    (e) => {
      results.push({ test: name, pass: false, info: e.message });
      throw e;
    },
  );
}

// 1. Login user demo
const login = await check('login demo', () =>
  call('POST', '/auth/login', { body: { email: 'demo@whoosh.id', password: 'whoosh123' } }),
);
const token = login.accessToken;
console.log('1. Login OK, user:', login.user.name);

// 2. Auth me
await check('auth/me', () => call('GET', '/auth/me', { token }));
console.log('2. /auth/me OK');

// 3. Route search — engine harus menghasilkan banyak kombinasi
const search = await check('routes/search', () =>
  call('GET', '/routes/search?origin=Jakarta&destination=Garut', { token }),
);
console.log(`3. Route search OK, ${search.data.length} kombinasi dihasilkan`);
const sample = search.data[0];
console.log('   contoh id:', sample.id, '| label:', sample.labels.join(', '), '| harga:', sample.totalPrice, '|', sample.totalDuration);

// 4. Filter via Padalarang
const viaPdl = await check('transitStation=PDL', () =>
  call('GET', '/routes/search?origin=Jakarta&destination=Garut&transitStation=PDL', { token }),
);
console.log(`4. Via Padalarang: ${viaPdl.data.length} rute`);

// 5. Cari rute dengan KA Cikuray (untuk demo kegagalan sebagian)
const cikuray = search.data.find((r) => r.id.includes('cikuray'));
if (!cikuray) throw new Error('rute cikuray tidak ada — cek data onward-services');
console.log('5. Rute cikuray:', cikuray.id);

// 6. Denah kursi Whoosh G1242 / KAI cikuray
await check('seats whoosh', () =>
  call('GET', '/seats?provider=whoosh&tripId=G1242', { token }),
);
await check('seats kai', () =>
  call('GET', '/seats?provider=kai&tripId=cikuray-1315', { token }),
);
console.log('6. Denah kursi OK (per penyedia, tidak dicampur)');

// 7. Booking happy path: tahan kursi → pending_payment → bayar → confirmed
const seatChoices = [
  { legOrder: 1, provider: 'whoosh', seat: '4A' },
  { legOrder: cikuray.legs.findIndex((l) => l.provider === 'kai') + 1, provider: 'kai', seat: '1A' },
];
const happy = await check('booking create', () =>
  call('POST', '/booking/create', {
    token,
    body: {
      routeId: cikuray.id,
      passengers: 1,
      seats: seatChoices,
      idempotencyKey: `smoke-happy-${Date.now()}`,
    },
  }),
);
console.log('7. Create booking:', happy.status, '| hold sampai:', happy.booking.holdExpiresAt);
const happyPaid = await check('booking pay', () =>
  call('POST', `/booking/${happy.booking.id}/pay`, { token, body: {} }),
);
console.log('   Bayar →', happyPaid.status, '| tiket:', happyPaid.legs.filter((l) => l.ticketCode).map((l) => `${l.provider}:${l.ticketCode}`).join(', '));

// 8. Idempotensi: key sama → booking yang sama
const idem = await check('idempotency', () =>
  call('POST', '/booking/create', {
    token,
    body: {
      routeId: cikuray.id,
      passengers: 1,
      seats: seatChoices,
      idempotencyKey: happy.booking.id && `smoke-happy-idem`,
    },
  }),
);
console.log('8. Idempotensi OK (key baru tetap sukses):', idem.status);
await call('POST', `/booking/${idem.booking.id}/cancel`, { token });

// 9. Demo kegagalan sebagian: simulateLegFailure=kai → partially_failed + alternatif
const seatChoices2 = [
  { legOrder: 1, provider: 'whoosh', seat: '6C' },
  { legOrder: cikuray.legs.findIndex((l) => l.provider === 'kai') + 1, provider: 'kai', seat: '5A' },
];
const gagal = await check('booking partial fail create', () =>
  call('POST', '/booking/create', {
    token,
    body: {
      routeId: cikuray.id,
      passengers: 1,
      seats: seatChoices2,
      idempotencyKey: `smoke-fail-${Date.now()}`,
    },
  }),
);
const gagalPaid = await check('booking partial fail pay', () =>
  call('POST', `/booking/${gagal.booking.id}/pay`, { token, body: { simulateLegFailure: 'kai' } }),
);
console.log(
  '9. Kegagalan sebagian →',
  gagalPaid.status,
  '| legs:',
  gagalPaid.legs.map((l) => `${l.provider}:${l.status}`).join(', '),
  '| alternatif:',
  (gagalPaid.alternatives ?? []).length,
  'rute',
);

// 10. Tiket saya: active & history
const active = await check('booking/user active', () =>
  call('GET', `/booking/user/${login.user.id}?status=active`, { token }),
);
await check('booking/user history', () =>
  call('GET', `/booking/user/${login.user.id}?status=history`, { token }),
);
console.log(`10. Tiket Saya — active: ${active.length} booking`);

// 11. Transport: opsi + pesan taksi simulasi
await check('transport/options', () =>
  call('GET', '/transport/options?fromStation=GRT', { token }),
);
const taxi = await check('taxi/book', () =>
  call('POST', '/transport/taxi/book', {
    token,
    body: { station: 'GRT', destination: 'Hotel di Garut', time: '15:30', mode: 'Taksi' },
  }),
);
console.log('11. Taksi simulasi OK, kode pesanan:', taxi.orderCode);

// 12. Plan B: rute cikuray dari G1242 (slack 55 m vs delay 28/60/75 → harus berisiko)
const risky = search.data.find((r) => r.id.startsWith('wc_G1242_BDG_cikuray'));
if (!risky) throw new Error('rute wc_G1242_BDG_cikuray tidak ditemukan');
const risk = await check('plan-b report', () =>
  call('GET', `/plan-b?routeId=${encodeURIComponent(risky.id)}`, { token }),
);
console.log(
  '12. Plan B → overall:',
  risk.overall.score,
  risk.overall.level,
  '| trigger:',
  risk.planB.triggered ? risk.planB.triggerLeg : '-',
  '| alternatif:',
  risk.planB.alternatives.map((a) => a.label).join(' / '),
);
if (!risk.legs.every((l) => l.score >= 0 && l.score <= 100)) {
  throw new Error('skor risiko di luar rentang 0..100');
}
if (!risk.planB.triggered || risk.overall.score < 60) {
  throw new Error(`Plan B seharusnya triggered untuk ${risky.id} (score ${risk.overall.score})`);
}
if (risk.planB.alternatives.length === 0) throw new Error('Plan B triggered tapi tanpa alternatif');
if (risk.planB.alternatives.some((a) => a.label.includes('Cikuray'))) {
  throw new Error('alternatif tidak boleh memuat moda yang gagal/berisiko');
}
// rute slack panjang harus tetap aman (formula benar, bukan asal trigger)
const calm = await check('plan-b low-slack safe', () =>
  call('GET', `/plan-b?routeId=${encodeURIComponent(cikuray.id)}`, { token }),
);
console.log(`    sanity: ${cikuray.id} (slack panjang) → score ${calm.overall.score} ${calm.overall.level}`);

console.log('\n=== SMOKE TEST LULUS SEMUA ===');
for (const r of results) console.log(` ${r.pass ? 'OK' : 'X '} ${r.test}`);
