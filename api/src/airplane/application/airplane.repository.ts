import { EntityManager } from 'typeorm';
import { Airplane } from '../domain/airplane';

export const AIRPLANE_REPOSITORY = Symbol('AirplaneRepository');

/**
 * Port used by command handlers. Every method takes the transactional
 * EntityManager so the lock acquired in findByIdForUpdate() is held until
 * the surrounding transaction commits.
 */
export interface AirplaneRepository {
  nextId(): string;
  /** SELECT ... FOR UPDATE on the root row, then load the whole aggregate. */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<Airplane>;
  insert(manager: EntityManager, airplane: Airplane): Promise<void>;
  /** Persist root changes + only the seats the aggregate marked as changed; bumps version. */
  save(manager: EntityManager, airplane: Airplane): Promise<void>;
}
