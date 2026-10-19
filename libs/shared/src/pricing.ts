/**
 * Shared contract between write and read side: the effective ticket price of a
 * seat is airplane.baseTicketPrice * multiplier for its cabin class.
 * The aggregate uses it to quote prices; the projector uses it to precompute
 * seat_map.price without a round-trip to the write side.
 */
export const CABIN_PRICE_MULTIPLIER: Record<string, number> = {
  FIRST: 2.5,
  ECONOMY: 1,
};
