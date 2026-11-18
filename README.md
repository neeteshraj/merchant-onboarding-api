# Merchant Onboarding API

NestJS service for the merchant application lifecycle: sales staff create applications, an asynchronous worker runs a (simulated) third-party KYB/risk check, admins assign reviewers, and the assigned reviewer approves, rejects or requests more information.

**Stack:** Node 24+, TypeScript 7, NestJS 12, PostgreSQL 18 + TypeORM 1.x, Redis 8 + BullMQ 6, MongoDB 8 (optional audit store), JWT, Swagger, Jest 30 + Supertest, Docker Compose, Yarn 4, oxlint.

---

## Quick start

```bash
cp .env.example .env
# fill in DB_PASSWORD, JWT_SECRET and KYB_WEBHOOK_SECRET (≥32 chars), SEED_USER_PASSWORD (≥12 chars)
# the JWT_SECRET line in .env.example shows a one-liner to generate one

docker compose up -d              # Postgres, Redis, MongoDB
yarn install
yarn build
yarn seed                         # runs migrations, creates demo users
yarn start                        # http://localhost:3000, docs at /docs
```

Run everything in containers instead (after `yarn seed` once):

```bash
docker compose --profile app up --build
```

Demo users (all use `SEED_USER_PASSWORD`): `admin@example.com`, `reviewer.one@example.com`, `reviewer.two@example.com`, `sales.one@example.com`, `sales.two@example.com`.

### Scripts

| Script | Purpose |
|---|---|
| `yarn start:dev` | Watch mode |
| `yarn typecheck` / `yarn lint` | `tsc --noEmit` over `src` + `test` / oxlint (`no-explicit-any` is an error) |
| `yarn test` / `yarn test:cov` | Unit tests |
| `yarn test:e2e` | Integration tests against the Compose Postgres + Redis |
| `yarn migration:run` / `migration:revert` | Apply / roll back migrations |
| `yarn migration:generate src/database/migrations/<name>` | Diff entities against the database |

---

## API

All routes except `POST /auth/login` and `POST /webhooks/kyb` require `Authorization: Bearer <token>`. Full schema at `/docs`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Returns a JWT |
| POST | `/applications` | SALES, ADMIN | Creates a `DRAFT` |
| GET | `/applications?status=&page=&limit=` | all | Scoped to the caller (see below) |
| GET | `/applications/:id` | all | 404 outside the caller's scope |
| PATCH | `/applications/:id` | SALES (owner), ADMIN | Only while `DRAFT` / `INFO_REQUESTED` |
| POST | `/applications/:id/submit` | SALES (owner), ADMIN | Enqueues the risk review |
| POST | `/applications/:id/assign` | ADMIN | `{ reviewerId }` |
| POST | `/applications/:id/decision` | REVIEWER (assigned) | `{ decision: APPROVE \| REJECT \| REQUEST_INFO, reason? }` |
| POST | `/applications/:id/risk-review` | ADMIN | Re-runs a failed or lost review |
| GET | `/applications/:id/audit-logs` | ADMIN | Oldest first |
| POST | `/webhooks/kyb` | KYB provider (HMAC-signed) | Asynchronous check results; see below |

### Lifecycle

```
DRAFT ─submit─▶ SUBMITTED ─assign─▶ UNDER_REVIEW ─approve─▶ APPROVED
                                      │  ▲         ─reject──▶ REJECTED
                         request-info │  │ resubmit
                                      ▼  │
                                  INFO_REQUESTED
```

- Editable only in `DRAFT` and `INFO_REQUESTED`.
- Approval requires `riskStatus = COMPLETED`; reject / request-info do not.
- Resubmission after `REQUEST_INFO` goes straight back to the assigned reviewer with a fresh risk review.
- Every other transition returns **409**.

The table lives in [`application-lifecycle.ts`](src/modules/applications/domain/application-lifecycle.ts) and is unit tested exhaustively (every `from × to` pair).

---

## Architecture

```
src/
├── config/            validated, typed environment (fails fast on boot)
├── database/          DataSource options, migrations, seed, abstract base entities,
│                      TransactionRunner port + TypeORM implementation, TypeOrmRepository base
├── redis/             shared ioredis connection for BullMQ
├── mongo/             lazy MongoDB client (only used when AUDIT_STORE=mongo)
├── common/            exception filter, request logging, pagination, redaction
└── modules/
    ├── auth/          login, JWT guard, roles guard, PasswordHasher + TokenService ports
    ├── users/         User entity + UserRepository
    ├── applications/  controller, ApplicationsService, access policy, lifecycle rules, repository
    ├── risk/          RiskReviewQueue (producer), BullMQ processor, RiskReviewService, KybProvider
    ├── webhooks/      signed KYB callback: signature guard + verifier, event de-duplication
    └── audit/         AuditService + append-only AuditLogRepository (Postgres or Mongo)
test/                  e2e specs, in-memory fakes of every port, fixtures
```

