import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Airplane } from '../domain/airplane';
import { AirplaneNotFoundError } from '../domain/domain-errors';

/**
 * Thin persistence gateway. Every method takes the transactional EntityManager
 * so the lock acquired in findByIdForUpdate() is held until the surrounding
 * transaction commits.
 */
@Injectable()
export class AirplaneRepository {
  /** Loads the whole aggregate (airplane + seats) with SELECT ... FOR UPDATE OF airplane. */
  async findByIdForUpdate(manager: EntityManager, id: string): Promise<Airplane> {
    const airplane = await manager
      .createQueryBuilder(Airplane, 'airplane')
      .leftJoinAndSelect('airplane.seats', 'seat')
      // Lock only the root row: Postgres refuses FOR UPDATE on the nullable side of an
      // outer join, and locking the root is enough to serialise the whole aggregate.
      .setLock('pessimistic_write', undefined, ['airplane'])
      .where('airplane.id = :id', { id })
      .orderBy('seat.seatNumber', 'ASC')
      .getOne();

    if (!airplane) {
      throw new AirplaneNotFoundError(id);
    }
    return airplane;
  }

  /**
   * Persists the aggregate. TypeORM diffs the loaded graph against the database,
   * so only the root (version bump) and the seats that actually changed are
   * UPDATEd, which keeps the WAL (and therefore the CDC stream) free of no-op writes.
   */
  async save(manager: EntityManager, airplane: Airplane): Promise<void> {
    airplane.version += 1;
    await manager.save(airplane);
  }

  /** Inserts a new aggregate; seats are cascaded in the same transaction. */
  async insert(manager: EntityManager, airplane: Airplane): Promise<void> {
    await manager.save(airplane);
  }
}
