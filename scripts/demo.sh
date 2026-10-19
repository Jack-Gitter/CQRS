#!/usr/bin/env bash
# End-to-end walkthrough of the CQRS flow. Requires: curl (jq optional, used for pretty output).
set -euo pipefail

API="${API:-http://localhost:3000}"

pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }
json_field() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }
step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# Poll the READ side until it has caught up with a given write version (eventual consistency).
wait_for_version() {
  local id="$1" version="$2"
  for _ in $(seq 1 100); do
    if curl -sf "$API/airplanes/$id" | grep -q "\"writeVersion\":$version[,}]"; then return 0; fi
    sleep 0.2
  done
  echo "read model did not reach version $version in time" >&2
  return 1
}

step "1. Read side already contains the seeded airplane (Debezium initial snapshot)"
curl -s "$API/airplanes" | pretty

step "2. COMMAND: create an airplane (write DB)"
CREATE=$(curl -s -X POST "$API/airplanes" -H 'content-type: application/json' \
  -d '{"tailNumber":"N320XY","model":"Airbus A320","baseTicketPrice":120,"rows":4,"seatsPerRow":6,"firstClassRows":1}')
echo "$CREATE" | pretty
ID=$(echo "$CREATE" | json_field airplaneId)
echo "airplaneId=$ID"

step "3. QUERY: wait for CDC -> projector, then read the summary (read DB)"
wait_for_version "$ID" 0
curl -s "$API/airplanes/$ID" | pretty | head -25

step "4. COMMAND: book 1A (first class) for Ada Lovelace"
curl -s -X POST "$API/airplanes/$ID/seats/1A/book" -H 'content-type: application/json' -d '{"passengerName":"Ada Lovelace"}' | pretty

step "5. COMMAND: book 2C (economy) for Grace Hopper"
curl -s -X POST "$API/airplanes/$ID/seats/2C/book" -H 'content-type: application/json' -d '{"passengerName":"Grace Hopper"}' | pretty

step "6. INVARIANT: 1A is already booked -> 409"
curl -s -X POST "$API/airplanes/$ID/seats/1A/book" -H 'content-type: application/json' -d '{"passengerName":"Alan Turing"}' | pretty

step "7. INVARIANT: Ada already holds a seat on this plane -> 409"
curl -s -X POST "$API/airplanes/$ID/seats/3D/book" -H 'content-type: application/json' -d '{"passengerName":"Ada Lovelace"}' | pretty

step "8. INVARIANT: cannot ground a plane with bookings -> 409"
curl -s -X POST "$API/airplanes/$ID/ground" | pretty

step "9. INVARIANT: price may not jump more than 50% -> 422"
curl -s -X PUT "$API/airplanes/$ID/price" -H 'content-type: application/json' -d '{"baseTicketPrice":500}' | pretty

step "10. COMMAND: raise price to 150 (allowed) -> seat prices in read model are repriced"
PRICE=$(curl -s -X PUT "$API/airplanes/$ID/price" -H 'content-type: application/json' -d '{"baseTicketPrice":150}')
echo "$PRICE" | pretty
V=$(echo "$PRICE" | grep -o '"version":[0-9]*' | cut -d: -f2)

step "11. QUERY: summary after bookings + price change (version $V)"
wait_for_version "$ID" "$V"
curl -s "$API/airplanes" | pretty

step "12. QUERY: available first-class seats"
curl -s "$API/airplanes/$ID/seats?status=AVAILABLE&cabinClass=FIRST" | pretty

step "13. PESSIMISTIC LOCK: 10 concurrent bookings of seat 4F -> exactly one wins"
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/airplanes/$ID/seats/4F/book" \
    -H 'content-type: application/json' -d "{\"passengerName\":\"Passenger $i\"}" &
done | sort | uniq -c
wait

step "14. COMMAND: cancel 2C"
CANCEL=$(curl -s -X POST "$API/airplanes/$ID/seats/2C/cancel")
echo "$CANCEL" | pretty
V=$(echo "$CANCEL" | grep -o '"version":[0-9]*' | cut -d: -f2)
wait_for_version "$ID" "$V"

step "15. QUERY: booking activity feed derived from WAL row transitions"
curl -s "$API/airplanes/$ID/activity" | pretty

step "Done. Inspect the DBs:"
echo "  write: docker compose exec write-db psql -U postgres airline_write -c 'select seat_number,status,passenger_name from seats order by 1'"
echo "  read:  docker compose exec read-db  psql -U postgres airline_read  -c 'select tail_number,total_seats,seats_available,booked_revenue,write_version from airplane_summary'"
