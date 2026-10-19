import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AirplaneModule } from './airplane/airplane.module';
import { HealthController } from './common/health.controller';
import { DatabaseModule } from './database/database.module';
import { QueryModule } from './queries/query.module';

/**
 * The API knows nothing about Kafka or Debezium. It writes to WRITE_DB through
 * the aggregate and reads from READ_DB; the projector service fills READ_DB.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    DatabaseModule, // two TypeORM DataSources: WRITE_DB and READ_DB
    AirplaneModule, // command side: aggregate + pessimistic locking + command handlers
    QueryModule, // query side: reads denormalized models from READ_DB
  ],
  controllers: [HealthController],
})
export class AppModule {}
