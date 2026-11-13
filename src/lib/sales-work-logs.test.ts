import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkLogType, workLogTypeLabel, WORK_LOG_TYPES } from './sales-work-log-types';
import { isAllowedAttachment, safeFileName } from './sales-activity-storage';

test('work log activity types match the Logs form', () => {
  assert.deepEqual(
    WORK_LOG_TYPES.map((t) => t.label),
    ['Follow-up', 'WhatsApp', 'Email', 'Phone call', 'Customer meeting', 'Quotation follow-up', 'Other']
  );
  assert.equal(isWorkLogType('whatsapp'), true);
  assert.equal(isWorkLogType('login'), false);
  assert.equal(isWorkLogType(''), false);
});

test('"Other" shows the type the agent typed', () => {
  assert.equal(workLogTypeLabel('other', 'Visited warehouse'), 'Visited warehouse');
  assert.equal(workLogTypeLabel('other', '  '), 'Other');
  assert.equal(workLogTypeLabel('email', 'ignored'), 'Email');
});

test('attachments: allowed file types and safe storage names', () => {
  const file = (name: string) => new File(['x'], name);
  assert.equal(isAllowedAttachment(file('chat.PNG')), true);
  assert.equal(isAllowedAttachment(file('quote.pdf')), true);
  assert.equal(isAllowedAttachment(file('sheet.xlsx')), true);
  assert.equal(isAllowedAttachment(file('run.exe')), false);
  assert.equal(isAllowedAttachment(file('page.html')), false);
  assert.equal(safeFileName('WhatsApp Image 2026/11/13 (1).jpg'), 'WhatsApp_Image_2026_11_13_1_.jpg');
  assert.equal(safeFileName('../../etc/passwd').includes('/'), false);
});
