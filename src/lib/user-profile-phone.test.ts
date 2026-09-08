import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserProfilePhone } from './user-profile-phone';

test('rejects empty and whitespace-only values', () => {
  assert.equal(normalizeUserProfilePhone('').ok, false);
  assert.equal(normalizeUserProfilePhone('   ').ok, false);
});

test('rejects invalid characters', () => {
  assert.equal(normalizeUserProfilePhone('abc1234567').ok, false);
  assert.equal(normalizeUserProfilePhone('0300@1234567').ok, false);
});

test('rejects too-short and too-long digit counts', () => {
  assert.equal(normalizeUserProfilePhone('123').ok, false);
  assert.equal(normalizeUserProfilePhone('1234567890123456').ok, false);
});

test('accepts international and local formatted numbers without rewriting them', () => {
  const plus = normalizeUserProfilePhone('  +92 300 1234567  ');
  assert.equal(plus.ok, true);
  if (plus.ok) assert.equal(plus.value, '+92 300 1234567');

  const local = normalizeUserProfilePhone('03001234567');
  assert.equal(local.ok, true);
  if (local.ok) assert.equal(local.value, '03001234567');

  const dashed = normalizeUserProfilePhone('+1 (555) 000-0000');
  assert.equal(dashed.ok, true);
  if (dashed.ok) assert.equal(dashed.value, '+1 (555) 000-0000');
});
