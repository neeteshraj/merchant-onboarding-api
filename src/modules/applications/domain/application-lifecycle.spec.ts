import { ConflictException } from '@nestjs/common';
import { RiskStatus } from '../../risk/enums/risk.enum.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { ReviewDecision } from '../enums/review-decision.enum.js';
import {
  assertEditable,
  assertRiskReviewRequeueable,
  canTransition,
  isEditable,
  type LifecycleState,
  resolveAssignTarget,
  resolveDecisionTarget,
  resolveSubmitTarget,
} from './application-lifecycle.js';

const { Draft, Submitted, UnderReview, InfoRequested, Approved, Rejected } = ApplicationStatus;
const ALL_STATUSES = Object.values(ApplicationStatus);

function state(overrides: Partial<LifecycleState> = {}): LifecycleState {
  return {
    status: Draft,
    riskStatus: RiskStatus.NotStarted,
    assignedReviewerId: null,
    ...overrides,
  };
}

function underReview(riskStatus: RiskStatus): LifecycleState {
  return state({ status: UnderReview, riskStatus, assignedReviewerId: 'r1' });
}

describe('application lifecycle', () => {
  describe('canTransition', () => {
    const allowed: ReadonlyArray<[ApplicationStatus, ApplicationStatus]> = [
      [Draft, Submitted],
      [Submitted, UnderReview],
      [UnderReview, Approved],
      [UnderReview, Rejected],
      [UnderReview, InfoRequested],
      [InfoRequested, UnderReview],
    ];
    const isAllowed = (from: ApplicationStatus, to: ApplicationStatus) =>
      allowed.some(([f, t]) => f === from && t === to);

    it.each(ALL_STATUSES.flatMap((from) => ALL_STATUSES.map((to) => [from, to] as const)))(
      '%s → %s matches the transition table',
      (from, to) => {
        expect(canTransition(from, to)).toBe(isAllowed(from, to));
      },
    );

    it.each([Approved, Rejected])('%s is terminal', (terminal) => {
      expect(ALL_STATUSES.some((to) => canTransition(terminal, to))).toBe(false);
    });
  });

  describe('editability', () => {
    it.each([Draft, InfoRequested])('%s is editable', (status) => {
      expect(isEditable(status)).toBe(true);
      expect(() => assertEditable(status)).not.toThrow();
    });

    it.each([Submitted, UnderReview, Approved, Rejected])('%s is locked', (status) => {
      expect(isEditable(status)).toBe(false);
      expect(() => assertEditable(status)).toThrow(ConflictException);
    });
  });

  describe('resolveSubmitTarget', () => {
    it('moves a draft to SUBMITTED', () => {
      expect(resolveSubmitTarget(state())).toBe(Submitted);
    });

    it('returns a resubmission straight to the assigned reviewer', () => {
      expect(resolveSubmitTarget(state({ status: InfoRequested, assignedReviewerId: 'r1' }))).toBe(
        UnderReview,
      );
    });

    it.each([Submitted, UnderReview, Approved, Rejected])(
      'rejects submission while %s',
      (status) => {
        expect(() => resolveSubmitTarget(state({ status, assignedReviewerId: 'r1' }))).toThrow(
          ConflictException,
        );
      },
    );
  });

  describe('resolveAssignTarget', () => {
    it.each([Submitted, UnderReview])('allows assignment while %s', (status) => {
      expect(resolveAssignTarget(state({ status }))).toBe(UnderReview);
    });

    it.each([Draft, InfoRequested, Approved, Rejected])('rejects assignment while %s', (status) => {
      expect(() => resolveAssignTarget(state({ status }))).toThrow(ConflictException);
    });
  });

  describe('resolveDecisionTarget', () => {
    it('approves once the risk review has completed', () => {
      expect(resolveDecisionTarget(underReview(RiskStatus.Completed), ReviewDecision.Approve)).toBe(
        Approved,
      );
    });

    it.each([RiskStatus.Pending, RiskStatus.Failed, RiskStatus.NotStarted])(
      'refuses approval while risk is %s',
      (riskStatus) => {
        expect(() =>
          resolveDecisionTarget(underReview(riskStatus), ReviewDecision.Approve),
        ).toThrow(/risk review/);
      },
    );

    it.each([
      [ReviewDecision.Reject, Rejected],
      [ReviewDecision.RequestInfo, InfoRequested],
    ])('%s is allowed regardless of risk status', (decision, expected) => {
      expect(resolveDecisionTarget(underReview(RiskStatus.Pending), decision)).toBe(expected);
    });

    it.each([Draft, Submitted, InfoRequested, Approved, Rejected])(
      'rejects any decision while %s',
      (status) => {
        expect(() =>
          resolveDecisionTarget(
            state({ status, riskStatus: RiskStatus.Completed }),
            ReviewDecision.Reject,
          ),
        ).toThrow(ConflictException);
      },
    );
  });

  describe('assertRiskReviewRequeueable', () => {
    it.each([
      [Submitted, RiskStatus.Failed],
      [UnderReview, RiskStatus.Pending],
    ])('allows requeue while %s with risk %s', (status, riskStatus) => {
      expect(() => assertRiskReviewRequeueable(state({ status, riskStatus }))).not.toThrow();
    });

    it.each([
      [Draft, RiskStatus.NotStarted],
      [UnderReview, RiskStatus.Completed],
      [Approved, RiskStatus.Failed],
    ])('rejects requeue while %s with risk %s', (status, riskStatus) => {
      expect(() => assertRiskReviewRequeueable(state({ status, riskStatus }))).toThrow(
        ConflictException,
      );
    });
  });
});
