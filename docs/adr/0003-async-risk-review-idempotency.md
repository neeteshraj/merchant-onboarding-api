# ADR-0003: Asynchronous risk review with versioned, layered idempotency

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Submitting an application triggers a third-party KYB check, which is slow and fails intermittently. BullMQ gives at-least-once delivery, so a job may run more than once. An application can also be resubmitted, making earlier checks obsolete.

## Decision

- **Versioned reviews.** Each submit or requeue increments `merchant_applications.risk_review_version` and enqueues `{ applicationId, reviewVersion }` **after the transaction commits**.
- **Retries.** BullMQ retries with exponential backoff (`RISK_REVIEW_MAX_ATTEMPTS`, `RISK_REVIEW_BACKOFF_MS`). After the last attempt the review is marked `FAILED`, and an admin can requeue it, which creates a new version.
- **No lock during the provider call.** The worker calls the provider outside any transaction, so no row lock is held during network I/O. It then re-validates under `SELECT … FOR UPDATE` before writing.
- **Idempotency, in three layers:**
  1. A deterministic job id, `risk-review-<id>-v<version>`, means duplicate enqueues become no-ops.
  2. A version + `PENDING` check under the row lock means redelivered, stale or superseded jobs return `skipped`.
  3. `UNIQUE (application_id, review_version)` on `risk_assessments` catches anything that slips through.
- **One write path.** Both the worker and the webhook (ADR-0004) persist results through `RiskReviewService.recordResult`, so the same guarantees hold for both channels.

## Consequences

- Duplicate or late results can never overwrite a newer review, and the e2e tests cover both.
- **Known gap:** a crash between commit and enqueue leaves a `PENDING` review with no job. The admin requeue endpoint recovers it. A transactional outbox, or a sweeper for stale `PENDING` rows, is the upgrade path.
- The worker runs in the API process for simplicity; a separate worker entry point would scale independently.
