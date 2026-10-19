import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { AirplaneRepository } from '../application/airplane.repository';
import { Airplane, AirplaneStatus } from '../domain/airplane';
import { AirplaneNotFoundError } from '../domain/domain-errors';
import { CabinClass, Seat, SeatStatus } from '../domain/seat';
import { AirplaneEntity } from './airplane.entity';
import { SeatEntity } from './seat.entity';

@Injectable()
export class TypeOrmAirplaneRepository implements AirplaneRepository {
  nextId(): string {
    return randomUUID();
  }

  async findByIdForUpdate(manager: EntityManager, id: string): Promise<Airplane> {
    // Pessimistic lock on the aggregate root row: SELECT ... FOR UPDATE.
    // Concurrent commands on the same airplane queue up here until we commit.
    // (Seats are loaded separately: Postgres forbids FOR UPDATE on the nullable
    // side of an outer join, and locking the root is enough to serialise the aggregate.)
    const root = await manager.findOne(AirplaneEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!root) {
      throw new AirplaneNotFoundError(id);
    }

    const seatRows = await manager.find(SeatEntity, {
      where: { airplaneId: id },
      order: { seatNumber: 'ASC' },
    });

    return Airplane.reconstitute({
      id: root.id,
      tailNumber: root.tailNumber,
      model: root.model,
      baseTicketPrice: root.baseTicketPrice,
      status: root.status as AirplaneStatus,
      version: root.version,
      seats: seatRows.map((s) =>
        Seat.reconstitute({
          id: s.id,
          seatNumber: s.seatNumber,
          cabinClass: s.cabinClass as CabinClass,
          status: s.status as SeatStatus,
          passengerName: s.passengerName,
          bookedAt: s.bookedAt,
        }),
      ),
    });
  }

  async insert(manager: EntityManager, airplane: Airplane): Promise<void> {
    await manager.insert(AirplaneEntity, {
      id: airplane.id,
      tailNumber: airplane.tailNumber,
      model: airplane.model,
      baseTicketPrice: airplane.baseTicketPrice,
      status: airplane.status,
      version: 0,
    });

    await manager.insert(
      SeatEntity,
      airplane.allSeats.map((seat) => ({
        id: seat.id,
        airplaneId: airplane.id,
        seatNumber: seat.seatNumber,
        cabinClass: seat.cabinClass,
        status: seat.status,
        passengerName: seat.passengerName,
        bookedAt: seat.bookedAt,
      })),
    );

    airplane.markPersisted(0);
  }

  async save(manager: EntityManager, airplane: Airplane): Promise<void> {
    const nextVersion = airplane.version + 1;

    // The lock makes this safe, but the `version` predicate is a cheap second guard.
    const result = await manager.update(
      AirplaneEntity,
      { id: airplane.id, version: airplane.version },
      { baseTicketPrice: airplane.baseTicketPrice, status: airplane.status, version: nextVersion },
    );
    if (result.affected !== 1) {
      throw new Error(`Concurrent modification detected for airplane ${airplane.id}`);
    }

    // Only touched seats are written, so the WAL (and Debezium) only sees real changes.
    for (const seat of airplane.changedSeatList) {
      await manager.update(
        SeatEntity,
        { id: seat.id },
        { status: seat.status, passengerName: seat.passengerName, bookedAt: seat.bookedAt },
      );
    }

    airplane.markPersisted(nextVersion);
  }
}
