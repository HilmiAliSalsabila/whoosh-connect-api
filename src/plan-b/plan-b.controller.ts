import { Controller, Get, Query } from '@nestjs/common';
import { PlanBService } from './plan-b.service';

@Controller('plan-b')
export class PlanBController {
  constructor(private readonly service: PlanBService) {}

  /** Skor risiko per leg + tawaran Plan B untuk satu rute. */
  @Get()
  report(@Query('routeId') routeId: string) {
    return this.service.report(routeId);
  }
}
