import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  BookSeatCommand,
  CancelSeatCommand,
  ChangeBasePriceCommand,
  CreateAirplaneCommand,
  GroundAirplaneCommand,
  ReactivateAirplaneCommand,
} from '../application/commands/commands';
import { BookSeatDto, ChangePriceDto, CommandResultDto, CreateAirplaneDto, ErrorResponseDto } from './airplane.dto';

const airplaneIdParam = { name: 'id', format: 'uuid', example: '11111111-1111-4111-8111-111111111111' };
const seatParam = { name: 'seatNumber', example: '1A' };

/**
 * COMMAND side. Every endpoint here writes to the write DB through the
 * aggregate and returns only { airplaneId, version }: never the read model.
 */
@ApiTags('commands (write DB)')
@ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Airplane or seat does not exist' })
@Controller('airplanes')
export class AirplaneCommandController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @ApiOperation({ summary: 'Create an airplane with a generated seat map' })
  @ApiCreatedResponse({ type: CommandResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Validation or invalid layout' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Tail number already exists' })
  create(@Body() dto: CreateAirplaneDto): Promise<CommandResultDto> {
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
  @ApiOperation({ summary: 'Book a seat for a passenger' })
  @ApiParam(airplaneIdParam)
  @ApiParam(seatParam)
  @ApiOkResponse({ type: CommandResultDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'SEAT_ALREADY_BOOKED, PASSENGER_ALREADY_SEATED, AIRPLANE_GROUNDED or AGGREGATE_LOCKED',
  })
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatNumber') seatNumber: string,
    @Body() dto: BookSeatDto,
  ): Promise<CommandResultDto> {
    return this.commandBus.execute(new BookSeatCommand(id, seatNumber, dto.passengerName));
  }

  @Post(':id/seats/:seatNumber/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a booking and release the seat' })
  @ApiParam(airplaneIdParam)
  @ApiParam(seatParam)
  @ApiOkResponse({ type: CommandResultDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SEAT_NOT_BOOKED' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Param('seatNumber') seatNumber: string): Promise<CommandResultDto> {
    return this.commandBus.execute(new CancelSeatCommand(id, seatNumber));
  }

  @Put(':id/price')
  @ApiOperation({ summary: 'Change the base ticket price (max +50% per change)' })
  @ApiParam(airplaneIdParam)
  @ApiOkResponse({ type: CommandResultDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_PRICE_CHANGE' })
  changePrice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangePriceDto): Promise<CommandResultDto> {
    return this.commandBus.execute(new ChangeBasePriceCommand(id, dto.baseTicketPrice));
  }

  @Post(':id/ground')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ground the airplane (only allowed with no bookings)' })
  @ApiParam(airplaneIdParam)
  @ApiOkResponse({ type: CommandResultDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'AIRPLANE_HAS_BOOKINGS' })
  ground(@Param('id', ParseUUIDPipe) id: string): Promise<CommandResultDto> {
    return this.commandBus.execute(new GroundAirplaneCommand(id));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put a grounded airplane back in service' })
  @ApiParam(airplaneIdParam)
  @ApiOkResponse({ type: CommandResultDto })
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<CommandResultDto> {
    return this.commandBus.execute(new ReactivateAirplaneCommand(id));
  }
}
