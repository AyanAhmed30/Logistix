import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  REFRESH_NEEDED_MESSAGE,
  actionError,
  isStaleClientError,
  toUserMessage,
} from './user-facing-error';
import { getErrorMessage } from './safe-async';

const postgres = (code: string, message: string) => ({ code, message, details: 'Key (phone)=(secret)', hint: null });

test('business messages reach the user unchanged', () => {
  for (const message of [
    'Unauthorized',
    'Sales agent not found',
    'Quantity exceeds available stock',
    'Exchange rate is not defined for USD',
    'Column mapping is incomplete',
    'This relation between accounts is not allowed',
    'Please enter a valid email address',
    'Request timed out. Please try again.',
  ]) {
    assert.equal(toUserMessage(message), message);
    assert.equal(toUserMessage(new Error(message)), message);
  }
});

test('messages raised on purpose by our SQL are kept', () => {
  const error = postgres('P0001', 'Submitted daily reports cannot be deleted');
  assert.equal(toUserMessage(error), 'Submitted daily reports cannot be deleted');
});

test('database errors never reach the user', () => {
  const cases: [string, string][] = [
    ['42P01', 'relation "public.daily_work_reports" does not exist'],
    ['42703', 'column lead_inquiries.foo does not exist'],
    ['PGRST204', "Could not find the 'foo' column of 'leads' in the schema cache"],
    ['PGRST116', 'JSON object requested, multiple (or no) rows returned'],
    ['22P02', 'invalid input syntax for type uuid: "abc"'],
  ];
  for (const [code, message] of cases) {
    assert.equal(toUserMessage(postgres(code, message)), GENERIC_ERROR_MESSAGE);
    assert.equal(toUserMessage(message), GENERIC_ERROR_MESSAGE, 'also when only the text survives');
  }
});

test('an unknown database code is still hidden, whatever the wording', () => {
  assert.equal(toUserMessage(postgres('XX000', 'something internal happened')), GENERIC_ERROR_MESSAGE);
});

test('common database failures get a useful sentence', () => {
  assert.equal(
    toUserMessage(postgres('23505', 'duplicate key value violates unique constraint "x"')),
    'This record already exists.',
  );
  assert.equal(toUserMessage(postgres('42501', 'permission denied for table x')), 'You do not have permission to do that.');
});

test('a technical message embedded in a sentence is caught', () => {
  assert.equal(
    toUserMessage('Failed to save: relation "orders" does not exist', 'Could not save the order'),
    'Could not save the order',
  );
});

test('a technical fallback cannot leak', () => {
  assert.equal(toUserMessage('fetch failed: x', 'TypeError: boom'), NETWORK_ERROR_MESSAGE);
  assert.equal(toUserMessage(new TypeError('x is undefined'), 'TypeError: boom'), GENERIC_ERROR_MESSAGE);
});

test('runtime errors are technical even with harmless wording', () => {
  assert.equal(toUserMessage(new TypeError('Quantity')), GENERIC_ERROR_MESSAGE);
  assert.equal(toUserMessage(new ReferenceError('foo is not defined')), GENERIC_ERROR_MESSAGE);
  assert.equal(toUserMessage('Cannot read properties of undefined'), GENERIC_ERROR_MESSAGE);
  assert.equal(toUserMessage('An error occurred in the Server Components render.'), GENERIC_ERROR_MESSAGE);
  assert.equal(toUserMessage('at foo (/var/task/app.js:10:5)'), GENERIC_ERROR_MESSAGE);
});

test('network failures use the connection message', () => {
  assert.equal(toUserMessage(new TypeError('Failed to fetch')), NETWORK_ERROR_MESSAGE);
  assert.equal(toUserMessage('TypeError: fetch failed'), NETWORK_ERROR_MESSAGE);
  assert.equal(toUserMessage('connect ECONNRESET 1.2.3.4:443'), NETWORK_ERROR_MESSAGE);
});

test('an out-of-date tab is recognised', () => {
  const stale = new Error('Server Action "00ab" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action');
  stale.name = 'UnrecognizedActionError';
  assert.equal(isStaleClientError(stale), true);
  assert.equal(toUserMessage(stale), REFRESH_NEEDED_MESSAGE);
  assert.equal(toUserMessage(String(stale)), REFRESH_NEEDED_MESSAGE);
  assert.equal(toUserMessage('Loading chunk 123 failed.'), REFRESH_NEEDED_MESSAGE);
  assert.equal(isStaleClientError(new Error('Quantity exceeds stock')), false);
});

test('empty errors use the fallback', () => {
  assert.equal(toUserMessage(null, 'Failed to save'), 'Failed to save');
  assert.equal(toUserMessage(new Error(' '), 'Failed to save'), 'Failed to save');
  assert.equal(toUserMessage({}), GENERIC_ERROR_MESSAGE);
});

test('actionError logs the detail but not customer values', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const result = actionError(postgres('42P01', 'relation "x" does not exist'), 'Failed to load orders');
  assert.equal(result, 'Failed to load orders');
  assert.equal(log.mock.callCount(), 1);
  const logged = JSON.stringify(log.mock.calls[0].arguments);
  assert.match(logged, /relation/);
  assert.doesNotMatch(logged, /secret/);
});

test('actionError does not log business errors', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  assert.equal(actionError(new Error('Quantity exceeds stock')), 'Quantity exceeds stock');
  assert.equal(log.mock.callCount(), 0);
});

test('getErrorMessage is safe for existing callers', () => {
  assert.equal(getErrorMessage(new Error('relation "x" does not exist'), 'Could not load'), 'Could not load');
  assert.equal(getErrorMessage(new Error('Quantity exceeds stock')), 'Quantity exceeds stock');
  assert.equal(getErrorMessage(new Error('NEXT_REDIRECT'), 'Fallback'), 'Fallback');
});
