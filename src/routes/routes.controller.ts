import { Controller, Get, Param, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { SearchRoutesDto } from './dto/search-routes.dto';

@Controller('routes')
export class RoutesController {
  constructor(private readonly service: RoutesService) {}

  // Deklarasi path statis sebelum ':id' agar tidak tertangkap parameter.
  @Get('search')
  search(@Query() q: SearchRoutesDto) {
    return this.service.search(q);
  }

  @Get('stations')
  stations() {
    return this.service.stations();
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query() q: SearchRoutesDto) {
    return { status: 'success', data: this.service.detail(id, q) };
  }
}
