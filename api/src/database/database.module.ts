import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirplaneEntity } from '../airplane/infrastructure/airplane.entity';
import { SeatEntity } from '../airplane/infrastructure/seat.entity';
import { AirplaneSummaryEntity } from '../projection/entities/airplane-summary.entity';
import { BookingActivityEntity } from '../projection/entities/booking-activity.entity';
import { SeatMapEntity } from '../projection/entities/seat-map.entity';

/** Connection names used with @InjectDataSource(...) / @InjectRepository(..., name). */
export const WRITE_DB = 'write';
export const READ_DB = 'read';

/**
 * Two physically separate Postgres databases, two TypeORM DataSources.
 * Schemas are created by the SQL files under db/ (mounted into the containers),
 * so synchronize stays off and TypeORM only maps the entities.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      name: WRITE_DB,
      type: 'postgres',
      url: process.env.WRITE_DB_URL ?? 'postgres://postgres:postgres@localhost:5433/airline_write',
      entities: [AirplaneEntity, SeatEntity],
      synchronize: false,
      logging: ['error'],
      retryAttempts: 20,
      retryDelay: 3000,
    }),
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
  ],
})
export class DatabaseModule {}
