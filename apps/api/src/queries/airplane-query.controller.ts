import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetAirplaneQuery, GetBookingActivityQuery, ListAirplanesQuery, ListSeatsQuery } from './queries';

/** QUERY side endpoints: served entirely from the read database. */
@Controller()
export class AirplaneQueryController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('airplanes')
  list() {
    return this.queryBus.execute(new ListAirplanesQuery());
  }

  @Get('airplanes/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetAirplaneQuery(id));
  }

  @Get('airplanes/:id/seats')
  seats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Query('cabinClass') cabinClass?: string,
  ) {
    return this.queryBus.execute(new ListSeatsQuery(id, status, cabinClass));
  }

  @Get('airplanes/:id/activity')
  airplaneActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.queryBus.execute(new GetBookingActivityQuery(id, limit));
  }

  @Get('activity')
  activity(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.queryBus.execute(new GetBookingActivityQuery(null, limit));
  }
}
