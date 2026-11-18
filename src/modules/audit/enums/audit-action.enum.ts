export enum AuditAction {
  ApplicationCreated = 'APPLICATION_CREATED',
  ApplicationUpdated = 'APPLICATION_UPDATED',
  ApplicationSubmitted = 'APPLICATION_SUBMITTED',
  ReviewerAssigned = 'REVIEWER_ASSIGNED',
  DecisionRecorded = 'DECISION_RECORDED',
  RiskReviewCompleted = 'RISK_REVIEW_COMPLETED',
  RiskReviewFailed = 'RISK_REVIEW_FAILED',
  RiskReviewRequeued = 'RISK_REVIEW_REQUEUED',
}

export enum AuditEntityType {
  MerchantApplication = 'MERCHANT_APPLICATION',
}
