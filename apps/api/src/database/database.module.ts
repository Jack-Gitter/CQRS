import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airplane } from '../airplane/domain/airplane';
import { Seat } from '../airplane/domain/seat';
import { AirplaneSummaryEntity, BookingActivityEntity, READ_DB, SeatMapEntity } from '@app/shared';

/** Connection name for the write database. READ_DB comes from @app/shared so the projector uses the same name. */
export const WRITE_DB = 'write';
export { READ_DB };

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
      entities: [Airplane, Seat],
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
