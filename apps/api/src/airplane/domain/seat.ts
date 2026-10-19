import { CABIN_PRICE_MULTIPLIER } from '@app/shared';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { SeatAlreadyBookedError, SeatNotBookedError } from './domain-errors';
import type { Airplane } from './airplane';

export enum CabinClass {
  FIRST = 'FIRST',
  ECONOMY = 'ECONOMY',
}

export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
}

/**
 * Seat is an entity *inside* the Airplane aggregate and also its own TypeORM
 * row. Mutable state is private and only changed via Airplane, so invariants
 * that span seats (one seat per passenger, grounded planes, ...) hold.
 */
@Entity({ name: 'seats' })
@Unique(['airplaneId', 'seatNumber'])
export class Seat {
  @PrimaryColumn('uuid')
  readonly id: string;

  @Column({ name: 'airplane_id', type: 'uuid' })
  readonly airplaneId: string;

  @ManyToOne('Airplane', (airplane: Airplane) => airplane.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'airplane_id' })
  readonly airplane?: Airplane;

  @Column({ name: 'seat_number', type: 'text' })
  readonly seatNumber: string;

  @Column({ name: 'cabin_class', type: 'text' })
  readonly cabinClass: CabinClass;

  @Column({ name: 'status', type: 'text' })
  private _status: SeatStatus;

  @Column({ name: 'passenger_name', type: 'text', nullable: true })
  private _passengerName: string | null;

  @Column({ name: 'booked_at', type: 'timestamptz', nullable: true })
  private _bookedAt: Date | null;

  /** TypeORM instantiates with no arguments and then assigns columns; the factory passes props. */
  private constructor(props?: { id: string; airplaneId: string; seatNumber: string; cabinClass: CabinClass }) {
    if (props) {
      this.id = props.id;
      this.airplaneId = props.airplaneId;
      this.seatNumber = props.seatNumber;
      this.cabinClass = props.cabinClass;
      this._status = SeatStatus.AVAILABLE;
      this._passengerName = null;
      this._bookedAt = null;
    }
  }

  static create(id: string, airplaneId: string, seatNumber: string, cabinClass: CabinClass): Seat {
    return new Seat({ id, airplaneId, seatNumber, cabinClass });
  }

  get status(): SeatStatus {
    return this._status;
  }

  get passengerName(): string | null {
    return this._passengerName;
  }

  get bookedAt(): Date | null {
    return this._bookedAt;
  }

  get isBooked(): boolean {
    return this._status === SeatStatus.BOOKED;
  }

  get priceMultiplier(): number {
    return CABIN_PRICE_MULTIPLIER[this.cabinClass];
  }

  /** @internal called by Airplane only */
  book(passengerName: string, now: Date): void {
    if (this.isBooked) {
      throw new SeatAlreadyBookedError(this.seatNumber, this._passengerName ?? 'someone');
    }
    this._status = SeatStatus.BOOKED;
    this._passengerName = passengerName;
    this._bookedAt = now;
  }

  /** @internal called by Airplane only */
  release(): void {
    if (!this.isBooked) {
      throw new SeatNotBookedError(this.seatNumber);
    }
    this._status = SeatStatus.AVAILABLE;
    this._passengerName = null;
    this._bookedAt = null;
  }
}
