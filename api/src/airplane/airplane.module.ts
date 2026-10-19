import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WRITE_DB } from '../database/database.module';
import { AirplaneCommandController } from './api/airplane-command.controller';
import { AirplaneUnitOfWork } from './application/airplane-unit-of-work';
import { AIRPLANE_REPOSITORY } from './application/airplane.repository';
import { COMMAND_HANDLERS } from './application/handlers/airplane.handlers';
import { AirplaneEntity } from './infrastructure/airplane.entity';
import { SeatEntity } from './infrastructure/seat.entity';
import { TypeOrmAirplaneRepository } from './infrastructure/typeorm-airplane.repository';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([AirplaneEntity, SeatEntity], WRITE_DB)],
  controllers: [AirplaneCommandController],
  providers: [
    AirplaneUnitOfWork,
    { provide: AIRPLANE_REPOSITORY, useClass: TypeOrmAirplaneRepository },
    ...COMMAND_HANDLERS,
  ],
})
export class AirplaneModule {}
