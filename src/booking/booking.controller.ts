import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto, PayBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('booking')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Post('create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.service.create(user.userId, dto);
  }

  // Path statis sebelum ':id'
  @Get('user/:userId')
  forUser(@Param('userId') userId: string, @Query('status') status: 'active' | 'history') {
    return this.service.forUser(userId, status ?? 'active');
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body() dto: PayBookingDto) {
    return this.service.pay(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/seats')
  saveSeat(
    @Param('id') id: string,
    @Body() body: { legOrder: number; provider: string; seat: string },
  ) {
    return this.service.saveSeat(id, body);
  }
}
