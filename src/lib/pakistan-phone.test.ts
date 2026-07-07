import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePakistaniPhone, normalizePhoneDigits, formatLeadPhoneForStorage } from './pakistan-phone';

test('normalizePhoneDigits strips formatting characters', () => {
  assert.equal(normalizePhoneDigits('  +92 (300) 123-4567 '), '923001234567');
});

test('Pakistani formats normalize to the same canonical value', () => {
  const inputs = ['03001234567', '+923001234567', '92 3001234567', '0300-1234567', '3001234567'];
  const expected = '923001234567';

  for (const input of inputs) {
    const result = normalizePakistaniPhone(input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value, expected, `failed for input: ${input}`);
    }
  }
});

test('different numbers do not collide', () => {
  const a = normalizePakistaniPhone('03001234567');
  const b = normalizePakistaniPhone('03011234567');
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (a.ok && b.ok) {
    assert.notEqual(a.value, b.value);
  }
});

test('leading and trailing spaces are handled', () => {
  const result = normalizePakistaniPhone('  03001234567  ');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, '923001234567');
  }
});

test('invalid numbers are rejected', () => {
  assert.equal(normalizePakistaniPhone('').ok, false);
  assert.equal(normalizePakistaniPhone('123').ok, false);
  assert.equal(normalizePakistaniPhone('abcdefghij').ok, false);
});

test('formatLeadPhoneForStorage preserves leading plus when entered', () => {
  const canonical = '923237898734';
  assert.equal(formatLeadPhoneForStorage('+923237898734', canonical), '+923237898734');
  assert.equal(formatLeadPhoneForStorage('923237898734', canonical), '923237898734');
  assert.equal(formatLeadPhoneForStorage('03001234567', '923001234567'), '03001234567');
});
