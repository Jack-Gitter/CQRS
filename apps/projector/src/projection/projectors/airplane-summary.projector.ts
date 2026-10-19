import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AirplaneRow, DebeziumEvent } from '@app/shared';
import { AirplaneSummaryEntity } from '@app/shared';
import { BookingActivityEntity } from '@app/shared';
import { SeatMapEntity } from '@app/shared';
import { recalculateAirplaneSummary } from './summary-recalculator';

/** Projects changes of the write table `airplanes` into `airplane_summary` (+ reprices `seat_map`). */
@Injectable()
export class AirplaneSummaryProjector {
  private readonly logger = new Logger(AirplaneSummaryProjector.name);

  async apply(manager: EntityManager, event: DebeziumEvent<AirplaneRow>): Promise<void> {
    if (event.op === 'd') {
      const id = event.before!.id;
      await manager.delete(BookingActivityEntity, { airplaneId: id });
      await manager.delete(SeatMapEntity, { airplaneId: id });
      await manager.delete(AirplaneSummaryEntity, { airplaneId: id });
      this.logger.log(`airplane ${id} removed from read models`);
      return;
    }

    const row = event.after!;

    await manager.upsert(
      AirplaneSummaryEntity,
      {
        airplaneId: row.id,
        tailNumber: row.tail_number,
        model: row.model,
        status: row.status,
        baseTicketPrice: row.base_ticket_price,
        writeVersion: row.version,
        projectedAt: new Date(),
      },
      { conflictPaths: ['airplaneId'] },
    );

    // Base price lives on the airplane; every seat's effective price depends on it.
    await manager
      .createQueryBuilder()
      .update(SeatMapEntity)
      .set({ price: () => `ROUND(:base * price_multiplier, 2)` })
      .where('airplane_id = :airplaneId')
      .setParameters({ base: row.base_ticket_price, airplaneId: row.id })
      .execute();

    await recalculateAirplaneSummary(manager, row.id);

    this.logger.log(`[${event.op}] airplane ${row.tail_number} v${row.version} -> airplane_summary`);
  }
}
