import { ApiProperty } from '@nestjs/swagger';
import { AirplaneSummaryEntity, SeatMapEntity } from '@app/shared';

/** airplane_summary row plus its full seat map. */
export class AirplaneDetailDto extends AirplaneSummaryEntity {
  @ApiProperty({ type: () => SeatMapEntity, isArray: true })
  seats: SeatMapEntity[];
}
