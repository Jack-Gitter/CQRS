# CQRS demo: NestJS + TypeORM + two Postgres databases + Debezium CDC

A small airline seat-booking service that shows the classic CQRS split:

* **Command side** writes to a *write* Postgres database through a DDD-style `Airplane`
  aggregate root that is loaded under a **pessimistic lock** (`SELECT ... FOR UPDATE`).
* **Debezium Server** tails the write database's WAL (logical replication, `pgoutput`)
  and pushes every row change to the API over HTTP.
* **Projectors** turn those row changes into **denormalized read models** in a second,
  physically separate *read* Postgres database.
* **Query side** serves HTTP reads exclusively from the read database.

```
          commands                                   queries
   POST /airplanes/:id/seats/1A/book           GET /airplanes, GET /airplanes/:id ...
                 │                                           ▲
                 ▼                                           │
 ┌──────────────────────────── NestJS API (one process) ───────────────────────────┐
 │  CommandBus → handler → UnitOfWork                     QueryBus → query handlers │
 │     BEGIN; SELECT airplane FOR UPDATE;                     (TypeORM, READ_DB)    │
 │     airplane.bookSeat(); UPDATE seats; COMMIT                                    │
 │                                            POST /internal/cdc → ProjectionService│
 │                                              airplane_summary / seat_map /       │
 │                                              booking_activity projectors         │
 └──────┬───────────────────────────────────────────▲───────────────────┬───────────┘
        │ TypeORM (WRITE_DB)                        │ HTTP sink         │ TypeORM (READ_DB)
        ▼                                           │                   ▼
 ┌─────────────┐   WAL (pgoutput)   ┌───────────────┴─┐          ┌─────────────┐
 │  write-db   │ ─────────────────▶ │ Debezium Server │          │   read-db   │
 │ airplanes   │ replication slot   │ (no Kafka)      │          │ airplane_   │
 │ seats       │                    └─────────────────┘          │  summary    │
 └─────────────┘                                                 │ seat_map    │
                                                                 │ booking_    │
                                                                 │  activity   │
                                                                 └─────────────┘
```

## Run it

```bash
cd CQRS
docker compose up --build        # write-db, read-db, api, debezium
./scripts/demo.sh                # in a second terminal: full command/query walkthrough
```

Watch the pipeline while the demo runs:

```bash
docker compose logs -f api        # "[u] seat 1A BOOKED (Ada Lovelace) -> seat_map", lock messages, ...
docker compose logs -f debezium   # snapshot + streaming progress
```

| Service   | Port | Notes                                              |
|-----------|------|----------------------------------------------------|
| api       | 3000 | NestJS, commands + queries + CDC endpoint          |
| write-db  | 5433 | `postgres://postgres:postgres@localhost:5433/airline_write` |
| read-db   | 5434 | `postgres://postgres:postgres@localhost:5434/airline_read`  |
| debezium  | 8089 | `http://localhost:8089/q/health`                   |

The write DB is seeded with one airplane (`N737DM`, 36 seats, 1A pre-booked) so the
Debezium **initial snapshot** immediately populates the read models on first start.

