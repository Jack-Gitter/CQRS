import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AirplaneSummaryEntity, BookingActivityEntity, SeatMapEntity } from '@app/shared';
import { AirplaneDetailDto } from './airplane-detail.dto';
import { GetAirplaneQuery, GetBookingActivityQuery, ListAirplanesQuery, ListSeatsQuery } from './queries';

const airplaneIdParam = { name: 'id', format: 'uuid', example: '11111111-1111-4111-8111-111111111111' };

/** QUERY side endpoints: served entirely from the read database. */
@ApiTags('queries (read DB)')
@Controller()
export class AirplaneQueryController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('airplanes')
  @ApiOperation({ summary: 'List airplane summaries (counts, availability, revenue)' })
  @ApiOkResponse({ type: AirplaneSummaryEntity, isArray: true })
  list(): Promise<AirplaneSummaryEntity[]> {
    return this.queryBus.execute(new ListAirplanesQuery());
  }

  @Get('airplanes/:id')
  @ApiOperation({ summary: 'Airplane summary with its full seat map' })
  @ApiParam(airplaneIdParam)
  @ApiOkResponse({ type: AirplaneDetailDto })
  @ApiNotFoundResponse({ description: 'Not projected into the read model (yet)' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AirplaneDetailDto> {
    return this.queryBus.execute(new GetAirplaneQuery(id));
  }

  @Get('airplanes/:id/seats')
  @ApiOperation({ summary: 'Seat map, optionally filtered' })
  @ApiParam(airplaneIdParam)
  @ApiQuery({ name: 'status', required: false, enum: ['AVAILABLE', 'BOOKED'] })
  @ApiQuery({ name: 'cabinClass', required: false, enum: ['FIRST', 'ECONOMY'] })
  @ApiOkResponse({ type: SeatMapEntity, isArray: true })
  seats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Query('cabinClass') cabinClass?: string,
  ): Promise<SeatMapEntity[]> {
    return this.queryBus.execute(new ListSeatsQuery(id, status, cabinClass));
  }

  @Get('airplanes/:id/activity')
  @ApiOperation({ summary: 'Booking activity for one airplane, newest first' })
  @ApiParam(airplaneIdParam)
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ type: BookingActivityEntity, isArray: true })
  airplaneActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<BookingActivityEntity[]> {
    return this.queryBus.execute(new GetBookingActivityQuery(id, limit));
  }

  @Get('activity')
  @ApiOperation({ summary: 'Booking activity across all airplanes, newest first' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ type: BookingActivityEntity, isArray: true })
  activity(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number): Promise<BookingActivityEntity[]> {
    return this.queryBus.execute(new GetBookingActivityQuery(null, limit));
  }
}
