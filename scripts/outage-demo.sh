#!/usr/bin/env bash
# Shows why Kafka sits between Debezium and the projector, and why the projector
# is its own service: it goes down, the API keeps accepting commands, Debezium
# keeps publishing to Kafka, and when the projector comes back it catches up
# from its committed offset. Nothing is lost.
set -euo pipefail

API="${API:-http://localhost:3000}"
PLANE=11111111-1111-4111-8111-111111111111   # seeded N737DM
SEAT=6F

pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }
step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
seat_json() { curl -s "$API/airplanes/$PLANE/seats" | grep -o "{[^{}]*\"seatNumber\":\"$SEAT\"[^{}]*}"; }

step "1. Seat $SEAT on N737DM before the outage (read model)"
seat_json | pretty

step "2. Stop the projector service (the API stays up)"
docker compose stop projector

step "3. COMMAND through the API while the projector is down -> accepted (write DB)"
curl -s -X POST "$API/airplanes/$PLANE/seats/$SEAT/book" -H 'content-type: application/json' \
  -d '{"passengerName":"Offline Olivia"}' | pretty

step "4. QUERY: the read model is stale (still AVAILABLE) because nobody is projecting"
seat_json | pretty

step "5. ...but Debezium already published the change to Kafka (last message on the seats topic)"
docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic airline.public.seats \
  --from-beginning --timeout-ms 5000 2>/dev/null | tail -1 | cut -c1-220
echo "..."

step "6. Consumer group lag while the projector is down"
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group airline-read-model-projector 2>/dev/null \
  | awk '/airline.public/ {print $2, "partition", $3, "current", $4, "end", $5, "lag", $6}'

step "7. Start the projector again and wait for it to catch up"
docker compose start projector
for _ in $(seq 1 60); do
  if seat_json | grep -q '"status":"BOOKED"'; then break; fi
  sleep 1
done

step "8. Seat $SEAT after the outage (read model caught up)"
seat_json | pretty

step "9. Activity feed shows the booking that happened during the outage"
curl -s "$API/airplanes/$PLANE/activity?limit=1" | pretty
