import { IsInt, IsNumber, IsPositive, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateAirplaneDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,10}$/)
  tailNumber: string;

  @IsString()
  @Length(2, 60)
  model: string;

  @IsNumber()
  @IsPositive()
  baseTicketPrice: number;

  @IsInt()
  @Min(1)
  @Max(60)
  rows: number;

  @IsInt()
  @Min(1)
  @Max(10)
  seatsPerRow: number;

  @IsInt()
  @Min(0)
  @Max(60)
  firstClassRows: number;
}

export class BookSeatDto {
  @IsString()
  @Length(1, 80)
  passengerName: string;
}

export class ChangePriceDto {
  @IsNumber()
  @IsPositive()
  baseTicketPrice: number;
}
