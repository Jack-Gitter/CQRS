import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsPositive, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateAirplaneDto {
  @ApiProperty({ example: 'N320XY', description: '3-10 alphanumeric characters, stored upper-cased' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,10}$/)
  tailNumber: string;

  @ApiProperty({ example: 'Airbus A320' })
  @IsString()
  @Length(2, 60)
  model: string;

  @ApiProperty({ example: 120, description: 'Economy fare; first class is 2.5x' })
  @IsNumber()
  @IsPositive()
  baseTicketPrice: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  rows: number;

  @ApiProperty({ example: 6, minimum: 1, maximum: 10, description: 'Seats are lettered A-K (no I)' })
  @IsInt()
  @Min(1)
  @Max(10)
  seatsPerRow: number;

  @ApiProperty({ example: 1, minimum: 0, description: 'Leading rows that are FIRST class' })
  @IsInt()
  @Min(0)
  @Max(60)
  firstClassRows: number;
}

export class BookSeatDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @Length(1, 80)
  passengerName: string;
}

export class ChangePriceDto {
  @ApiProperty({ example: 150, description: 'May not exceed 1.5x the current price' })
  @IsNumber()
  @IsPositive()
  baseTicketPrice: number;
}

/** What every command returns. Poll the read side until writeVersion >= version to observe the change. */
export class CommandResultDto {
  @ApiProperty({ format: 'uuid' })
  airplaneId: string;

  @ApiProperty({ example: 3, description: 'Aggregate version written to the write DB' })
  version: number;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({ example: 'SEAT_ALREADY_BOOKED', description: 'Stable machine-readable domain error code' })
  error: string;

  @ApiProperty({ example: 'Seat 1A is already booked by Ada Lovelace' })
  message: string;
}
