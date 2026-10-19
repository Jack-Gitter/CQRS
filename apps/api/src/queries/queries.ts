export class ListAirplanesQuery {}

export class GetAirplaneQuery {
  constructor(readonly airplaneId: string) {}
}

export class ListSeatsQuery {
  constructor(
    readonly airplaneId: string,
    readonly status?: string,
    readonly cabinClass?: string,
  ) {}
}

export class GetBookingActivityQuery {
  constructor(
    readonly airplaneId: string | null,
    readonly limit: number,
  ) {}
}
