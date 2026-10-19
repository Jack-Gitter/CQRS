import { SeatLayout } from '../../domain/airplane';

export interface CommandResult {
  airplaneId: string;
  /** Version written to the write DB. Poll the read side until writeVersion >= this to observe the change. */
  version: number;
}

export class CreateAirplaneCommand {
  constructor(
    readonly tailNumber: string,
    readonly model: string,
    readonly baseTicketPrice: number,
    readonly layout: SeatLayout,
  ) {}
}

export class BookSeatCommand {
  constructor(
    readonly airplaneId: string,
    readonly seatNumber: string,
    readonly passengerName: string,
  ) {}
}

export class CancelSeatCommand {
  constructor(
    readonly airplaneId: string,
    readonly seatNumber: string,
  ) {}
}

export class ChangeBasePriceCommand {
  constructor(
    readonly airplaneId: string,
    readonly baseTicketPrice: number,
  ) {}
}

export class GroundAirplaneCommand {
  constructor(readonly airplaneId: string) {}
}

export class ReactivateAirplaneCommand {
  constructor(readonly airplaneId: string) {}
}
