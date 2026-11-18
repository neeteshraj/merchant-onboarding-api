# ADR-0005: Pluggable audit store (Postgres default, MongoDB optional)

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The audit trail is append-only, write-heavy and rarely queried except by entity. Postgres is acceptable within the time box, but a document store suits long retention and high volume. Audit metadata must never contain raw secrets or PII.

## Decision

- **Pluggable store.** `AuditLogRepository` is an abstract port (ADR-0001) with two implementations, chosen by `AUDIT_STORE`:
  - `postgres` (default): `TypeOrmAuditLogRepository`. Writes join the active transaction, so an audit row commits or rolls back with the change it describes.
  - `mongo`: `MongoAuditLogRepository`, using the official `mongodb` driver directly with no ODM. It uses an `audit_logs` collection with an `(entityType, entityId, createdAt)` index. The client is created lazily, so Postgres-only deployments need no Mongo configuration.
- **Redaction stays in one place.** `AuditService` applies `redact()` before calling the repository, so both stores receive identical, already-masked documents.

## Consequences

- **The Mongo store loses atomicity with Postgres.** If a transaction rolls back after the audit insert, the Mongo entry survives and describes an *attempted* change. That is acceptable for a security log (attempts are informative), but it is not a ledger. A transactional outbox relayed to Mongo would restore exactly-once semantics.
- **Append-only is enforced by the API surface,** which has no update or delete. In production it should also be enforced by credentials: a database role with `INSERT`/`SELECT` only in Postgres, and an insert/find-only role in Mongo.
- The e2e suite runs the audit flow against both stores.
