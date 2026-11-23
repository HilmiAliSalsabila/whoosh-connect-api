/**
 * Kontrak setiap penyedia transportasi (PRD bagian 8).
 * Adapter tidak menyentuh database — BookingService yang menyimpan hasilnya.
 * Mengganti mock ke API asli tidak mengubah skema tabel.
 */

export interface HoldRequest {
  serviceKey: string;
  seats: string[];
  holdMinutes: number;
}

export interface HoldResult {
  ok: boolean;
  heldSeats: string[];
  reason?: string;
}

export interface IssueRequest {
  serviceKey: string;
  seats: string[];
  passengerName: string;
  idempotencyKey: string;
}

export interface IssueResult {
  ok: boolean;
  ticketCode?: string;
  reason?: string;
}

export interface CancelRequest {
  serviceKey: string;
  seats: string[];
  ticketCode?: string;
}

export interface TravelProvider {
  /** whoosh | kai | bus | travel | shuttle | taxi | feeder */
  readonly id: string;
  holdSeats(req: HoldRequest): Promise<HoldResult>;
  issueTicket(req: IssueRequest): Promise<IssueResult>;
  cancel(req: CancelRequest): Promise<void>;
}

export const PROVIDERS_TOKEN = 'PROVIDERS';
