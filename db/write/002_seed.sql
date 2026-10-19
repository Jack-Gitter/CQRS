-- A pre-existing airplane so the Debezium *initial snapshot* has something to replicate.
INSERT INTO airplanes (id, tail_number, model, base_ticket_price, status, version)
VALUES ('11111111-1111-4111-8111-111111111111', 'N737DM', 'Boeing 737-800', 199.00, 'ACTIVE', 0);

INSERT INTO seats (id, airplane_id, seat_number, cabin_class, status)
SELECT gen_random_uuid(),
       '11111111-1111-4111-8111-111111111111',
       r::text || l,
       CASE WHEN r <= 2 THEN 'FIRST' ELSE 'ECONOMY' END,
       'AVAILABLE'
FROM generate_series(1, 6) AS r,
     unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F']) AS l;

UPDATE seats
SET status = 'BOOKED', passenger_name = 'Amelia Earhart', booked_at = now()
WHERE airplane_id = '11111111-1111-4111-8111-111111111111' AND seat_number = '1A';