**Ports and adapters with abstract classes.** Every collaborator a service depends on is an abstract class used directly as the Nest DI token, with a concrete class bound in the module:

| Port (abstract) | Implementation |
|---|---|
| `ApplicationsService`, `AuditService`, `AuthService`, `RiskReviewService` | `…ServiceImpl` |
| `MerchantApplicationRepository`, `UserRepository`, `RiskAssessmentRepository`, `WebhookEventRepository` | `TypeOrm…Repository` (extending the abstract `TypeOrmRepository<T>`) |
| `AuditLogRepository` | `TypeOrmAuditLogRepository` or `MongoAuditLogRepository` (`AUDIT_STORE`) |
| `KybWebhookService` / `WebhookSignatureVerifier` | `KybWebhookServiceImpl` / `HmacWebhookSignatureVerifier` |
| `TransactionRunner` | `TypeOrmTransactionRunner` |
| `ApplicationAccessPolicy` | `RoleBasedApplicationAccessPolicy` |
| `RiskReviewQueue` | `BullMqRiskReviewQueue` |
| `KybProvider` | `SimulatedKybProvider` |
| `PasswordHasher` / `TokenService` | `ScryptPasswordHasher` / `JwtTokenService` |

Abstract classes rather than interfaces because TypeScript interfaces disappear at runtime and can't be injection tokens. The payoff is in the tests: the unit tests plug in in-memory fakes (`test/fakes/`) with no mocking library.

**Transactions.** `TypeOrmTransactionRunner` keeps the active `EntityManager` in `AsyncLocalStorage`. Repositories resolve their TypeORM repository per call, so anything inside `transactions.run(...)`, including the audit write, joins the same transaction without passing handles around.

**Status rules stay pure functions.** They have no dependencies and no I/O, so a class around them would add nothing; they are tested directly.

---

## Security and object-level authorization

- **Global guards.** `JwtAuthGuard` (opt-out with `@Public()`) followed by `RolesGuard` (`@Roles(...)`) for coarse role checks.
- **Object-level checks in the service, on every read.** `ApplicationAccessPolicy.visibilityScope()` becomes a `WHERE` clause on each query:
  - SALES see only their own applications.
  - REVIEWERs see only those assigned to them.
  - ADMIN sees everything.
  - Out-of-scope records return **404, not 403**, so IDs can't be enumerated.
- **Decision rights.** Only the *assigned* reviewer may decide. The spec says so explicitly, so ADMIN is refused (403) and reassigns instead.
- **Mass assignment is blocked.** `ValidationPipe({ whitelist, forbidNonWhitelisted })` returns 400 for client-sent `status`, `createdById`, `assignedReviewerId`, `riskStatus` and so on.
- **JWT handling.** HS256 is pinned on sign and verify. Payload shape and role are validated, and tampered or forged tokens get 401.
- **Credentials.** Passwords are hashed with scrypt from `node:crypto` and compared in constant time. Unknown emails still run a hash check against a decoy, so response timing doesn't reveal which accounts exist.
- **Other hardening.** Helmet headers. `ParseUUIDPipe` on ids. The global exception filter never returns stack traces or SQL.
- **No secrets in the repo.** Compose requires them from `.env` (`${VAR:?}`), the seed password comes from the environment, and e2e tests generate a random JWT secret per run.

All of this is exercised over HTTP in [`applications-authorization.e2e-spec.ts`](test/applications-authorization.e2e-spec.ts) and [`auth.e2e-spec.ts`](test/auth.e2e-spec.ts).

---

## Asynchronous risk review

1. **Submit.** Inside one transaction the application row is locked, moved to `SUBMITTED`, `risk_status` is set to `PENDING`, `risk_review_version` is incremented and the audit row is written. **After commit**, a BullMQ job `{ applicationId, reviewVersion }` is enqueued.
2. **Worker.** `RiskReviewProcessor` delegates to `RiskReviewService`:
   - It reads the application and calls the KYB provider *outside* any transaction, so no lock is held during network I/O. The provider gets an idempotency key of `<id>:v<version>`.
   - It then re-checks state under `SELECT … FOR UPDATE`, inserts into `risk_assessments`, updates the application and writes the audit row in one transaction.
