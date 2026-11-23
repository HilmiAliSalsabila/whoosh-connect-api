import { Module, Global, Provider } from '@nestjs/common';
import { PROVIDERS_TOKEN, TravelProvider } from './provider.interface';
import { ALL_MOCK_PROVIDERS } from './mock/mock-providers';

/**
 * Registry penyedia. Pilih mock atau real dari .env (PROVIDER_MODE=mock|real),
 * bisa per penyedia (mis. WHOOSH_MODE=real, KAI_MODE=mock).
 * Kerangka real ada di folder ./real — diisi ketika API key mitra tersedia.
 */
export class ProviderRegistry {
  private readonly map: Map<string, TravelProvider>;

  constructor(providers: TravelProvider[]) {
    this.map = new Map(providers.map((p) => [p.id, p]));
  }

  get(providerId: string): TravelProvider {
    const p = this.map.get(providerId);
    if (!p) throw new Error(`Penyedia tidak dikenal: ${providerId}`);
    return p;
  }
}

const registryProvider: Provider = {
  provide: ProviderRegistry,
  useFactory: () => {
    // TODO API asli: ganti daftar di bawah dengan adapter dari ./real sesuai env per penyedia.
    if (process.env.PROVIDER_MODE === 'real') {
      // Belum tersedia; fallback ke mock supaya demo tetap jalan.
      // Ganti: return new ProviderRegistry([new RealWhooshProvider(...), ...]);
    }
    return new ProviderRegistry(ALL_MOCK_PROVIDERS);
  },
};

@Global()
@Module({
  providers: [registryProvider, { provide: PROVIDERS_TOKEN, useExisting: ProviderRegistry }],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
