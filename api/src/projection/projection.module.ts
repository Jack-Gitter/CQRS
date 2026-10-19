import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { READ_DB } from '../database/database.module';
import { CdcController } from './cdc.controller';
import { AirplaneSummaryEntity } from './entities/airplane-summary.entity';
import { BookingActivityEntity } from './entities/booking-activity.entity';
import { SeatMapEntity } from './entities/seat-map.entity';
import { ProjectionService } from './projection.service';
import { AirplaneSummaryProjector } from './projectors/airplane-summary.projector';
import { BookingActivityProjector } from './projectors/booking-activity.projector';
import { SeatMapProjector } from './projectors/seat-map.projector';

@Module({
  imports: [TypeOrmModule.forFeature([AirplaneSummaryEntity, SeatMapEntity, BookingActivityEntity], READ_DB)],
  controllers: [CdcController],
  providers: [ProjectionService, AirplaneSummaryProjector, SeatMapProjector, BookingActivityProjector],
})
export class ProjectionModule {}
