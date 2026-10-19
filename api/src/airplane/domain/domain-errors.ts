/** Base class for invariant violations. Carries an HTTP status so the filter can map it. */
export class DomainError extends Error {
  readonly httpStatus: number = 409;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAirplaneError extends DomainError {
  override readonly httpStatus = 400;
  constructor(message: string) {
    super('INVALID_AIRPLANE', message);
  }
}

export class AirplaneNotFoundError extends DomainError {
  override readonly httpStatus = 404;
  constructor(id: string) {
    super('AIRPLANE_NOT_FOUND', `Airplane ${id} does not exist`);
  }
}

export class SeatNotFoundError extends DomainError {
  override readonly httpStatus = 404;
  constructor(seatNumber: string) {
    super('SEAT_NOT_FOUND', `Seat ${seatNumber} does not exist on this airplane`);
  }
}

export class SeatAlreadyBookedError extends DomainError {
  constructor(seatNumber: string, passengerName: string) {
    super('SEAT_ALREADY_BOOKED', `Seat ${seatNumber} is already booked by ${passengerName}`);
  }
}

export class SeatNotBookedError extends DomainError {
  constructor(seatNumber: string) {
    super('SEAT_NOT_BOOKED', `Seat ${seatNumber} is not booked, nothing to cancel`);
  }
}

export class PassengerAlreadySeatedError extends DomainError {
  constructor(passengerName: string, seatNumber: string) {
    super('PASSENGER_ALREADY_SEATED', `${passengerName} already holds seat ${seatNumber} on this airplane`);
  }
}

export class AirplaneGroundedError extends DomainError {
  constructor(tailNumber: string) {
    super('AIRPLANE_GROUNDED', `Airplane ${tailNumber} is grounded; seats cannot be booked`);
  }
}

export class AirplaneHasBookingsError extends DomainError {
  constructor(tailNumber: string, booked: number) {
    super('AIRPLANE_HAS_BOOKINGS', `Airplane ${tailNumber} still has ${booked} booked seat(s); cancel them before grounding`);
  }
}

export class InvalidPriceChangeError extends DomainError {
  override readonly httpStatus = 422;
  constructor(message: string) {
    super('INVALID_PRICE_CHANGE', message);
  }
}
