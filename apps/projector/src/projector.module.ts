import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirplaneSummaryEntity, BookingActivityEntity, READ_DB, SeatMapEntity } from '@app/shared';
import { ProjectionModule } from './projection/projection.module';

@Module({
  imports: [
    // The projector only ever touches the READ database.
    TypeOrmModule.forRoot({
      name: READ_DB,
      type: 'postgres',
      url: process.env.READ_DB_URL ?? 'postgres://postgres:postgres@localhost:5434/airline_read',
      entities: [AirplaneSummaryEntity, SeatMapEntity, BookingActivityEntity],
      synchronize: false,
      logging: ['error'],
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    ProjectionModule,
  ],
})
export class ProjectorModule {}
