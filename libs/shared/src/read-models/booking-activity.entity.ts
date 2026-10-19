import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { NumericTransformer } from '../numeric.transformer';

/** READ MODEL: append-only feed built from seat status transitions seen in the WAL. */
@Entity({ name: 'booking_activity' })
@Unique(['sourceLsn', 'seatId'])
export class BookingActivityEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** WAL position the event came from; together with seatId it de-duplicates redeliveries. */
  @Column({ name: 'source_lsn', type: 'bigint', transformer: NumericTransformer })
  sourceLsn: number;

  @Column({ name: 'seat_id', type: 'uuid' })
  seatId: string;

  @Column({ name: 'airplane_id', type: 'uuid' })
  airplaneId: string;

  @Column({ name: 'seat_number', type: 'text' })
  seatNumber: string;

  @Column({ name: 'cabin_class', type: 'text' })
  cabinClass: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType: 'SEAT_BOOKED' | 'SEAT_RELEASED';

  @Column({ name: 'passenger_name', type: 'text', nullable: true })
  passengerName: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
