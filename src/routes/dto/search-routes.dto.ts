import { IsOptional, IsString } from 'class-validator';

export class SearchRoutesDto {
  @IsString()
  origin!: string;

  @IsString()
  destination!: string;

  @IsOptional()
  @IsString()
  date?: string;

  /** PDL | BDG */
  @IsOptional()
  @IsString()
  transitStation?: string;

  /** earliest | fastest | cheapest */
  @IsOptional()
  @IsString()
  sort?: 'earliest' | 'fastest' | 'cheapest';

  /** filter moda lanjutan: train, bus, travel, shuttle */
  @IsOptional()
  @IsString()
  mode?: string;
}