3. **Retries.** `RISK_REVIEW_MAX_ATTEMPTS` (default 5) with exponential backoff from `RISK_REVIEW_BACKOFF_MS`. After the last attempt the `failed` handler sets `risk_status = FAILED`. An admin can then call `POST /:id/risk-review` to start a new version.

**Idempotency, in three layers**

| Layer | Prevents |
|---|---|
| Deterministic job id `risk-review-<id>-v<version>` | Duplicate enqueues becoming duplicate jobs |
| Version + `PENDING` check under row lock | Redelivered, stale or superseded jobs writing results |
| `UNIQUE (application_id, review_version)` | Any duplicate that slips through anyway |

### KYB webhook

`POST /webhooks/kyb` lets the provider report results asynchronously instead of, or racing with, the worker.

- **Authentication.** `x-kyb-signature: t=<unix>,v1=<HMAC-SHA256 hex of "<t>.<raw body>">` with `KYB_WEBHOOK_SECRET`:
  - verified over the raw request bytes, in constant time;
  - timestamps outside `KYB_WEBHOOK_TOLERANCE_SECONDS` (default 300) are rejected, which blocks replays;
  - several `v1` values are accepted, so the secret can be rotated.
- **Exactly once per event.** `webhook_events (provider, event_id)` is unique. The event is recorded and applied in one transaction, so a failure rolls back and the provider's retry is processed.
- **Responses:**
  - `processed`: state changed.
  - `duplicate`: this `eventId` was already handled.
  - `ignored`: the review version is stale or already settled.
  - All three return 200 so the provider stops retrying. Bad signatures get 401; malformed but authenticated payloads get 400.

Example payload:

```json
{
  "eventId": "evt_01J9ZK3Q7A",
  "type": "kyb.check.completed",
  "applicationId": "…uuid…",
  "reviewVersion": 1,
  "result": { "reference": "sim_4f2a9c", "score": 42, "level": "MEDIUM", "reasons": [] }
}
```

`kyb.check.failed` carries `failureReason` instead of `result`. Signing helper: `signWebhookPayload()` in [`hmac-webhook-signature-verifier.ts`](src/modules/webhooks/signature/hmac-webhook-signature-verifier.ts).

The simulated provider is deterministic: the score is derived from a hash of tax id and legal name, with bumps for high-risk MCCs and high volume. It fails transiently at `KYB_TRANSIENT_FAILURE_RATE` (default 0.2) to exercise retries.

---

## Data model

`users`, `merchant_applications`, `risk_assessments`, `audit_logs`, `webhook_events`, created by hand-written, reviewed migrations ([`src/database/migrations`](src/database/migrations/)). `synchronize` is never enabled, and `yarn migration:generate` reports *no changes*, which confirms the entities and the migration agree.

- Postgres enums for statuses, roles and risk levels.
- `numeric(14,2)` for money, mapped to `number` by a transformer.
- `timestamptz` everywhere.
- Named PK, FK, unique and CHECK constraints:
  - non-negative amounts;
  - risk score between 0 and 100;
  - a reviewer is required in any review state.
- Indexes match the list queries: `(created_by_id, created_at)`, `(assigned_reviewer_id, created_at)`, `(status, created_at)`, and `(entity_type, entity_id, created_at)` on audit logs.
- `audit_logs` has no foreign keys, so history outlives the rows it describes. It is append-only by API: the repository exposes no update or delete.

---

## Audit trail and sensitive data

**Storage.** Postgres by default (`AUDIT_STORE=postgres`), where audit rows commit atomically with the change. Set `AUDIT_STORE=mongo` to use the MongoDB `audit_logs` collection instead; that trades atomicity for a dedicated document store (see [ADR-0005](docs/adr/0005-pluggable-audit-store.md)).

**Audited actions:** create, update (changed field *names* only), submit, assign, decision, and risk review completed / failed / requeued. Worker actions have `actor_id = NULL`.

**Redaction.** [`redact()`](src/common/security/redact.ts) runs on all audit metadata:
- secrets (`password`, `token`, `authorization`, `taxId`, …) → `[REDACTED]`;
- emails → `j***@example.com`;
- phone numbers → `***4567`.

The request logger records only method, path, status, latency and user id: never bodies, headers or query strings. API responses return `taxIdMasked` (last four characters) rather than the tax id.

**Fields that need field-level encryption in production**

