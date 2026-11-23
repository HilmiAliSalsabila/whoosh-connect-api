import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [RoutesModule],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
