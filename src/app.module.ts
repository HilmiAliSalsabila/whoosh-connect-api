import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { AuthModule } from './auth/auth.module';
import { RoutesModule } from './routes/routes.module';
import { BookingModule } from './booking/booking.module';
import { SeatsModule } from './seats/seats.module';
import { TransportModule } from './transport/transport.module';
import { PlanBModule } from './plan-b/plan-b.module';

@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    AuthModule,
    RoutesModule,
    BookingModule,
    SeatsModule,
    TransportModule,
    PlanBModule,
  ],
})
export class AppModule {}
