# CQRS demo: NestJS + TypeORM + two Postgres databases + Debezium CDC + Kafka

A small airline seat-booking service that shows the classic CQRS split:

* **Command side** writes to a *write* Postgres database through a DDD-style `Airplane`
  aggregate root that is loaded under a **pessimistic lock** (`SELECT ... FOR UPDATE`).
* **Debezium Server** tails the write database's WAL (logical replication, `pgoutput`)
  and publishes every row change to **Kafka**, one topic per table.
* A separate **projector service** consumes those topics with kafkajs and runs **projectors**
  that build **denormalized read models** in a second, physically separate *read* Postgres
  database.
* **Query side** (in the API) serves HTTP reads exclusively from the read database.

Two NestJS apps in one monorepo: `apps/api` (commands + queries, knows nothing about Kafka)
and `apps/projector` (headless Kafka consumer + projectors). `libs/shared` holds what both
need: the read-model entities, the Debezium event shape and the cabin price table.

```
          commands                                   queries
   POST /airplanes/:id/seats/1A/book           GET /airplanes, GET /airplanes/:id ...
                 │                                           ▲
                 ▼                                           │
 ┌──────────────────── apps/api (NestJS) ─────────────────────────┐
 │  CommandBus → handler → UnitOfWork        QueryBus → handlers  │
 │     BEGIN; SELECT airplane FOR UPDATE;      (TypeORM, READ_DB) │
 │     airplane.bookSeat(); UPDATE seats; COMMIT                  │
 └──────┬────────────────────────────────────────────────▲────────┘
        │ TypeORM (WRITE_DB)                              │ read
        ▼                                                 │
 ┌─────────────┐  WAL (pgoutput)  ┌─────────────────┐     │
 │  write-db   │ ───────────────▶ │ Debezium Server │     │
 │ airplanes   │ replication slot │                 │     │
 │ seats       │                  └────────┬────────┘     │
 └─────────────┘                           │ produce      │
                                           ▼              │
                                  ┌─────────────────┐     │
                                  │      kafka      │     │
                                  │ airline.public. │     │
                                  │   airplanes     │     │
                                  │ airline.public. │     │
                                  │   seats         │     │
                                  └────────┬────────┘     │
                                           │ consume      │
                                           ▼              │
 ┌──────────────── apps/projector (NestJS, headless) ─────┼────────┐
 │  CdcConsumer (kafkajs, group airline-read-model-projector)      │
 │     → ProjectionService → airplane_summary / seat_map /         │
 │                           booking_activity projectors           │
 └──────────────────────────────────┬──────────────────────────────┘
                                    │ TypeORM (READ_DB)   ┌─────────────┐
                                    └───────────────────▶ │   read-db   │
                                                          │ airplane_   │
                                                          │  summary    │
                                                          │ seat_map    │
                                                          │ booking_    │
                                                          │  activity   │
                                                          └─────────────┘
```

## Run it

```bash
cd CQRS
docker compose up --build        # write-db, read-db, kafka, kafka-ui, debezium, api, projector
open http://localhost:3000/docs   # Swagger UI: try every command and query from the browser
open http://localhost:8090        # Kafka UI: watch CDC messages land on the topics
./scripts/demo.sh                # in a second terminal: full command/query walkthrough
./scripts/outage-demo.sh         # stop the projector, keep booking, watch it catch up
```

Watch the pipeline while the demo runs:

```bash
docker compose logs -f projector  # "[u] seat 1A BOOKED (Ada Lovelace) -> seat_map"
docker compose logs -f api        # "airplane N320XY -> version 3"
docker compose logs -f debezium   # snapshot + streaming progress

# tail a topic from the host (kcat) or inside the container
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic airline.public.seats --from-beginning
```

| Service   | Port | Notes                                              |
|-----------|------|----------------------------------------------------|
| api       | 3000 | NestJS, commands + queries. Swagger UI at `http://localhost:3000/docs` |
| projector | none | NestJS headless, Kafka consumer + projectors        |
| write-db  | 5433 | `postgres://postgres:postgres@localhost:5433/airline_write` |
| read-db   | 5434 | `postgres://postgres:postgres@localhost:5434/airline_read`  |
| kafka     | 29092 | bootstrap server for host clients (`localhost:29092`) |
| kafka-ui  | 8090 | Kafbat UI: topics, messages, consumer groups and lag (`http://localhost:8090`) |
| debezium  | 8089 | `http://localhost:8089/q/health`                   |

The write DB is seeded with one airplane (`N737DM`, 36 seats, 1A pre-booked) so the
Debezium **initial snapshot** immediately populates the read models on first start.

