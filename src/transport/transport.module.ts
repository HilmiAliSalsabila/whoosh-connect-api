import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [RoutesModule],
  controllers: [TransportController],
  providers: [TransportService],
})
export class TransportModule {}
