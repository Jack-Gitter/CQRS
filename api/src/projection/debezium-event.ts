/**
 * Shape of the JSON body Debezium Server's HTTP sink POSTs for each change
 * (debezium.format.value=json, schemas disabled).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DebeziumEvent<Row = any> {
  before: Row | null;
  after: Row | null;
  source: {
    version: string;
    connector: string;
    name: string;
    ts_ms: number;
    snapshot: 'true' | 'false' | 'last' | 'first' | 'incremental' | string;
    db: string;
    schema: string;
    table: string;
    txId: number | null;
    lsn: number | null;
  };
  /** c = create, u = update, d = delete, r = read (snapshot) */
  op: 'c' | 'u' | 'd' | 'r';
  ts_ms: number;
}

/** Row shapes as they appear in the WAL (snake_case, numeric as JSON number, timestamptz as ISO string). */
export interface AirplaneRow {
  id: string;
  tail_number: string;
  model: string;
  base_ticket_price: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SeatRow {
  id: string;
  airplane_id: string;
  seat_number: string;
  cabin_class: string;
  status: string;
  passenger_name: string | null;
  booked_at: string | null;
}
