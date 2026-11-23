import { Injectable } from '@nestjs/common';
import stations from '../data/stations.json';
import whooshTrips from '../data/whoosh-trips.json';
import feederTrips from '../data/feeder-trips.json';
import onward from '../data/onward-services.json';
import lastMile from '../data/last-mile.json';

export interface WhooshTrip {
  serviceKey: string;
  name: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  price: number;
  class?: string;
}

export interface FeederTrip {
  serviceKey: string;
  name: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
}

export interface OnwardService {
  serviceKey: string;
  name: string;
  mode: string;
  provider: string;
  operator: string;
  to: string;
  toLabel: string;
  doorToDoor?: boolean;
  class?: string;
  departure: string;
  arrival: string;
  price: number;
  bufferMin: number;
}

export interface LastMileOption {
  mode: string;
  provider: string;
  operator: string;
  price: number;
  durationMin: number;
}

export interface Station {
  id: string;
  name: string;
  city: string;
  hub?: boolean;
}

/**
 * Pembaca data mentah JSON (PRD bagian 5 & Route Engine).
 * Tujuan baru (mis. Tasikmalaya) cukup menambah data di onward-services.json,
 * tanpa mengubah kode engine.
 */
@Injectable()
export class ScheduleDataService {
  /** Kota → stasiun Whoosh asal yang dilayani. */
  private readonly originByCity: Record<string, string> = {
    Jakarta: 'HLM',
    Karawang: 'KRW',
    'Bandung Barat': 'PDL',
    Bandung: 'TGL',
  };

  /** Kota tujuan → simpul turun yang dianggap sampai di kota itu. */
  private readonly destNodesByCity: Record<string, string[]> = {
    Garut: ['GRT', 'GARKOTA', 'TGR', 'POOL'],
  };

  readonly stations: Station[] = (stations as { stations: Station[] }).stations;
  readonly whooshTrips: WhooshTrip[] = (whooshTrips as { trips: WhooshTrip[] }).trips;
  readonly feederTrips: FeederTrip[] = (feederTrips as { feeders: FeederTrip[] }).feeders;
  readonly feederNote: string = (feederTrips as { note: string }).note;
  readonly hubs: Record<string, OnwardService[]> = (
    onward as { hubs: Record<string, OnwardService[]> }
  ).hubs;
  readonly drops: Record<string, { label: string; options: LastMileOption[] }> = (
    lastMile as { drops: Record<string, { label: string; options: LastMileOption[] }> }
  ).drops;

  stationLabel(id: string): string {
    const s = this.stations.find((x) => x.id === id);
    if (!s) return id;
    return s.city && s.city !== s.name ? `${s.name}, ${s.city}` : s.name;
  }

  resolveOrigin(cityOrStation: string): string | null {
    const up = cityOrStation.charAt(0).toUpperCase() + cityOrStation.slice(1);
    return this.originByCity[up] ?? (this.stations.some((s) => s.id === cityOrStation.toUpperCase()) ? cityOrStation.toUpperCase() : null);
  }

  destNodes(city: string): string[] {
    const up = city.charAt(0).toUpperCase() + city.slice(1);
    return this.destNodesByCity[up] ?? [city.toUpperCase()];
  }

  isKnownDestination(city: string): boolean {
    const up = city.charAt(0).toUpperCase() + city.slice(1);
    return up in this.destNodesByCity;
  }

  /** Simpul turun → kota tujuan (mis. TGR → Garut). Untuk Plan B/alternatif. */
  cityOfNode(node: string): string {
    for (const [city, nodes] of Object.entries(this.destNodesByCity)) {
      if (nodes.includes(node)) return city;
    }
    return node;
  }
}
