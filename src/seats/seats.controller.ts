import { Controller, Get, Query } from '@nestjs/common';
import { SeatsService } from './seats.service';

@Controller('seats')
export class SeatsController {
  constructor(private readonly service: SeatsService) {}

  /** Denah dan kursi terisi untuk satu leg. provider: whoosh | kai | travel | bus */
  @Get()
  availability(@Query('provider') provider: string, @Query('tripId') tripId: string) {
    return this.service.availability(provider, tripId);
  }
}