Reset everything (including Debezium's WAL offset): `docker compose down -v`.

## HTTP API

Command side (writes; returns only `{ airplaneId, version }`):

| Method | Path                                      | Body                                                                            |
|--------|-------------------------------------------|---------------------------------------------------------------------------------|
| POST   | `/airplanes`                              | `{ tailNumber, model, baseTicketPrice, rows, seatsPerRow, firstClassRows }`     |
| POST   | `/airplanes/:id/seats/:seatNumber/book`   | `{ passengerName }`                                                             |
| POST   | `/airplanes/:id/seats/:seatNumber/cancel` |                                                                                 |
| PUT    | `/airplanes/:id/price`                    | `{ baseTicketPrice }`                                                           |
| POST   | `/airplanes/:id/ground`                   |                                                                                 |
| POST   | `/airplanes/:id/reactivate`               |                                                                                 |

Query side (reads from the read DB only):

| Method | Path                                                  | Returns                                   |
|--------|-------------------------------------------------------|-------------------------------------------|
| GET    | `/airplanes`                                          | `airplane_summary` rows                   |
| GET    | `/airplanes/:id`                                      | summary + full seat map                   |
| GET    | `/airplanes/:id/seats?status=AVAILABLE&cabinClass=FIRST` | filtered seat map                      |
| GET    | `/airplanes/:id/activity`, `/activity`                | booking activity feed                     |

Internal: `POST /internal/cdc` is the Debezium HTTP sink target (not meant for clients).

## The write model (DDD)

`api/src/airplane/domain/`

* `Airplane` is the aggregate root; `Seat` is an entity inside it and is never modified
  except through the root.
* Invariants enforced by the aggregate:
  * a seat can be booked only once
  * a passenger can hold at most one seat per airplane
  * a grounded airplane accepts no bookings
  * an airplane with booked seats cannot be grounded
  * the base price is positive and cannot be raised by more than 50% in one change
* Invariant violations throw `DomainError` subclasses; `DomainExceptionFilter` maps them
  to 400/404/409/422.

`api/src/airplane/infrastructure/` holds the TypeORM **persistence model**
(`AirplaneEntity`, `SeatEntity`) and the repository that maps rows ↔ aggregate. The domain
class has no decorators and no knowledge of TypeORM.

### Load → lock → act → save

`AirplaneUnitOfWork.mutate()` is the whole write path:

```ts
return this.dataSource.transaction(async (manager) => {
  await manager.query(`SET LOCAL lock_timeout = '5s'`);
  const airplane = await this.airplanes.findByIdForUpdate(manager, id); // SELECT ... FOR UPDATE
  action(airplane);                                                      // e.g. airplane.bookSeat('1A', 'Ada')
  await this.airplanes.save(manager, airplane);                          // UPDATE root (version+1) + changed seats
  return { airplaneId: airplane.id, version: airplane.version };
});
```

The repository locks with TypeORM's `lock: { mode: 'pessimistic_write' }`. Concurrent
commands on the same airplane serialize on that row lock, so the "10 concurrent bookings of
seat 4F" step in the demo always yields exactly one `200` and nine `409`s. The aggregate
tracks which seats it touched so only those rows are updated, which keeps the WAL (and thus
the CDC stream) free of no-op writes.

## CDC: Debezium → read models

`debezium/application.properties` configures Debezium Server with:

* **source**: the Postgres connector on `write-db` using the built-in `pgoutput` plugin, a
  replication slot, an auto-created publication for `public.airplanes` and `public.seats`,
  `snapshot.mode=initial` and `decimal.handling.mode=double`.
* **sink**: `http`, pointing at `http://api:3000/internal/cdc`. Each change becomes one POST
  with the JSON envelope `{ before, after, source, op, ts_ms }` (`op` ∈ `c`/`u`/`d`/`r`).

Both write tables use `REPLICA IDENTITY FULL` so update events carry the full `before`
image; the activity projector uses it to detect `AVAILABLE → BOOKED` transitions.

`api/src/projection/` applies each event in **one read-DB transaction**:

| Source table | Projector                  | Read model          | What it does                                                         |
|--------------|----------------------------|---------------------|----------------------------------------------------------------------|
| `airplanes`  | `AirplaneSummaryProjector` | `airplane_summary`  | upsert identity/price/status/version, reprice `seat_map`, recount    |
| `seats`      | `SeatMapProjector`         | `seat_map`          | upsert flat seat row with computed price, recount summary            |
| `seats`      | `BookingActivityProjector` | `booking_activity`  | insert SEAT_BOOKED / SEAT_RELEASED when `before.status != after.status` |

The read models differ deliberately from the write tables: `airplane_summary` has
`totalSeats`, `seatsAvailable`, `seatsBooked`, `firstClassAvailable`, `economyAvailable`,
`occupancyPct`, `bookedRevenue`, `potentialRevenue` and `writeVersion`; `seat_map` carries
the effective price; `booking_activity` is an event-shaped feed that does not exist on the
write side at all.

### Delivery guarantees

Debezium commits its offset only after the API returns 2xx, so delivery is **at least once**
and events may be redelivered after a crash. The projectors are therefore idempotent:
upserts keyed by primary key, summary counters recomputed from `seat_map` rather than
incremented, and `booking_activity` de-duplicated on `(source_lsn, seat_id)`.

Reads are **eventually consistent**. Commands return the new `version`; a client can poll
`GET /airplanes/:id` until `writeVersion >= version` (that is what `scripts/demo.sh` does).

## Layout

```
CQRS/
├── docker-compose.yml
├── debezium/application.properties        Debezium Server: Postgres source → HTTP sink
├── db/write/001_schema.sql, 002_seed.sql  write DB schema (+ REPLICA IDENTITY FULL) and seed
├── db/read/001_schema.sql                 read model schema
├── scripts/demo.sh                        curl walkthrough
└── api/                                   NestJS + TypeORM
    └── src/
        ├── database/database.module.ts    two TypeORM DataSources (WRITE_DB, READ_DB)
        ├── airplane/                      COMMAND SIDE
        │   ├── domain/                    Airplane aggregate, Seat, domain errors (pure TS)
        │   ├── application/               commands, handlers, repository port, unit of work
        │   ├── infrastructure/            TypeORM entities + repository (FOR UPDATE)
        │   └── api/                       command controller + DTO validation
        ├── projection/                    CDC endpoint, read-model entities, projectors
        └── queries/                       QUERY SIDE: query handlers + controller
```

## Where to take it next

* **Transactional outbox**: have the aggregate emit domain events into an `outbox` table in
  the same transaction and let Debezium's outbox event router stream *events* instead of row
  diffs. The projectors then consume `SeatBooked` rather than inferring it from `before`/`after`.
* **Kafka**: swap the HTTP sink for Kafka/Redpanda and a consumer group to decouple the
  projector from the API process and allow multiple independent read models.
* **Rebuilds**: truncate the read DB and restart Debezium with a fresh offset
  (`docker compose down -v`) to replay everything from a new snapshot.
# CQRS
