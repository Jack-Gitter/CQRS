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
 * Aggregate root. Everything that touches seats goes through here, and the
 * repository always loads the whole aggregate under a pessimistic lock before
 * any of these methods run, so the invariants below are enforced serially.
 *
 * Invariants:
 *  - a seat can only be booked once
 *  - a passenger can hold at most one seat per airplane
 *  - a grounded airplane accepts no bookings
 *  - an airplane with booked seats cannot be grounded
 *  - base ticket price is positive and cannot jump by more than 50% in one change
 */
export class Airplane {
  private readonly changedSeats = new Set<string>();

  private constructor(
    readonly id: string,
    readonly tailNumber: string,
    readonly model: string,
    private _baseTicketPrice: number,
    private _status: AirplaneStatus,
    private readonly seats: Map<string, Seat>,
    private _version: number,
  ) {}

  static create(input: {
    id: string;
    tailNumber: string;
    model: string;
    baseTicketPrice: number;
    layout: SeatLayout;
    seatIdFactory: () => string;
  }): Airplane {
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

    const seats = new Map<string, Seat>();
    for (let row = 1; row <= layout.rows; row++) {
      const cabin = row <= layout.firstClassRows ? CabinClass.FIRST : CabinClass.ECONOMY;
      for (let i = 0; i < layout.seatsPerRow; i++) {
        const seatNumber = `${row}${SEAT_LETTERS[i]}`;
        seats.set(seatNumber, Seat.create(input.seatIdFactory(), seatNumber, cabin));
      }
    }

    return new Airplane(
      input.id,
      tailNumber,
      input.model.trim(),
      round2(input.baseTicketPrice),
      AirplaneStatus.ACTIVE,
      seats,
      0,
    );
  }

  /** Rehydrate from persistence without running creation validation. */
  static reconstitute(props: {
    id: string;
    tailNumber: string;
    model: string;
    baseTicketPrice: number;
    status: AirplaneStatus;
    seats: Seat[];
    version: number;
  }): Airplane {
    return new Airplane(
      props.id,
      props.tailNumber,
      props.model,
      props.baseTicketPrice,
      props.status,
      new Map(props.seats.map((s) => [s.seatNumber, s])),
      props.version,
    );
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
    this.changedSeats.add(seat.seatNumber);
    return seat;
  }

  cancelSeat(seatNumber: string): Seat {
    const seat = this.seatOrThrow(seatNumber);
    seat.release();
    this.changedSeats.add(seat.seatNumber);
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
    const booked = this.allSeats.filter((s) => s.isBooked).length;
    if (booked > 0) {
      throw new AirplaneHasBookingsError(this.tailNumber, booked);
    }
    this._status = AirplaneStatus.GROUNDED;
  }

  reactivate(): void {
    this._status = AirplaneStatus.ACTIVE;
  }

  // ---------- queries on the aggregate (used by the repository) ----------

  get baseTicketPrice(): number {
    return this._baseTicketPrice;
  }

  get status(): AirplaneStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get allSeats(): Seat[] {
    return [...this.seats.values()];
  }

  /** Seats touched since the aggregate was loaded; the repository persists only these. */
  get changedSeatList(): Seat[] {
    return [...this.changedSeats].map((n) => this.seats.get(n)!);
  }

  priceFor(seat: Seat): number {
    return round2(this._baseTicketPrice * seat.priceMultiplier);
  }

  /** @internal repository calls this after a successful save */
  markPersisted(version: number): void {
    this._version = version;
    this.changedSeats.clear();
  }

  // ---------- helpers ----------

  private assertActive(): void {
    if (this._status !== AirplaneStatus.ACTIVE) {
      throw new AirplaneGroundedError(this.tailNumber);
    }
  }

  private seatOrThrow(seatNumber: string): Seat {
    const seat = this.seats.get(seatNumber.trim().toUpperCase());
    if (!seat) {
      throw new SeatNotFoundError(seatNumber);
    }
    return seat;
  }

  private seatHeldBy(passengerName: string): Seat | undefined {
    const needle = passengerName.toLowerCase();
    return this.allSeats.find((s) => s.isBooked && s.passengerName?.toLowerCase() === needle);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
