import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirplaneSummaryEntity, BookingActivityEntity, READ_DB, SeatMapEntity } from '@app/shared';
import { AirplaneQueryController } from './airplane-query.controller';
import { QUERY_HANDLERS } from './query.handlers';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([AirplaneSummaryEntity, SeatMapEntity, BookingActivityEntity], READ_DB)],
  controllers: [AirplaneQueryController],
  providers: [...QUERY_HANDLERS],
})
export class QueryModule {}
