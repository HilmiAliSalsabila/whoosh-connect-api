import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SeatChoiceDto {
  @IsInt()
  legOrder!: number;

  @IsString()
  provider!: string;

  @IsString()
  seat!: string;
}

export class CreateBookingDto {
  @IsString()
  routeId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  passengers?: number;

  /** Kursi per leg; satu layar per penyedia di aplikasi. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatChoiceDto)
  seats?: SeatChoiceDto[];

  /** Unik per percobaan booking; mencegah tagihan ganda saat retry. */
  @IsString()
  idempotencyKey!: string;
}

export class PayBookingDto {
  /**
   * Demo kegagalan sebagian (PRD bagian 7): nama penyedia yang dibuat gagal
   * terbit, mis. "kai". Kosongkan untuk happy path.
   */
  @IsOptional()
  @IsString()
  simulateLegFailure?: string;
}
