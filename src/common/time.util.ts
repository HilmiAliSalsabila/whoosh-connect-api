/** Utilitas waktu: jadwal disimpan sebagai "HH:MM" satu hari layanan. */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Durasi "3j 40m" seperti di PRD. */
export function formatDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}j ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** DateTime untuk kolom Prisma; tanggal ISO + jam "HH:MM" (asumsi hari yang sama). */
export function toDateTime(dateIso: string, hhmm: string): Date {
  return new Date(`${dateIso.slice(0, 10)}T${hhmm}:00`);
}
