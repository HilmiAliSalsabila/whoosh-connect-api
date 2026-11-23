import * as seatData from '../../data/seat-layouts.json';
import {
  TravelProvider,
  HoldRequest,
  HoldResult,
  IssueRequest,
  IssueResult,
  CancelRequest,
} from '../provider.interface';

/**
 * Mock adapter: kursi "terisi" dibaca dari src/data/seat-layouts.json.
 * issueTicket selalu sukses dan menerbitkan kode dengan prefix khas penyedia.
 * Kelas ini TIDAK menyentuh database; persistensi done by BookingService.
 */
export class MockProvider implements TravelProvider {
  constructor(
    readonly id: string,
    private readonly codePrefix: string,
  ) {}

  async holdSeats(req: HoldRequest): Promise<HoldResult> {
    const occupied: string[] = (seatData.occupied as Record<string, string[]>)[req.serviceKey] ?? [];
    const taken = req.seats.filter((s) => occupied.includes(s));
    if (taken.length > 0) {
      return { ok: false, heldSeats: [], reason: `Kursi sudah terisi: ${taken.join(', ')}` };
    }
    return { ok: true, heldSeats: req.seats };
  }

  async issueTicket(req: IssueRequest): Promise<IssueResult> {
    const serial = Math.floor(1000 + Math.random() * 9000);
    return {
      ok: true,
      ticketCode: `${this.codePrefix}-${req.serviceKey.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${serial}`,
    };
  }

  async cancel(_req: CancelRequest): Promise<void> {
    // mock: selalu berhasil dibatalkan
  }
}

export const MOCK_WHOOSH = new MockProvider('whoosh', 'WSH');
export const MOCK_FEEDER = new MockProvider('feeder', 'FDR');
export const MOCK_KAI = new MockProvider('kai', 'KAI');
export const MOCK_BUS = new MockProvider('bus', 'DAM');
export const MOCK_TRAVEL = new MockProvider('travel', 'TRV');
export const MOCK_SHUTTLE = new MockProvider('shuttle', 'SHT');
export const MOCK_TAXI = new MockProvider('taxi', 'TX');

export const ALL_MOCK_PROVIDERS: TravelProvider[] = [
  MOCK_WHOOSH,
  MOCK_FEEDER,
  MOCK_KAI,
  MOCK_BUS,
  MOCK_TRAVEL,
  MOCK_SHUTTLE,
  MOCK_TAXI,
];
