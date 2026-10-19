import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { READ_DB } from '../database/database.module';
import { AirplaneSummaryEntity } from '../projection/entities/airplane-summary.entity';
import { BookingActivityEntity } from '../projection/entities/booking-activity.entity';
import { SeatMapEntity } from '../projection/entities/seat-map.entity';
import { AirplaneQueryController } from './airplane-query.controller';
import { QUERY_HANDLERS } from './query.handlers';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([AirplaneSummaryEntity, SeatMapEntity, BookingActivityEntity], READ_DB)],
  controllers: [AirplaneQueryController],
  providers: [...QUERY_HANDLERS],
})
export class QueryModule {}
