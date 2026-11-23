import { Module } from '@nestjs/common';
import { ScheduleDataService } from './schedule-data.service';
import { RouteEngineService } from './route-engine.service';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';

@Module({
  controllers: [RoutesController],
  providers: [ScheduleDataService, RouteEngineService, RoutesService],
  exports: [RouteEngineService, ScheduleDataService],
})
export class RoutesModule {}
