import { EntityManager } from 'typeorm';
import { AirplaneSummaryEntity } from '@app/shared';
import { SeatMapEntity } from '@app/shared';

/**
 * Recomputes the aggregated columns of airplane_summary from seat_map.
 * Computed from the read DB itself, so it is idempotent and replay-safe:
 * applying the same CDC event twice yields the same summary.
 */
export async function recalculateAirplaneSummary(manager: EntityManager, airplaneId: string): Promise<void> {
  const agg = await manager
    .createQueryBuilder(SeatMapEntity, 's')
    .select('COUNT(*)', 'total')
    .addSelect(`COUNT(*) FILTER (WHERE s.status = 'AVAILABLE')`, 'available')
    .addSelect(`COUNT(*) FILTER (WHERE s.status = 'BOOKED')`, 'booked')
    .addSelect(`COUNT(*) FILTER (WHERE s.status = 'AVAILABLE' AND s.cabin_class = 'FIRST')`, 'firstClassAvailable')
    .addSelect(`COUNT(*) FILTER (WHERE s.status = 'AVAILABLE' AND s.cabin_class = 'ECONOMY')`, 'economyAvailable')
    .addSelect(`COALESCE(SUM(s.price) FILTER (WHERE s.status = 'BOOKED'), 0)`, 'bookedRevenue')
    .addSelect('COALESCE(SUM(s.price), 0)', 'potentialRevenue')
    .where('s.airplane_id = :airplaneId', { airplaneId })
    .getRawOne<Record<string, string>>();

  const total = Number(agg?.total ?? 0);
  const booked = Number(agg?.booked ?? 0);

  await manager.update(
    AirplaneSummaryEntity,
    { airplaneId },
    {
      totalSeats: total,
      seatsAvailable: Number(agg?.available ?? 0),
      seatsBooked: booked,
      firstClassAvailable: Number(agg?.firstClassAvailable ?? 0),
      economyAvailable: Number(agg?.economyAvailable ?? 0),
      occupancyPct: total === 0 ? 0 : Math.round((booked / total) * 10000) / 100,
      bookedRevenue: Number(agg?.bookedRevenue ?? 0),
      potentialRevenue: Number(agg?.potentialRevenue ?? 0),
      projectedAt: new Date(),
    },
  );
}
