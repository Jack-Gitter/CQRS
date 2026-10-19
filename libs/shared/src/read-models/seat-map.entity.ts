import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';
import { NumericTransformer } from '../numeric.transformer';

/** READ MODEL: flat seat map with the effective price precomputed. */
@Entity({ name: 'seat_map' })
@Unique(['airplaneId', 'seatNumber'])
export class SeatMapEntity {
  @PrimaryColumn('uuid', { name: 'seat_id' })
  seatId: string;

  @Column({ name: 'airplane_id', type: 'uuid' })
  airplaneId: string;

  @Column({ name: 'seat_number', type: 'text' })
  seatNumber: string;

  @Column({ name: 'seat_row', type: 'integer' })
  seatRow: number;

  @Column({ name: 'cabin_class', type: 'text' })
  cabinClass: string;

  @Column({ name: 'price_multiplier', type: 'numeric', precision: 4, scale: 2, transformer: NumericTransformer })
  priceMultiplier: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: NumericTransformer })
  price: number;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'passenger_name', type: 'text', nullable: true })
  passengerName: string | null;

  @Column({ name: 'booked_at', type: 'timestamptz', nullable: true })
  bookedAt: Date | null;
}
