import { Module } from '@nestjs/common';
import { PlanBController } from './plan-b.controller';
import { PlanBService } from './plan-b.service';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [RoutesModule],
  controllers: [PlanBController],
  providers: [PlanBService],
})
export class PlanBModule {}
