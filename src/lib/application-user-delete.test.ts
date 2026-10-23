import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors soft-delete identity rewriting in deleteApplicationUser.
 * Freed phone/email must stay unique and not match login lookup.
 */
export function buildDeletedIdentity(userId: string, phone: string | null, email: string | null) {
  const id = String(userId || '').trim();
  return {
    phone: `del:${id}:${String(phone || '')}`.slice(0, 255),
    email: `del:${id}:${String(email || 'none').toLowerCase()}`.slice(0, 255),
  };
}

test('deleted phone is rewritten and no longer equals original', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const original = '+923001234567';
  const next = buildDeletedIdentity(id, original, 'user@example.com');
  assert.notEqual(next.phone, original);
  assert.ok(next.phone.startsWith(`del:${id}:`));
  assert.equal(next.phone, `del:${id}:${original}`);
});

test('deleted email is rewritten uniquely per user id', () => {
  const a = buildDeletedIdentity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Same@Mail.com');
  const b = buildDeletedIdentity('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'Same@Mail.com');
  assert.notEqual(a.email, b.email);
  assert.ok(a.email.includes('same@mail.com'));
  assert.ok(a.email.startsWith('del:'));
});

test('empty phone still produces a unique deleted marker', () => {
  const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const next = buildDeletedIdentity(id, '', null);
  assert.equal(next.phone, `del:${id}:`);
  assert.equal(next.email, `del:${id}:none`);
});