| Field | Why |
|---|---|
| `merchant_applications.tax_id` | Government identifier; the main KYB/identity-theft target |
| `merchant_applications.owner_email`, `owner_phone`, `owner_full_name` | Personal data (GDPR / local privacy law) |
| `risk_assessments` provider payloads, if stored raw | Can include sanctions/PEP hits and other personal data |
| Bank account / settlement details (not modelled yet) | Payment data |

Planned approach: envelope encryption with AES-256-GCM in the application. A data key per record or tenant is wrapped by a KMS key (AWS KMS, GCP KMS or Vault Transit), implemented as a TypeORM column transformer so services stay unchanged. Values that must stay searchable (such as duplicate tax-id checks) get an additional HMAC blind index. Disk-level encryption at rest covers everything else.

---

## Testing

| Suite | What it covers |
|---|---|
| Unit (`src/**/*.spec.ts`), 164 tests | Full transition table; access policy per role; services against in-memory fakes, including SALES isolation, invalid transitions, enqueue-only-after-success and redaction in the audit trail; worker idempotency, stale versions and failure handling; JWT tampering; scrypt; redaction; webhook signature (tampering, replay, rotation, malformed headers) and webhook de-duplication |
| E2E (`test/*.e2e-spec.ts`), 60 tests | Real Nest app, Postgres, Redis and BullMQ worker, with only the KYB vendor faked |

The e2e suite covers:
- **Auth:** login, 401 cases, a forged-role token.
- **Authorization:** SALES cannot read, update or submit another user's application by id and the record stays unchanged; unassigned reviewers and admins cannot decide; reassignment revokes access; mass assignment is rejected.
- **Lifecycle:** the happy path with its audit sequence, the request-info loop, every invalid transition, pagination and filtering.
- **Risk:** completion, retries with attempt counts, exhaustion → `FAILED` → requeue, duplicate enqueues producing a single result, stale-version jobs being ignored.
- **Webhook:** unsigned, wrong-secret, expired and tampered requests get 401; concurrent duplicate deliveries yield exactly one `processed`; webhook-vs-worker races keep a single result; failure callbacks.
- **Mongo audit store:** the same flow with entries read back from MongoDB, and no raw PII stored.

E2E tests use `<DB_NAME>_test` in Postgres (created by the Compose init script) and `<MONGO_DB_NAME>_test` in Mongo, and the `e2e` BullMQ prefix, so they never touch dev data or a running dev worker.

---

## Trade-offs and what's next

- **Enqueue after commit, no outbox.** A crash between commit and `queue.add` leaves an application `PENDING` with no job. The admin requeue endpoint covers recovery; a transactional outbox (or a sweeper re-enqueuing stale `PENDING` rows) would make it automatic.
- **Worker runs in the API process.** Simpler for the time box. In production it would be a separate entry point (`createApplicationContext`) scaled independently.
- **Short-lived JWTs, no refresh or revocation.** A role change takes effect when the token expires. Next steps: refresh tokens, plus checking a token version on the user row.
- **No login rate limiting.** `@nestjs/throttler` with a Redis store would be next.
- **Audit logs in Postgres,** which the brief allows. With higher volume, partitioning by month or an append-only store would help.
- **Single webhook secret.** Per-vendor secrets would be needed with more than one KYB provider.

### Architecture decisions

See [`docs/adr`](docs/adr/README.md): abstract-class ports, object-level authorization, async risk review idempotency, the KYB webhook, and the pluggable audit store.

---

## AI assistance

I used **Claude Code** as a coding assistant. I set the requirements breakdown, architecture, conventions and trade-offs; the assistant helped draft code, tests and documentation, which I reviewed and revised. I own every line here and can walk through any of it.

**Where it helped:** scaffolding modules, DTOs and Swagger decorators; drafting unit and e2e test cases; writing the initial migration; first drafts of the README and ADRs.

**How I verified the output:**

- Read and reviewed every source, test and migration file.
- `yarn lint` (oxlint, `no-explicit-any` as an error) and `yarn typecheck` (strict TypeScript over `src` and `test`) pass cleanly.
- `yarn test` (164 unit tests) and `yarn test:e2e` (60 integration tests against real Postgres, Redis and MongoDB) pass. The e2e suite was run repeatedly to rule out flakiness.
- `yarn migration:generate` reports no schema drift, so the hand-written migrations match the entities exactly.
- A live walkthrough of every endpoint against the running server: each role, every authorization bypass attempt, invalid transitions, signed, unsigned and replayed webhooks, retry exhaustion and requeue, and both audit stores.
- Built and ran the Docker image end to end.
