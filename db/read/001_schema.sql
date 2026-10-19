-- READ MODELS (denormalized, shaped for queries, rebuilt by projectors from CDC events)

-- One row per airplane with everything a listing page needs. No joins at query time.
CREATE TABLE airplane_summary (
  airplane_id           uuid PRIMARY KEY,
  tail_number           text NOT NULL,
  model                 text NOT NULL,
  status                text NOT NULL,
  base_ticket_price     numeric(10, 2) NOT NULL,
  total_seats           integer NOT NULL DEFAULT 0,
  seats_available       integer NOT NULL DEFAULT 0,
  seats_booked          integer NOT NULL DEFAULT 0,
  first_class_available integer NOT NULL DEFAULT 0,
  economy_available     integer NOT NULL DEFAULT 0,
  occupancy_pct         numeric(5, 2) NOT NULL DEFAULT 0,
  booked_revenue        numeric(12, 2) NOT NULL DEFAULT 0,
  potential_revenue     numeric(12, 2) NOT NULL DEFAULT 0,
  write_version         integer NOT NULL DEFAULT 0,
  projected_at          timestamptz NOT NULL DEFAULT now()
);

-- Flat seat map with the *effective* price already computed.
CREATE TABLE seat_map (
  seat_id          uuid PRIMARY KEY,
  airplane_id      uuid NOT NULL,
  seat_number      text NOT NULL,
  seat_row         integer NOT NULL,
  cabin_class      text NOT NULL,
  price_multiplier numeric(4, 2) NOT NULL,
  price            numeric(10, 2) NOT NULL DEFAULT 0,
  status           text NOT NULL,
  passenger_name   text,
  booked_at        timestamptz,
  UNIQUE (airplane_id, seat_number)
);
CREATE INDEX seat_map_airplane_status_idx ON seat_map (airplane_id, status);

-- Append-only activity feed derived from seat status transitions in the WAL.
CREATE TABLE booking_activity (
  id             bigserial PRIMARY KEY,
  source_lsn     bigint NOT NULL,
  seat_id        uuid NOT NULL,
  airplane_id    uuid NOT NULL,
  seat_number    text NOT NULL,
  cabin_class    text NOT NULL,
  event_type     text NOT NULL,
  passenger_name text,
  occurred_at    timestamptz NOT NULL,
  UNIQUE (source_lsn, seat_id)  -- makes projection idempotent under at-least-once delivery
);
CREATE INDEX booking_activity_airplane_idx ON booking_activity (airplane_id, occurred_at DESC);
