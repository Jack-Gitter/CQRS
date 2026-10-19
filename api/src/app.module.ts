import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AirplaneModule } from './airplane/airplane.module';
import { HealthController } from './common/health.controller';
import { DatabaseModule } from './database/database.module';
import { ProjectionModule } from './projection/projection.module';
import { QueryModule } from './queries/query.module';

@Module({
  imports: [
    CqrsModule.forRoot(),
    DatabaseModule, // two TypeORM DataSources: WRITE_DB and READ_DB
    AirplaneModule, // command side: aggregate + pessimistic locking + command handlers
    QueryModule, // query side: reads denormalized models from READ_DB
    ProjectionModule, // Kafka consumer: Debezium CDC events -> read models
  ],
  controllers: [HealthController],
})
export class AppModule {}
