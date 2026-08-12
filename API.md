# Zen Garage Calendar API v1

Base URL:

`https://zengaragephuket.netlify.app/.netlify/functions/calendar-api`

Every request requires the header `X-API-Key: zg_live_...`. Create and revoke keys in **Settings → AI API access**. Send a stable UUID in `X-Request-Id` for every write request so an AI agent can safely trace retries.

## Read bookings

`GET ?resource=bookings&from=2026-08-01&to=2026-08-31&staffId=kirill&status=confirmed`

## Read availability

`GET ?resource=availability&from=2026-08-12&to=2026-08-26&staffId=kirill`

## Read staff and slot IDs

`GET ?resource=staff`

## Create a booking

`POST ?resource=bookings`

```json
{
  "staffId": "kirill",
  "date": "2026-08-20",
  "slotId": "k1",
  "client": "John Smith",
  "car": "BMW 330i",
  "work": "Diagnostics",
  "status": "confirmed",
  "notes": "Created by AI agent",
  "clientId": 123,
  "carId": 456
}
```

Creation returns `409` if the slot is occupied. Set `"upsert": true` only when intentional replacement is required.

## Edit or move a booking

`PATCH ?resource=bookings`

```json
{
  "key": "kirill__2026-08-20__k1",
  "changes": {
    "date": "2026-08-21",
    "slotId": "k2",
    "work": "Electrical diagnostics",
    "notes": "Moved by AI agent",
    "status": "pending"
  }
}
```

Allowed editable fields include staff, date, slot, client, vehicle, work, status, notes and client/vehicle IDs. Moving to an occupied slot returns `409`.

## Permanently delete a booking

`DELETE ?resource=bookings`

```json
{ "key": "kirill__2026-08-21__k2" }
```

The API key must have the `delete` scope. The deleted booking remains represented in the immutable audit log as `before_data`.

## Security

- API keys are generated from 256 bits of cryptographic randomness.
- Only SHA-256 key hashes are stored in PostgreSQL.
- Keys support read/write/delete scopes, expiration and immediate revocation.
- Requests are limited to 120 per minute per key.
- All write operations record key name, timestamp, request UUID, hashed IP and before/after data.
- API responses never contain stored key hashes or raw keys.
