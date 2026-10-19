import { Column, Entity, PrimaryColumn } from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';

/** READ MODEL: one denormalized row per airplane, ready for a listing page. */
@Entity({ name: 'airplane_summary' })
export class AirplaneSummaryEntity {
  @PrimaryColumn('uuid', { name: 'airplane_id' })
  airplaneId: string;

  @Column({ name: 'tail_number', type: 'text' })
  tailNumber: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'base_ticket_price', type: 'numeric', precision: 10, scale: 2, transformer: NumericTransformer })
  baseTicketPrice: number;

  @Column({ name: 'total_seats', type: 'integer', default: 0 })
  totalSeats: number;

  @Column({ name: 'seats_available', type: 'integer', default: 0 })
  seatsAvailable: number;

  @Column({ name: 'seats_booked', type: 'integer', default: 0 })
  seatsBooked: number;

  @Column({ name: 'first_class_available', type: 'integer', default: 0 })
  firstClassAvailable: number;

  @Column({ name: 'economy_available', type: 'integer', default: 0 })
  economyAvailable: number;

  @Column({ name: 'occupancy_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: NumericTransformer })
  occupancyPct: number;

  @Column({ name: 'booked_revenue', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  bookedRevenue: number;

  @Column({ name: 'potential_revenue', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  potentialRevenue: number;

  /** Version of the aggregate in the write DB this row reflects (eventual-consistency marker). */
  @Column({ name: 'write_version', type: 'integer', default: 0 })
  writeVersion: number;

  @Column({ name: 'projected_at', type: 'timestamptz' })
  projectedAt: Date;
}
