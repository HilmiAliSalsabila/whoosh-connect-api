import { Injectable, NotFoundException } from '@nestjs/common';
import { RouteEngineService, RouteOption } from './route-engine.service';
import { ScheduleDataService } from './schedule-data.service';
import { SearchRoutesDto } from './dto/search-routes.dto';

@Injectable()
export class RoutesService {
  constructor(
    private readonly engine: RouteEngineService,
    private readonly data: ScheduleDataService,
  ) {}

  search(q: SearchRoutesDto): { status: string; data: RouteOption[] } {
    let results = this.engine.search({
      origin: q.origin,
      destination: q.destination,
      date: q.date,
      transitStation: q.transitStation,
      sort: q.sort,
    });
    if (q.mode) {
      results = results.filter((r) =>
        r.legs.some((l) => l.provider === q.mode || l.mode.toLowerCase().includes(q.mode!)),
      );
    }
    return { status: 'success', data: results };
  }

  /** Detail per id; pencarian ulang combos memakai kota dari query string. */
  detail(id: string, q: SearchRoutesDto): RouteOption {
    const found = this.engine.search(q).find((r) => r.id === id);
    if (!found) throw new NotFoundException(`Rute ${id} tidak ditemukan untuk kueri ini.`);
    return found;
  }

  stations() {
    return { status: 'success', data: this.data.stations };
  }
}
