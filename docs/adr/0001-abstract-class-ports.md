# ADR-0001: Abstract-class ports for every service dependency

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Services must be testable without Postgres, Redis or the KYB vendor, and the infrastructure behind them (queue, audit store, KYB client) is expected to change. NestJS injects by token, and TypeScript interfaces do not exist at runtime, so an interface alone cannot serve as a token.

## Decision

Every service, repository and external adapter is declared as an **abstract class**, and that class is the DI token. Each owning module binds the implementation:

```ts
{ provide: ApplicationsService, useClass: ApplicationsServiceImpl }
{ provide: MerchantApplicationRepository, useClass: TypeOrmMerchantApplicationRepository }
{ provide: KybProvider, useClass: SimulatedKybProvider }
```

Naming: `XService` → `XServiceImpl`; `XRepository` → `TypeOrmXRepository` / `MongoXRepository`; adapters are named after their technology (`BullMqRiskReviewQueue`, `HmacWebhookSignatureVerifier`).

## Consequences

- **Testing:** unit tests use small hand-written fakes from `test/fakes/` instead of a mocking library. Each fake is checked against the abstract contract at compile time.
- **Swapping technology** (for example the Postgres → Mongo audit store, see ADR-0005) changes one module binding, not the callers.
- **Cost:** one extra file per port and the `…Impl` convention.
- **Not covered:** pure domain rules (the status transition table) stay plain functions. They have no dependencies to substitute.
