#!/usr/bin/env bash
# Shows why Kafka sits between Debezium and the projector:
# the API (and with it the projector) goes down, writes keep flowing into the
# write DB, Debezium keeps publishing to Kafka, and when the API comes back the
# consumer catches up from its committed offset. Nothing is lost.
set -euo pipefail

API="${API:-http://localhost:3000}"
PLANE=11111111-1111-4111-8111-111111111111   # seeded N737DM
SEAT=6F

pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }
step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

step "1. Seat $SEAT on N737DM before the outage (read model)"
curl -s "$API/airplanes/$PLANE/seats" | grep -o "{[^{}]*\"seatNumber\":\"$SEAT\"[^{}]*}" | pretty

step "2. Stop the API (projector is now offline)"
docker compose stop api

step "3. Write directly to the WRITE database while the projector is down"
docker compose exec -T write-db psql -U postgres -d airline_write -v ON_ERROR_STOP=1 <<SQL
BEGIN;
UPDATE seats SET status = 'BOOKED', passenger_name = 'Offline Olivia', booked_at = now()
 WHERE airplane_id = '$PLANE' AND seat_number = '$SEAT';
UPDATE airplanes SET version = version + 1, updated_at = now() WHERE id = '$PLANE';
COMMIT;
SQL

step "4. Debezium already published the change to Kafka (last message on the seats topic)"
docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic airline.public.seats \
  --from-beginning --timeout-ms 5000 2>/dev/null | tail -1 | cut -c1-220
echo "..."

step "5. Consumer group offset lag while the API is down"
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group airline-read-model-projector 2>/dev/null \
  | awk 'NR==1 || /airline.public/' | awk '{print $2, "partition", $3, "current", $4, "end", $5, "lag", $6}'

step "6. Start the API again and wait for it to catch up"
docker compose start api
for _ in $(seq 1 60); do
  if curl -sf "$API/airplanes/$PLANE/seats" 2>/dev/null | grep -q "\"seatNumber\":\"$SEAT\",[^{}]*\"status\":\"BOOKED\"\|\"status\":\"BOOKED\"[^{}]*\"seatNumber\":\"$SEAT\""; then break; fi
  sleep 1
done

step "7. Seat $SEAT after the outage (read model caught up)"
curl -s "$API/airplanes/$PLANE/seats" | grep -o "{[^{}]*\"seatNumber\":\"$SEAT\"[^{}]*}" | pretty

step "8. Activity feed shows the booking that happened during the outage"
curl -s "$API/airplanes/$PLANE/activity?limit=1" | pretty
