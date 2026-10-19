import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DebeziumEvent, SeatRow } from '@app/shared';
import { BookingActivityEntity } from '@app/shared';

/**
 * Derives an event-shaped read model from row diffs: a seat going
 * AVAILABLE -> BOOKED is a SEAT_BOOKED activity, the reverse is SEAT_RELEASED.
 * Needs REPLICA IDENTITY FULL on `seats` so `before` carries the old status.
 */
@Injectable()
export class BookingActivityProjector {
  private readonly logger = new Logger(BookingActivityProjector.name);

  async apply(manager: EntityManager, event: DebeziumEvent<SeatRow>): Promise<void> {
    if (event.op !== 'u' && event.op !== 'c') {
      return; // snapshot reads and deletes are not activity
    }

    const before = event.before;
    const after = event.after!;
    const wasBooked = before?.status === 'BOOKED';
    const isBooked = after.status === 'BOOKED';
    if (wasBooked === isBooked) {
      return; // no status transition (e.g. only the airplane changed, or an unrelated column)
    }

    const eventType = isBooked ? 'SEAT_BOOKED' : 'SEAT_RELEASED';
    const passengerName = isBooked ? after.passenger_name : (before?.passenger_name ?? null);

    await manager
      .createQueryBuilder()
      .insert()
      .into(BookingActivityEntity)
      .values({
        sourceLsn: event.source.lsn ?? 0,
        seatId: after.id,
        airplaneId: after.airplane_id,
        seatNumber: after.seat_number,
        cabinClass: after.cabin_class,
        eventType,
        passengerName,
        occurredAt: new Date(event.source.ts_ms),
      })
      .orIgnore() // ON CONFLICT DO NOTHING: a redelivered event is a no-op
      .execute();

    this.logger.log(`${eventType} seat ${after.seat_number} ${passengerName ?? ''} (lsn ${event.source.lsn})`);
  }
}
