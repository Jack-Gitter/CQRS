import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';
import {
  AirplaneGroundedError,
  AirplaneHasBookingsError,
  InvalidAirplaneError,
  InvalidPriceChangeError,
  PassengerAlreadySeatedError,
  SeatNotFoundError,
} from './domain-errors';
import { CabinClass, Seat } from './seat';

export enum AirplaneStatus {
  ACTIVE = 'ACTIVE',
  GROUNDED = 'GROUNDED',
}

export interface SeatLayout {
  rows: number;
  seatsPerRow: number;
  firstClassRows: number;
}

const SEAT_LETTERS = 'ABCDEFGHJK'; // airlines skip "I"
const MAX_PRICE_INCREASE_FACTOR = 1.5; // a single fare change may not raise the price by more than 50%

/**
 * Aggregate root AND TypeORM entity ("rich entity" style).
 *
 * Identity columns are readonly, state that has invariants is private and only
 * changed through the methods below. The repository loads the whole aggregate
 * (airplane + seats) under a pessimistic lock before any method runs, and
 * TypeORM's save() diffs the graph so only rows that actually changed are written.
 *
 * Invariants:
 *  - a seat can only be booked once
 *  - a passenger can hold at most one seat per airplane
 *  - a grounded airplane accepts no bookings
 *  - an airplane with booked seats cannot be grounded
 *  - base ticket price is positive and cannot jump by more than 50% in one change
 */
@Entity({ name: 'airplanes' })
export class Airplane {
  @PrimaryColumn('uuid')
  readonly id: string;

  @Column({ name: 'tail_number', type: 'text', unique: true })
  readonly tailNumber: string;

  @Column({ type: 'text' })
  readonly model: string;

  @Column({ name: 'base_ticket_price', type: 'numeric', precision: 10, scale: 2, transformer: NumericTransformer })
  private _baseTicketPrice: number;

  @Column({ name: 'status', type: 'text' })
  private _status: AirplaneStatus;

  /** Bumped by the repository on every save; read models expose it as writeVersion. */
  @Column({ type: 'integer', default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt: Date;

  /** Always loaded together with the root. Mutate seats through the methods below, not directly. */
  @OneToMany(() => Seat, (seat) => seat.airplane, { cascade: ['insert', 'update'] })
  readonly seats: Seat[];

  /** TypeORM instantiates with no arguments and then assigns columns; the factory passes props. */
  private constructor(props?: { id: string; tailNumber: string; model: string; baseTicketPrice: number; seats: Seat[] }) {
    if (props) {
      this.id = props.id;
      this.tailNumber = props.tailNumber;
      this.model = props.model;
      this._baseTicketPrice = props.baseTicketPrice;
      this._status = AirplaneStatus.ACTIVE;
      this.version = 0;
      this.seats = props.seats;
    }
  }

  static create(input: { tailNumber: string; model: string; baseTicketPrice: number; layout: SeatLayout }): Airplane {
    const { layout } = input;
    const tailNumber = input.tailNumber.trim().toUpperCase();

    if (!/^[A-Z0-9-]{3,10}$/.test(tailNumber)) {
      throw new InvalidAirplaneError('Tail number must be 3-10 alphanumeric characters');
    }
    if (!input.model.trim()) {
      throw new InvalidAirplaneError('Model is required');
    }
    if (!(input.baseTicketPrice > 0)) {
      throw new InvalidAirplaneError('Base ticket price must be positive');
    }
    if (layout.rows < 1 || layout.rows > 60) {
      throw new InvalidAirplaneError('Rows must be between 1 and 60');
    }
    if (layout.seatsPerRow < 1 || layout.seatsPerRow > SEAT_LETTERS.length) {
      throw new InvalidAirplaneError(`Seats per row must be between 1 and ${SEAT_LETTERS.length}`);
    }
    if (layout.firstClassRows < 0 || layout.firstClassRows > layout.rows) {
      throw new InvalidAirplaneError('First class rows must be between 0 and the number of rows');
    }

    const id = randomUUID();
    const seats: Seat[] = [];
    for (let row = 1; row <= layout.rows; row++) {
      const cabin = row <= layout.firstClassRows ? CabinClass.FIRST : CabinClass.ECONOMY;
      for (let i = 0; i < layout.seatsPerRow; i++) {
        seats.push(Seat.create(randomUUID(), id, `${row}${SEAT_LETTERS[i]}`, cabin));
      }
    }

    return new Airplane({
      id,
      tailNumber,
      model: input.model.trim(),
      baseTicketPrice: round2(input.baseTicketPrice),
      seats,
    });
  }

  // ---------- behaviour (commands) ----------

  bookSeat(seatNumber: string, passengerName: string): Seat {
    this.assertActive();
    const seat = this.seatOrThrow(seatNumber);
    const name = passengerName.trim();
    if (!name) {
      throw new InvalidAirplaneError('Passenger name is required');
    }

    const existing = this.seatHeldBy(name);
    if (existing) {
      throw new PassengerAlreadySeatedError(name, existing.seatNumber);
    }

    seat.book(name, new Date());
    return seat;
  }

  cancelSeat(seatNumber: string): Seat {
    const seat = this.seatOrThrow(seatNumber);
    seat.release();
    return seat;
  }

  changeBasePrice(newPrice: number): void {
    if (!(newPrice > 0)) {
      throw new InvalidPriceChangeError('Base ticket price must be positive');
    }
    const ceiling = round2(this._baseTicketPrice * MAX_PRICE_INCREASE_FACTOR);
    if (newPrice > ceiling) {
      throw new InvalidPriceChangeError(
        `Price can be raised to at most ${ceiling.toFixed(2)} in one change (current ${this._baseTicketPrice.toFixed(2)})`,
      );
    }
    this._baseTicketPrice = round2(newPrice);
  }

  ground(): void {
    const booked = this.seats.filter((s) => s.isBooked).length;
    if (booked > 0) {
      throw new AirplaneHasBookingsError(this.tailNumber, booked);
    }
    this._status = AirplaneStatus.GROUNDED;
  }

  reactivate(): void {
    this._status = AirplaneStatus.ACTIVE;
  }

  // ---------- read-only accessors ----------

  get baseTicketPrice(): number {
    return this._baseTicketPrice;
  }

  get status(): AirplaneStatus {
    return this._status;
  }

  priceFor(seat: Seat): number {
    return round2(this._baseTicketPrice * seat.priceMultiplier);
  }

  // ---------- helpers ----------

  private assertActive(): void {
    if (this._status !== AirplaneStatus.ACTIVE) {
      throw new AirplaneGroundedError(this.tailNumber);
    }
  }

  private seatOrThrow(seatNumber: string): Seat {
    const wanted = seatNumber.trim().toUpperCase();
    const seat = this.seats.find((s) => s.seatNumber === wanted);
    if (!seat) {
      throw new SeatNotFoundError(seatNumber);
    }
    return seat;
  }

  private seatHeldBy(passengerName: string): Seat | undefined {
    const needle = passengerName.toLowerCase();
    return this.seats.find((s) => s.isBooked && s.passengerName?.toLowerCase() === needle);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
