import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { Role } from '../../users/enums/role.enum.js';
import { RoleBasedApplicationAccessPolicy } from './role-based-application-access.policy.js';

describe('RoleBasedApplicationAccessPolicy', () => {
  const policy = new RoleBasedApplicationAccessPolicy();
  const admin: AuthenticatedUser = { id: 'admin', role: Role.Admin };
  const owner: AuthenticatedUser = { id: 'sales-owner', role: Role.Sales };
  const otherSales: AuthenticatedUser = { id: 'sales-other', role: Role.Sales };
  const assignedReviewer: AuthenticatedUser = { id: 'reviewer-assigned', role: Role.Reviewer };
  const otherReviewer: AuthenticatedUser = { id: 'reviewer-other', role: Role.Reviewer };
  const application = { createdById: owner.id, assignedReviewerId: assignedReviewer.id };

  describe('visibilityScope', () => {
    it('gives admins an unrestricted scope', () => {
      expect(policy.visibilityScope(admin)).toEqual({});
    });

    it('limits sales users to applications they created', () => {
      expect(policy.visibilityScope(owner)).toEqual({ createdById: owner.id });
    });

    it('limits reviewers to applications assigned to them', () => {
      expect(policy.visibilityScope(assignedReviewer)).toEqual({
        assignedReviewerId: assignedReviewer.id,
      });
    });
  });

  describe('canModify', () => {
    it.each([
      ['admin', admin, true],
      ['owning sales user', owner, true],
      ['another sales user', otherSales, false],
      ['assigned reviewer', assignedReviewer, false],
    ])('%s → %s', (_label, user, expected) => {
      expect(policy.canModify(user, application)).toBe(expected);
    });
  });

  describe('canDecide', () => {
    it.each([
      ['assigned reviewer', assignedReviewer, true],
      ['unassigned reviewer', otherReviewer, false],
      ['admin', admin, false],
      ['owning sales user', owner, false],
    ])('%s → %s', (_label, user, expected) => {
      expect(policy.canDecide(user, application)).toBe(expected);
    });

    it('denies everyone when no reviewer is assigned', () => {
      expect(policy.canDecide(assignedReviewer, { ...application, assignedReviewerId: null })).toBe(
        false,
      );
    });
  });
});
