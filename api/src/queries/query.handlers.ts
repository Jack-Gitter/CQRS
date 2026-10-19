import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { READ_DB } from '../database/database.module';
import { AirplaneSummaryEntity } from '../projection/entities/airplane-summary.entity';
import { BookingActivityEntity } from '../projection/entities/booking-activity.entity';
import { SeatMapEntity } from '../projection/entities/seat-map.entity';
import { GetAirplaneQuery, GetBookingActivityQuery, ListAirplanesQuery, ListSeatsQuery } from './queries';

/**
 * QUERY side. Reads only the read DB, only read models. No aggregate, no locks,
 * no joins beyond what a read model already denormalized.
 */
@QueryHandler(ListAirplanesQuery)
export class ListAirplanesHandler implements IQueryHandler<ListAirplanesQuery, AirplaneSummaryEntity[]> {
  constructor(@InjectRepository(AirplaneSummaryEntity, READ_DB) private readonly summaries: Repository<AirplaneSummaryEntity>) {}

  execute(): Promise<AirplaneSummaryEntity[]> {
    return this.summaries.find({ order: { tailNumber: 'ASC' } });
  }
}

export type AirplaneDetail = AirplaneSummaryEntity & { seats: SeatMapEntity[] };

@QueryHandler(GetAirplaneQuery)
export class GetAirplaneHandler implements IQueryHandler<GetAirplaneQuery, AirplaneDetail> {
  constructor(
    @InjectRepository(AirplaneSummaryEntity, READ_DB) private readonly summaries: Repository<AirplaneSummaryEntity>,
    @InjectRepository(SeatMapEntity, READ_DB) private readonly seats: Repository<SeatMapEntity>,
  ) {}

  async execute(query: GetAirplaneQuery): Promise<AirplaneDetail> {
    const summary = await this.summaries.findOneBy({ airplaneId: query.airplaneId });
    if (!summary) {
      throw new NotFoundException(`Airplane ${query.airplaneId} is not in the read model (yet?)`);
    }
    const seats = await this.seats.find({
      where: { airplaneId: query.airplaneId },
      order: { seatRow: 'ASC', seatNumber: 'ASC' },
    });
    return { ...summary, seats };
  }
}

@QueryHandler(ListSeatsQuery)
export class ListSeatsHandler implements IQueryHandler<ListSeatsQuery, SeatMapEntity[]> {
  constructor(@InjectRepository(SeatMapEntity, READ_DB) private readonly seats: Repository<SeatMapEntity>) {}

  execute(query: ListSeatsQuery): Promise<SeatMapEntity[]> {
    const where: FindOptionsWhere<SeatMapEntity> = { airplaneId: query.airplaneId };
    if (query.status) where.status = query.status.toUpperCase();
    if (query.cabinClass) where.cabinClass = query.cabinClass.toUpperCase();
    return this.seats.find({ where, order: { seatRow: 'ASC', seatNumber: 'ASC' } });
  }
}

@QueryHandler(GetBookingActivityQuery)
export class GetBookingActivityHandler implements IQueryHandler<GetBookingActivityQuery, BookingActivityEntity[]> {
  constructor(@InjectRepository(BookingActivityEntity, READ_DB) private readonly activity: Repository<BookingActivityEntity>) {}

  execute(query: GetBookingActivityQuery): Promise<BookingActivityEntity[]> {
    return this.activity.find({
      where: query.airplaneId ? { airplaneId: query.airplaneId } : {},
      order: { occurredAt: 'DESC', id: 'DESC' },
      take: query.limit,
    });
  }
}

export const QUERY_HANDLERS = [ListAirplanesHandler, GetAirplaneHandler, ListSeatsHandler, GetBookingActivityHandler];
