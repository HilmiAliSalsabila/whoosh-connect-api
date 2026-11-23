import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TransportService } from './transport.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('transport')
export class TransportController {
  constructor(private readonly service: TransportService) {}

  @Get('options')
  options(
    @Query('fromStation') fromStation: string,
    @Query('destination') destination?: string,
    @Query('transitStation') transitStation?: string,
  ) {
    void transitStation;
    return this.service.options(fromStation, destination);
  }

  @UseGuards(JwtAuthGuard)
  @Post('taxi/book')
  bookTaxi(
    @CurrentUser() user: AuthUser,
    @Body() body: { station: string; destination: string; time: string; mode?: string },
  ) {
    return this.service.bookTaxi(user.userId, body);
  }
}