Reset everything (databases, Kafka topics, Debezium's WAL offset): `docker compose down -v`.

## HTTP API

Everything below is also browsable and executable from Swagger UI at `http://localhost:3000/docs`.

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

## The write model (DDD)

`apps/api/src/airplane/domain/`

* `Airplane` is the aggregate root **and** the TypeORM entity for the `airplanes` table
  ("rich entity" style). `Seat` is an entity inside it, mapped to `seats`, and is never
  modified except through the root.
* Identity columns are `readonly`; state that has invariants (`status`, `baseTicketPrice`,
  seat `status`/`passengerName`) is `private` and exposed through getters, so the only way to
  change it is a domain method.
* Invariants enforced by the aggregate:
  * a seat can be booked only once
  * a passenger can hold at most one seat per airplane
  * a grounded airplane accepts no bookings
  * an airplane with booked seats cannot be grounded
  * the base price is positive and cannot be raised by more than 50% in one change
* Invariant violations throw `DomainError` subclasses; `DomainExceptionFilter` maps them
  to 400/404/409/422.

`Airplane.create()` is the factory: it validates the layout and generates the seat
entities (`1A`, `1B`, ... with the first N rows as first class).

### Load → lock → act → save

`AirplaneUnitOfWork.mutate()` is the whole write path:

```ts
return this.dataSource.transaction(async (manager) => {
  await manager.query(`SET LOCAL lock_timeout = '5s'`);
  const airplane = await this.airplanes.findByIdForUpdate(manager, id); // SELECT ... FOR UPDATE OF airplane
  action(airplane);                                                      // e.g. airplane.bookSeat('1A', 'Ada')
  await this.airplanes.save(manager, airplane);                          // version += 1; manager.save()
  return { airplaneId: airplane.id, version: airplane.version };
});
```

`AirplaneRepository.findByIdForUpdate()` joins the seats and locks only the root row with
`setLock('pessimistic_write', undefined, ['airplane'])`, which emits `FOR UPDATE OF airplane`
(Postgres refuses to lock the nullable side of an outer join). Concurrent commands on the
same airplane serialize on that lock, so the "10 concurrent bookings of seat 4F" step in the
demo always yields exactly one `200` and nine `409`s. Because the row is locked there is no
optimistic `WHERE version = ...` check on save; `version` is only bumped so the read model can
expose it as `writeVersion`.

`manager.save(airplane)` diffs the loaded graph against the database and updates only the
root and the seats that actually changed, so one booking produces exactly two WAL events
(airplane + seat) and the CDC stream stays free of no-op writes.

## CDC: Debezium → Kafka → read models

`debezium/application.properties` configures Debezium Server with:

* **source**: the Postgres connector on `write-db` using the built-in `pgoutput` plugin, a
  replication slot, an auto-created publication for `public.airplanes` and `public.seats`,
  `snapshot.mode=initial` and `decimal.handling.mode=double`.
* **sink**: `kafka`. Each change becomes one message on `airline.public.<table>` with the
  row's primary key as the message key and the JSON envelope
  `{ before, after, source, op, ts_ms }` as the value (`op` ∈ `c`/`u`/`d`/`r`).

Both write tables use `REPLICA IDENTITY FULL` so update events carry the full `before`
image; the activity projector uses it to detect `AVAILABLE → BOOKED` transitions.

`CdcConsumer` (`apps/projector/src/projection/cdc.consumer.ts`) is a kafkajs consumer in
group `airline-read-model-projector`, running in its own process. It subscribes to both topics
and hands each message to `ProjectionService`, which applies the matching projectors in
**one read-DB transaction**:

| Source topic               | Projector                  | Read model          | What it does                                                         |
|----------------------------|----------------------------|---------------------|----------------------------------------------------------------------|
| `airline.public.airplanes` | `AirplaneSummaryProjector` | `airplane_summary`  | upsert identity/price/status/version, reprice `seat_map`, recount    |
| `airline.public.seats`     | `SeatMapProjector`         | `seat_map`          | upsert flat seat row with computed price, recount summary            |
| `airline.public.seats`     | `BookingActivityProjector` | `booking_activity`  | insert SEAT_BOOKED / SEAT_RELEASED when `before.status != after.status` |

The read models differ deliberately from the write tables: `airplane_summary` has
`totalSeats`, `seatsAvailable`, `seatsBooked`, `firstClassAvailable`, `economyAvailable`,
`occupancyPct`, `bookedRevenue`, `potentialRevenue` and `writeVersion`; `seat_map` carries
the effective price; `booking_activity` is an event-shaped feed that does not exist on the
write side at all.

### What Kafka buys you

Debezium does not care whether the projector is running, and the API does not care either.
If the projector is down, commands keep being accepted, Debezium keeps publishing, the broker
keeps the messages, and the consumer group's offset simply stops advancing. When the projector
comes back it resumes from the last committed offset and catches up. `scripts/outage-demo.sh`
shows exactly this: it stops the projector, books a seat through the API, shows the stale
read model and the consumer-group lag, restarts the projector and shows the read model updated.

Other things the broker gives you that the direct HTTP sink did not: several independent
consumer groups can build several read models from the same stream, a new read model can
be built by replaying the topic from the beginning (`fromBeginning: true` with a fresh
group id), and bursts on the write side are buffered instead of back-pressuring Debezium.

### Delivery guarantees

The consumer commits offsets only after `ProjectionService.project()` resolves, so delivery
is **at least once**: a crash mid-projection replays the event. If projecting throws,
kafkajs retries and then restarts the consumer from the last committed offset, so a bad
event blocks the partition rather than being skipped silently. The projectors are therefore
idempotent: upserts keyed by primary key, summary counters recomputed from `seat_map` rather
than incremented, and `booking_activity` de-duplicated on `(source_lsn, seat_id)`.

Ordering is guaranteed **within** a topic (one partition each here) but **not across** the
`airplanes` and `seats` topics. Every projector tolerates either order: a seat arriving before
its airplane gets price `0` and is repriced when the airplane row lands, and counts are always
recomputed from what is in `seat_map`.

Reads are **eventually consistent**. Commands return the new `version`; a client can poll
`GET /airplanes/:id` until `writeVersion >= version` (that is what `scripts/demo.sh` does).

## Layout

```
CQRS/
├── docker-compose.yml                     write-db, read-db, kafka, debezium, api, projector
├── Dockerfile                             builds either app: --build-arg APP=api|projector
├── nest-cli.json, tsconfig.json           NestJS monorepo (webpack build, @app/shared path alias)
├── debezium/application.properties        Debezium Server: Postgres source → Kafka sink
├── db/write/001_schema.sql, 002_seed.sql  write DB schema (+ REPLICA IDENTITY FULL) and seed
├── db/read/001_schema.sql                 read model schema
├── scripts/demo.sh                        curl walkthrough
├── scripts/outage-demo.sh                 projector outage + catch-up via Kafka
├── apps/
│   ├── api/src/                           COMMAND + QUERY API (HTTP, port 3000)
│   │   ├── database/database.module.ts    TypeORM DataSources WRITE_DB + READ_DB
│   │   ├── airplane/                      COMMAND SIDE
│   │   │   ├── domain/                    Airplane aggregate + Seat (TypeORM entities with behaviour), domain errors
│   │   │   ├── application/               commands, handlers, unit of work (transaction + lock)
│   │   │   ├── infrastructure/            repository: FOR UPDATE load + save
│   │   │   └── api/                       command controller + DTO validation
│   │   └── queries/                       QUERY SIDE: query handlers + controller
│   └── projector/src/                     PROJECTOR (headless, no HTTP)
│       ├── projector.module.ts            TypeORM DataSource READ_DB only
│       └── projection/                    CdcConsumer (kafkajs), ProjectionService, projectors
└── libs/shared/src/                       shared by both apps
    ├── read-models/                       airplane_summary / seat_map / booking_activity entities, READ_DB name
    ├── cdc/debezium-event.ts              Debezium envelope + row types
    └── pricing.ts                         cabin price multipliers
```

Local development without Docker for the apps (databases, Kafka and Debezium still from compose):

```bash
docker compose up write-db read-db kafka debezium
npm install
npm run start:api          # http://localhost:3000, uses localhost:5433 / 5434
npm run start:projector    # consumes from localhost:29092, writes to localhost:5434
```

## Where to take it next

* **Partition by aggregate**: route both tables into one topic partitioned by `airplane_id`
  (Debezium's `PartitionRouting` SMT) to get strict per-aggregate ordering and parallelism
  across aggregates.
* **Transactional outbox**: have the aggregate emit domain events into an `outbox` table in
  the same transaction and let Debezium's outbox event router stream *events* instead of row
  diffs. The projectors then consume `SeatBooked` rather than inferring it from `before`/`after`.
* **Kafka Connect**: Debezium Server is a single-process convenience. The usual production
  shape is the same connector running inside a Kafka Connect cluster, registered via its REST
  API, with offsets stored in Kafka instead of a file.
