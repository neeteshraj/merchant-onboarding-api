# ADR-0002: Object-level authorization as query scope, 404 for out-of-scope records

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

SALES users may only see and change applications they created, and only the assigned REVIEWER may record a decision. A missed check is an automatic fail.

A common bug pattern loads a record by id and then forgets the ownership check on one of the endpoints.

## Decision

1. **Role guards are coarse only.** `@Roles()` decides who may call an endpoint at all.
2. **Ownership becomes a `WHERE` clause.** `ApplicationAccessPolicy.visibilityScope(user)` is applied inside every repository read, including the `SELECT … FOR UPDATE` that mutations use:
   - SALES: `created_by_id = me`
   - REVIEWER: `assigned_reviewer_id = me`
   - ADMIN: no restriction
3. **Out-of-scope records return 404, not 403.** They are indistinguishable from records that don't exist, so ids cannot be probed.
4. **Action rights are separate from visibility.** `canModify` and `canDecide` are checked after loading. A reviewer can see an assigned application but gets 403 trying to edit it.
5. **Admins cannot decide.** The brief says "only the assigned reviewer may record a risk decision", so ADMIN gets 403 and reassigns instead.
6. **Mass assignment is blocked.** `ValidationPipe({ whitelist, forbidNonWhitelisted })` rejects client-supplied `status`, `createdById` and similar fields.

## Consequences

- An endpoint cannot forget the ownership filter: there is no unscoped read path in `ApplicationsServiceImpl`.
- Admins who need to override a decision must reassign to a reviewer. Adding an explicit audited override would be a separate decision.
- Coverage: `applications-authorization.e2e-spec.ts` attempts each bypass over HTTP and asserts both the status code and that the record did not change.
