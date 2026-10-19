import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  BookSeatCommand,
  CancelSeatCommand,
  ChangeBasePriceCommand,
  CommandResult,
  CreateAirplaneCommand,
  GroundAirplaneCommand,
  ReactivateAirplaneCommand,
} from '../application/commands/commands';
import { BookSeatDto, ChangePriceDto, CreateAirplaneDto } from './dto';

/**
 * COMMAND side. Every endpoint here writes to the write DB through the
 * aggregate and returns only { airplaneId, version }: never the read model.
 */
@Controller('airplanes')
export class AirplaneCommandController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  create(@Body() dto: CreateAirplaneDto): Promise<CommandResult> {
    return this.commandBus.execute(
      new CreateAirplaneCommand(dto.tailNumber, dto.model, dto.baseTicketPrice, {
        rows: dto.rows,
        seatsPerRow: dto.seatsPerRow,
        firstClassRows: dto.firstClassRows,
      }),
    );
  }

  @Post(':id/seats/:seatNumber/book')
  @HttpCode(200)
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatNumber') seatNumber: string,
    @Body() dto: BookSeatDto,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new BookSeatCommand(id, seatNumber, dto.passengerName));
  }

  @Post(':id/seats/:seatNumber/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Param('seatNumber') seatNumber: string): Promise<CommandResult> {
    return this.commandBus.execute(new CancelSeatCommand(id, seatNumber));
  }

  @Put(':id/price')
  changePrice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangePriceDto): Promise<CommandResult> {
    return this.commandBus.execute(new ChangeBasePriceCommand(id, dto.baseTicketPrice));
  }

  @Post(':id/ground')
  @HttpCode(200)
  ground(@Param('id', ParseUUIDPipe) id: string): Promise<CommandResult> {
    return this.commandBus.execute(new GroundAirplaneCommand(id));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<CommandResult> {
    return this.commandBus.execute(new ReactivateAirplaneCommand(id));
  }
}
