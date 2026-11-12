# Feature Flags API

Backend for a feature flag service. Projects own environments and flags; every flag has its own
state in every environment: an on/off switch, a percentage rollout and explicit include/exclude
user lists. Applications evaluate flags with an environment SDK key, and evaluation is served from
a Redis snapshot that falls back to PostgreSQL when Redis is unavailable.

There is no frontend: the API is documented with Swagger at `/docs`.

## Stack

- Node.js 22+, TypeScript (strict), NestJS 12 (ESM)
- PostgreSQL 18 with Prisma 7 and the `@prisma/adapter-pg` driver adapter
- Redis 8 via ioredis for the evaluation cache
- Zod 4 with nestjs-zod for validation and OpenAPI schemas
- Jest for unit tests, oxlint and Prettier for linting
- Docker Compose: app, PostgreSQL, Redis and a one-shot migrate + seed service

## Data model

| Table           | Purpose                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`      | `key` (unique), `name`                                                                                                               |
| `environments`  | belongs to a project, `key` unique within the project, `sdk_key` unique (`sdk_` + 24 random bytes in base64url)                      |
| `flags`         | belongs to a project, `key` unique within the project, `name`, optional `description`                                                |
| `flag_states`   | primary key `(flag_id, environment_id)`: `enabled`, `rollout_percentage` (0-100, check constraint), `include_users`, `exclude_users` |
| `audit_entries` | `action`, `flag_key`, `environment_key`, `before` / `after` JSONB snapshots, indexed by `(project_id, created_at DESC)`              |

All foreign keys cascade, so deleting a project removes its environments, flags, states and audit
log. Every flag always has a state in every environment of its project: creating a flag adds a
disabled state everywhere, creating an environment adds a disabled state for every existing flag.
Both operations lock the project row, so they cannot race each other.

## Flag evaluation

The evaluator is a pure function (`src/evaluation/flag-evaluator.ts`) that applies the rules in a
fixed order and reports which rule decided:

1. `userId` is in `excludeUsers` → `false`, reason `EXCLUDED`
2. `userId` is in `includeUsers` → `true`, reason `INCLUDED`
3. the flag is disabled in the environment → `false`, reason `DISABLED`
4. otherwise the user is placed into a bucket and gets `true` when `bucket < rolloutPercentage`
   (`ROLLOUT_IN`), `false` otherwise (`ROLLOUT_OUT`)

User ids are compared exactly, without trimming or case folding. Explicit targeting works even when
the flag is disabled, so a flag can be switched off for everyone except testers.

### Buckets

```
bucket = uint32_be(sha256(`${flagKey}:${userId}`)[0..4]) % 100
```

- **Stable.** The bucket depends only on the flag key and the user id, so the same user gets the
  same answer on every call, on every instance, without storing anything per user.
- **Monotonic.** A user is included when `bucket < percentage`. Raising the percentage from 25 to 50
  only adds buckets 25-49; everyone who was already in buckets 0-24 stays enabled.
- **Independent per flag.** The flag key is part of the hash, so the first 10% of one flag are not
  the same users as the first 10% of another.
- **Uniform.** SHA-256 output is uniformly distributed; the modulo bias of `2^32 % 100` is
  negligible (below 10⁻⁷).

## Caching

For each environment the service keeps one Redis key with a snapshot of all flag states of that
environment (`ff:env:<environmentId>:snapshot`), without TTL.

- **Read.** `/evaluate` resolves the environment by SDK key, then reads the snapshot. On a miss the
  snapshot is built from PostgreSQL and written back.
- **Invalidate.** Every change of flags or states deletes the snapshots of the affected
  environments after the database transaction commits, so the next request sees the new state.
- **No stale writes.** Each environment also has a generation counter
  (`ff:env:<environmentId>:generation`). Invalidation increments it; a rebuilt snapshot is stored by a
  Lua script only if the generation has not changed since the read, so a slow reader cannot put an
  outdated snapshot back after an invalidation.
- **Redis down.** The client is configured with `enableOfflineQueue: false`, one retry and short
  connect/command timeouts, so requests never hang. Evaluation reads straight from PostgreSQL, flag
  management keeps working, and `/api/health` returns `503` naming `redis`.
- **Redis back.** Invalidations missed during the outage could leave snapshots stale, so on every
  (re)connection all `ff:*` keys are dropped and rebuilt on demand.

## API

All routes are prefixed with `/api`. Management endpoints have no authentication; evaluation
endpoints require the `X-SDK-Key` header.

| Method   | Path                                                 | Description                                                     |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `POST`   | `/projects`                                          | Create a project with `development` and `production`            |
| `GET`    | `/projects`                                          | List projects (`page`, `limit`)                                 |
| `GET`    | `/projects/:key`                                     | Project with environments, SDK keys and flag count              |
| `DELETE` | `/projects/:key`                                     | Delete a project with everything in it                          |
| `POST`   | `/projects/:key/environments`                        | Create an environment                                           |
| `POST`   | `/projects/:key/environments/:envKey/rotate-sdk-key` | Issue a new SDK key, the old one stops working immediately      |
| `POST`   | `/projects/:key/flags`                               | Create a flag, disabled everywhere with a 100% rollout          |
| `GET`    | `/projects/:key/flags`                               | List flags with states (`page`, `limit`, `q` searches key/name) |
| `GET`    | `/projects/:key/flags/:flagKey`                      | Flag with its state in every environment                        |
| `PATCH`  | `/projects/:key/flags/:flagKey`                      | Change `name` and/or `description`                              |
| `DELETE` | `/projects/:key/flags/:flagKey`                      | Delete a flag                                                   |
| `PUT`    | `/projects/:key/flags/:flagKey/environments/:envKey` | Replace the state of a flag in an environment                   |
| `GET`    | `/projects/:key/audit`                               | Audit log, newest first (`page`, `limit`, `flagKey`)            |
| `POST`   | `/evaluate`                                          | Evaluate every flag of the SDK key environment for a user       |
| `GET`    | `/evaluate/:flagKey?userId=`                         | Evaluate one flag and return the reason                         |
| `GET`    | `/health`                                            | PostgreSQL and Redis status                                     |

Validation rules:

- project and environment keys: `[a-z0-9-]`, 2-48 characters; flag keys also allow `_` and `.`
- names: 2-64 characters after trimming; descriptions: up to 500 characters
- `userId`: 1-128 characters
- `includeUsers` / `excludeUsers`: up to 1000 unique ids each, the lists must not overlap
- unknown body fields are rejected; `limit` is capped at 100

Every change of a flag, a state or an environment is written to the audit log with `before` and
`after` in the same transaction. SDK keys in the log are masked.

### Errors

Every error has the same shape:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Flag \"new-checkout\" already exists in project \"storefront\"",
  "path": "/api/projects/storefront/flags",
  "timestamp": "2026-11-12T12:00:00.000Z"
}
```

