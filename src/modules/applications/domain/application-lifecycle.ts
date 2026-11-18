import { ConflictException } from '@nestjs/common';
import { RiskStatus } from '../../risk/enums/risk.enum.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { ReviewDecision } from '../enums/review-decision.enum.js';

/**
 * Allowed status transitions. Anything not listed is rejected.
 *
 * ```
 * DRAFT ─submit─▶ SUBMITTED ─assign─▶ UNDER_REVIEW ─approve──────▶ APPROVED
 *                                       │  ▲          ─reject───────▶ REJECTED
 *                          request-info │  │ resubmit
 *                                       ▼  │
 *                                   INFO_REQUESTED
 * ```
 */
const TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  [ApplicationStatus.Draft]: [ApplicationStatus.Submitted],
  [ApplicationStatus.Submitted]: [ApplicationStatus.UnderReview],
  [ApplicationStatus.UnderReview]: [
    ApplicationStatus.Approved,
    ApplicationStatus.Rejected,
    ApplicationStatus.InfoRequested,
  ],
  [ApplicationStatus.InfoRequested]: [ApplicationStatus.UnderReview],
  [ApplicationStatus.Approved]: [],
  [ApplicationStatus.Rejected]: [],
};

const EDITABLE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.Draft,
  ApplicationStatus.InfoRequested,
]);

const ASSIGNABLE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.Submitted,
  ApplicationStatus.UnderReview,
]);

const DECISION_TARGET: Readonly<Record<ReviewDecision, ApplicationStatus>> = {
  [ReviewDecision.Approve]: ApplicationStatus.Approved,
  [ReviewDecision.Reject]: ApplicationStatus.Rejected,
  [ReviewDecision.RequestInfo]: ApplicationStatus.InfoRequested,
};

/** Minimal view of an application needed to evaluate lifecycle rules. */
export interface LifecycleState {
  status: ApplicationStatus;
  riskStatus: RiskStatus;
  assignedReviewerId: string | null;
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** @throws ConflictException when `from → to` is not an allowed transition. */
export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(`Cannot move application from ${from} to ${to}`);
  }
}

export function isEditable(status: ApplicationStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

/** @throws ConflictException unless the application is in an editable status. */
export function assertEditable(status: ApplicationStatus): void {
  if (!isEditable(status)) {
    throw new ConflictException(`Application cannot be edited while ${status}`);
  }
}

/**
 * Resolves the status an application enters on (re)submission. A first
 * submission waits for assignment; a resubmission after a request for
 * information returns straight to the already-assigned reviewer.
 * @throws ConflictException when the application cannot be submitted.
 */
export function resolveSubmitTarget(state: LifecycleState): ApplicationStatus {
  const target =
    state.status === ApplicationStatus.InfoRequested && state.assignedReviewerId
      ? ApplicationStatus.UnderReview
      : ApplicationStatus.Submitted;
  assertTransition(state.status, target);
  return target;
}

/**
 * Resolves the status after assigning a reviewer. Reassignment while under
 * review keeps the status unchanged.
 * @throws ConflictException when the application is not awaiting review.
 */
export function resolveAssignTarget(state: LifecycleState): ApplicationStatus {
  if (!ASSIGNABLE_STATUSES.has(state.status)) {
    throw new ConflictException(`Cannot assign a reviewer while ${state.status}`);
  }
  return ApplicationStatus.UnderReview;
}

/**
 * A new risk review may be requested for an application still in the review
 * pipeline whose previous review failed or never reported back (e.g. the job
 * was lost before reaching Redis).
 * @throws ConflictException otherwise.
 */
export function assertRiskReviewRequeueable(state: LifecycleState): void {
  const inPipeline = ASSIGNABLE_STATUSES.has(state.status);
  const retryable =
    state.riskStatus === RiskStatus.Failed || state.riskStatus === RiskStatus.Pending;
  if (!inPipeline || !retryable) {
    throw new ConflictException(
      `Risk review cannot be requeued while ${state.status} with risk status ${state.riskStatus}`,
    );
  }
}

/**
 * Resolves the status produced by a reviewer decision.
 * @throws ConflictException for an invalid transition, or an approval
 *   attempted before the risk review has completed.
 */
export function resolveDecisionTarget(
  state: LifecycleState,
  decision: ReviewDecision,
): ApplicationStatus {
  const target = DECISION_TARGET[decision];
  assertTransition(state.status, target);
  if (decision === ReviewDecision.Approve && state.riskStatus !== RiskStatus.Completed) {
    throw new ConflictException('Application cannot be approved until risk review completes');
  }
  return target;
}
