import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { READ_DB } from '@app/shared';
import { AirplaneRow, DebeziumEvent, SeatRow } from '@app/shared';
import { AirplaneSummaryProjector } from './projectors/airplane-summary.projector';
import { BookingActivityProjector } from './projectors/booking-activity.projector';
import { SeatMapProjector } from './projectors/seat-map.projector';

/**
 * Routes each CDC event to the projectors interested in its source table and
 * applies them in ONE read-DB transaction, so a single WAL change either
 * fully lands in all read models or not at all.
 *
 * Events for different tables arrive on different Kafka topics, so there is no
 * ordering guarantee between an airplane change and a seat change. Every
 * projector therefore tolerates either order (counts are recomputed from
 * seat_map, prices are fixed up whichever side arrives last).
 */
@Injectable()
export class ProjectionService {
  private readonly logger = new Logger(ProjectionService.name);

  constructor(
    @InjectDataSource(READ_DB) private readonly readDb: DataSource,
    private readonly airplaneSummary: AirplaneSummaryProjector,
    private readonly seatMap: SeatMapProjector,
    private readonly bookingActivity: BookingActivityProjector,
  ) {}

  async project(event: DebeziumEvent): Promise<void> {
    const table = event?.source?.table;
    if (!table || !event.op) {
      this.logger.warn(`ignoring non-change payload: ${JSON.stringify(event).slice(0, 200)}`);
      return;
    }

    await this.readDb.transaction(async (manager) => {
      switch (table) {
        case 'airplanes':
          await this.airplaneSummary.apply(manager, event as DebeziumEvent<AirplaneRow>);
          break;
        case 'seats':
          await this.seatMap.apply(manager, event as DebeziumEvent<SeatRow>);
          await this.bookingActivity.apply(manager, event as DebeziumEvent<SeatRow>);
          break;
        default:
          this.logger.debug(`no projector for table ${table}`);
      }
    });
  }
}
