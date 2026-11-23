import {
  TravelProvider,
  HoldRequest,
  HoldResult,
  IssueRequest,
  IssueResult,
  CancelRequest,
} from '../provider.interface';

/**
 * Kerangka adapter API asli. Diaktifkan lewat .env (PROVIDER_MODE=real atau
 * mis. WHOOSH_MODE=real) begitu API key mitra tersedia. Kunci API dibaca dari
 * environment, JANGAN ditulis di file ini.
 */
export abstract class RealProviderBase implements TravelProvider {
  constructor(
    readonly id: string,
    protected readonly baseUrl: string,
    protected readonly apiKey: string,
  ) {}

  abstract holdSeats(req: HoldRequest): Promise<HoldResult>;
  abstract issueTicket(req: IssueRequest): Promise<IssueResult>;
  abstract cancel(req: CancelRequest): Promise<void>;
}

export class RealWhooshProvider extends RealProviderBase {
  override readonly id = 'whoosh';
  async holdSeats(_req: HoldRequest): Promise<HoldResult> {
    throw new Error('Belum diimplementasikan — tunggu API key KCIC.');
  }
  async issueTicket(_req: IssueRequest): Promise<IssueResult> {
    throw new Error('Belum diimplementasikan — tunggu API key KCIC.');
  }
  async cancel(_req: CancelRequest): Promise<void> {
    throw new Error('Belum diimplementasikan — tunggu API key KCIC.');
  }
}