Validation errors return `400` with `message` as a list of `field: problem` strings. A missing or
unknown SDK key returns `401`; unexpected errors return `500` without internal details.

### Example

```bash
curl -s -X POST http://localhost:3600/api/evaluate \
  -H 'Content-Type: application/json' \
  -H 'X-SDK-Key: sdk_storefrontProductionSeedKey00001' \
  -d '{"userId": "qa-alice"}'
```

```json
{
  "environment": "production",
  "flags": { "dark-mode": false, "new-checkout": false, "promo_banner": false, "search.v2": true }
}
```

```bash
curl -s 'http://localhost:3600/api/evaluate/search.v2?userId=user-1042' \
  -H 'X-SDK-Key: sdk_storefrontProductionSeedKey00001'
```

```json
{ "flagKey": "search.v2", "value": false, "reason": "EXCLUDED" }
```

## Seed data

The seed is idempotent: running it again resets the seeded projects to the values below and keeps
anything else. SDK keys are fixed so they can be used right away.

| Project      | Environment   | SDK key                                |
| ------------ | ------------- | -------------------------------------- |
| `storefront` | `development` | `sdk_storefrontDevelopmentSeedKey0001` |
| `storefront` | `staging`     | `sdk_storefrontStagingSeedKey00000001` |
| `storefront` | `production`  | `sdk_storefrontProductionSeedKey00001` |
| `mobile-app` | `development` | `sdk_mobileAppDevelopmentSeedKey00001` |
| `mobile-app` | `production`  | `sdk_mobileAppProductionSeedKey000001` |

Flags in `production`:

| Project      | Flag             | State                                                                     |
| ------------ | ---------------- | ------------------------------------------------------------------------- |
| `storefront` | `new-checkout`   | enabled, 25% rollout                                                      |
| `storefront` | `dark-mode`      | disabled                                                                  |
| `storefront` | `search.v2`      | enabled, 10% rollout, includes `qa-alice`, `qa-bob`, excludes `user-1042` |
| `storefront` | `promo_banner`   | disabled, includes `beta-tester-1`, `beta-tester-2`                       |
| `mobile-app` | `onboarding-v2`  | enabled, 25% rollout                                                      |
| `mobile-app` | `offline-mode`   | enabled, 100%, excludes `device-legacy-1`, `device-legacy-2`              |
| `mobile-app` | `push-reminders` | disabled                                                                  |

The seed writes to PostgreSQL only. If you re-run it against a running app, restart the app (it
drops the cache on start) so evaluation picks up the reset state.

## Running

### Docker Compose

```bash
docker compose up -d --build
```

| Service    | Host port | Notes                                          |
| ---------- | --------- | ---------------------------------------------- |
| `app`      | 3600      | API at `/api`, Swagger at `/docs`              |
| `postgres` | 5439      | user / password / database: `flags`            |
| `redis`    | 6384      |                                                |
| `migrate`  |           | runs `prisma migrate deploy` and the seed once |

### Locally

PostgreSQL and Redis can come from the compose file:

```bash
docker compose up -d postgres redis
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run start:dev
```

Environment variables (validated on start):

| Variable       | Example                                         |
| -------------- | ----------------------------------------------- |
| `PORT`         | `3600`                                          |
| `DATABASE_URL` | `postgresql://flags:flags@localhost:5439/flags` |
| `REDIS_URL`    | `redis://localhost:6384`                        |
| `NODE_ENV`     | `development`, `production` or `test`           |

## Documentation

Swagger UI is served at <http://localhost:3600/docs>. Request bodies, responses, the error format
and the `X-SDK-Key` security scheme are generated from the Zod schemas.

## Tests and linting

```bash
npm test          # unit tests, PostgreSQL and Redis are mocked
npm run test:cov  # with coverage
npm run lint      # oxlint + Prettier check
npm run typecheck
npm run build
```
