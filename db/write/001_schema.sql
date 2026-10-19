-- WRITE MODEL (normalized, owned by the Airplane aggregate)

CREATE TABLE airplanes (
  id                uuid PRIMARY KEY,
  tail_number       text NOT NULL UNIQUE,
  model             text NOT NULL,
  base_ticket_price numeric(10, 2) NOT NULL,
  status            text NOT NULL,
  version           integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seats (
  id             uuid PRIMARY KEY,
  airplane_id    uuid NOT NULL REFERENCES airplanes (id) ON DELETE CASCADE,
  seat_number    text NOT NULL,
  cabin_class    text NOT NULL,
  status         text NOT NULL,
  passenger_name text,
  booked_at      timestamptz,
  UNIQUE (airplane_id, seat_number)
);

-- Make Debezium include the full "before" image on UPDATE/DELETE,
-- so projectors can detect transitions (e.g. AVAILABLE -> BOOKED).
ALTER TABLE airplanes REPLICA IDENTITY FULL;
ALTER TABLE seats     REPLICA IDENTITY FULL;
