import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WRITE_DB } from '../database/database.module';
import { AirplaneCommandController } from './api/airplane-command.controller';
import { AirplaneUnitOfWork } from './application/airplane-unit-of-work';
import { COMMAND_HANDLERS } from './application/handlers/airplane.handlers';
import { Airplane } from './domain/airplane';
import { Seat } from './domain/seat';
import { AirplaneRepository } from './infrastructure/airplane.repository';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([Airplane, Seat], WRITE_DB)],
  controllers: [AirplaneCommandController],
  providers: [AirplaneUnitOfWork, AirplaneRepository, ...COMMAND_HANDLERS],
})
export class AirplaneModule {}
