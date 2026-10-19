import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WRITE_DB } from '../../database/database.module';
import { Airplane } from '../domain/airplane';
import { AIRPLANE_REPOSITORY, AirplaneRepository } from './airplane.repository';
import { CommandResult } from './commands/commands';

/**
 * The classic DDD write path:
 *   BEGIN -> load aggregate FOR UPDATE -> run behaviour -> save -> COMMIT
 * Any thrown DomainError rolls the transaction back and releases the lock.
 */
@Injectable()
export class AirplaneUnitOfWork {
  private readonly logger = new Logger(AirplaneUnitOfWork.name);

  constructor(
    @InjectDataSource(WRITE_DB) private readonly dataSource: DataSource,
    @Inject(AIRPLANE_REPOSITORY) private readonly airplanes: AirplaneRepository,
  ) {}

  async mutate(airplaneId: string, action: (airplane: Airplane) => void): Promise<CommandResult> {
    return this.dataSource.transaction(async (manager) => {
      // Fail fast instead of queueing forever behind a slow writer.
      await manager.query(`SET LOCAL lock_timeout = '5s'`);

      const airplane = await this.airplanes.findByIdForUpdate(manager, airplaneId);
      action(airplane);
      await this.airplanes.save(manager, airplane);

      this.logger.log(`airplane ${airplane.tailNumber} -> version ${airplane.version}`);
      return { airplaneId: airplane.id, version: airplane.version };
    });
  }

  async create(factory: (repo: AirplaneRepository) => Airplane): Promise<CommandResult> {
    return this.dataSource.transaction(async (manager) => {
      const airplane = factory(this.airplanes);
      await this.airplanes.insert(manager, airplane);
      this.logger.log(`airplane ${airplane.tailNumber} created with ${airplane.allSeats.length} seats`);
      return { airplaneId: airplane.id, version: airplane.version };
    });
  }
}
