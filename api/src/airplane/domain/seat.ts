import { SeatAlreadyBookedError, SeatNotBookedError } from './domain-errors';

export enum CabinClass {
  FIRST = 'FIRST',
  ECONOMY = 'ECONOMY',
}

export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
}

/** Effective ticket price = airplane.baseTicketPrice * multiplier for the cabin. */
export const CABIN_PRICE_MULTIPLIER: Record<CabinClass, number> = {
  [CabinClass.FIRST]: 2.5,
  [CabinClass.ECONOMY]: 1,
};

/**
 * Seat is an entity *inside* the Airplane aggregate. It is never loaded or
 * modified on its own: all changes go through Airplane so invariants that
 * span seats (one seat per passenger, grounded planes, ...) hold.
 */
export class Seat {
  private constructor(
    readonly id: string,
    readonly seatNumber: string,
    readonly cabinClass: CabinClass,
    private _status: SeatStatus,
    private _passengerName: string | null,
    private _bookedAt: Date | null,
  ) {}

  static create(id: string, seatNumber: string, cabinClass: CabinClass): Seat {
    return new Seat(id, seatNumber, cabinClass, SeatStatus.AVAILABLE, null, null);
  }

  static reconstitute(props: {
    id: string;
    seatNumber: string;
    cabinClass: CabinClass;
    status: SeatStatus;
    passengerName: string | null;
    bookedAt: Date | null;
  }): Seat {
    return new Seat(props.id, props.seatNumber, props.cabinClass, props.status, props.passengerName, props.bookedAt);
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
