import test from 'node:test';
import assert from 'node:assert/strict';
import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminViewOnly } from './auth/view-only';
import { isWriteActionLabel } from './view-only-labels';

const session = (overrides: Partial<SessionPayload>): SessionPayload => ({
  username: 'admin',
  role: 'admin',
  ...overrides,
});

test('only Super Admin viewing an organization is view-only', () => {
  assert.equal(isSuperAdminViewOnly(session({ organizationId: 'org-1' })), true);
  assert.equal(isSuperAdminViewOnly(session({})), false, 'Admin context keeps existing behaviour');
});

test('every other user keeps their permissions', () => {
  assert.equal(isSuperAdminViewOnly(null), false);
  assert.equal(isSuperAdminViewOnly(session({ username: 'ali', role: 'user', organizationId: 'org-1' })), false);
  assert.equal(
    isSuperAdminViewOnly(session({ username: 'orgadmin', role: 'user', appUserRole: 'administrator', organizationId: 'org-1' })),
    false,
  );
  assert.equal(isSuperAdminViewOnly(session({ username: 'ayan', role: 'sales_agent', organizationId: 'org-1' })), false);
  assert.equal(isSuperAdminViewOnly(session({ username: 'ops', role: 'operations', organizationId: 'org-1' })), false);
  assert.equal(isSuperAdminViewOnly(session({ username: 'notadmin', role: 'admin', organizationId: 'org-1' })), false);
});

test('controls that change records are recognised', () => {
  for (const label of [
    'New',
    '+ New',
    'Create',
    'New Contact',
    'Save',
    'Save changes',
    'Delete',
    'Edit',
    'Post',
    'Confirm',
    'Register Payment',
    'Reset to Draft',
    'Reconcile',
    'Send by Email',
    'Mark as Sent',
    'Duplicate',
    'Import',
    'Log note',
    'Schedule activity',
    'Submit Inquiry',
    'Archive',
  ]) {
    assert.equal(isWriteActionLabel(label), true, label);
  }
});

test('viewing, finding and leaving stay usable', () => {
  for (const label of [
    'Search',
    'Filters',
    'Add filter',
    'Apply filters',
    'Remove filter',
    'Group by',
    'Edit columns',
    'Export',
    'Print',
    'Download PDF',
    'Log out',
    'Sign out',
    'Back',
    'Cancel',
    'Close',
    'Next',
    'Previous',
    'Open',
    'View',
    'Customers',
    'Invoices',
    'Pipeline',
    'Switch organization',
    'Set Org1 as default company',
    '',
    'New customer named Rashid Traders from the Karachi branch office',
  ]) {
    assert.equal(isWriteActionLabel(label), false, label);
  }
});
