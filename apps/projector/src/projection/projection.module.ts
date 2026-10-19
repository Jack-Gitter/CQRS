import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { READ_DB } from '@app/shared';
import { CdcConsumer } from './cdc.consumer';
import { AirplaneSummaryEntity } from '@app/shared';
import { BookingActivityEntity } from '@app/shared';
import { SeatMapEntity } from '@app/shared';
import { ProjectionService } from './projection.service';
import { AirplaneSummaryProjector } from './projectors/airplane-summary.projector';
import { BookingActivityProjector } from './projectors/booking-activity.projector';
import { SeatMapProjector } from './projectors/seat-map.projector';

@Module({
  imports: [TypeOrmModule.forFeature([AirplaneSummaryEntity, SeatMapEntity, BookingActivityEntity], READ_DB)],
  providers: [ProjectionService, CdcConsumer, AirplaneSummaryProjector, SeatMapProjector, BookingActivityProjector],
})
export class ProjectionModule {}
