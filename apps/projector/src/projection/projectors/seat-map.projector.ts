import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CABIN_PRICE_MULTIPLIER } from '@app/shared';
import { DebeziumEvent, SeatRow } from '@app/shared';
import { AirplaneSummaryEntity } from '@app/shared';
import { SeatMapEntity } from '@app/shared';
import { recalculateAirplaneSummary } from './summary-recalculator';

/** Projects changes of the write table `seats` into `seat_map` and refreshes the summary counters. */
@Injectable()
export class SeatMapProjector {
  private readonly logger = new Logger(SeatMapProjector.name);

  async apply(manager: EntityManager, event: DebeziumEvent<SeatRow>): Promise<void> {
    if (event.op === 'd') {
      const row = event.before!;
      await manager.delete(SeatMapEntity, { seatId: row.id });
      await recalculateAirplaneSummary(manager, row.airplane_id);
      return;
    }

    const row = event.after!;
    const multiplier = CABIN_PRICE_MULTIPLIER[row.cabin_class] ?? 1;

    // The summary row normally already exists (airplane row is written first in the same
    // transaction, and Debezium preserves WAL order). If not, price is fixed up when it arrives.
    const summary = await manager.findOne(AirplaneSummaryEntity, { where: { airplaneId: row.airplane_id } });
    const price = Math.round((summary?.baseTicketPrice ?? 0) * multiplier * 100) / 100;

    await manager.upsert(
      SeatMapEntity,
      {
        seatId: row.id,
        airplaneId: row.airplane_id,
        seatNumber: row.seat_number,
        seatRow: parseInt(row.seat_number, 10) || 0,
        cabinClass: row.cabin_class,
        priceMultiplier: multiplier,
        price,
        status: row.status,
        passengerName: row.passenger_name,
        bookedAt: row.booked_at ? new Date(row.booked_at) : null,
      },
      { conflictPaths: ['seatId'] },
    );

    await recalculateAirplaneSummary(manager, row.airplane_id);

    this.logger.log(`[${event.op}] seat ${row.seat_number} ${row.status}${row.passenger_name ? ` (${row.passenger_name})` : ''} -> seat_map`);
  }
}
