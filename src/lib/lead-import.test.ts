import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { checkLeadRows, parseCsv, parseXlsx, phoneKey, rowsToLeads, validateLead } from './lead-import';

/** Builds a minimal real .xlsx (zip of XML files) to test the reader without a library. */
function buildXlsx(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = deflateRawSync(Buffer.from(text, 'utf8'));
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, 8, true);
    lh.setUint32(18, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(lh.buffer), nameBytes, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, 8, true);
    ch.setUint32(20, data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out.buffer;
}

test('CSV: quotes, commas and line breaks inside quotes, BOM, semicolons', () => {
  const rows = parseCsv('﻿Name,Phone,Note\r\n"Khan, Ali",0300 1234567,"line1\nline2"\r\n"Say ""hi""",,x\n');
  assert.deepEqual(rows[1], ['Khan, Ali', '0300 1234567', 'line1\nline2']);
  assert.deepEqual(rows[2], ['Say "hi"', '', 'x']);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('XLSX: shared strings, inline strings, numbers, gaps and the first sheet', async () => {
  const buffer = buildXlsx({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Contact Name</t></si><si><t>Phone Number</t></si><si><r><t>Ali </t></r><r><t>&amp; Co</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>City</t></is></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>923001234567</v></c><c r="D3" t="inlineStr"><is><t>Lahore</t></is></c></row>' +
      '</sheetData></worksheet>',
  });
  const rows = await parseXlsx(buffer);
  assert.deepEqual(rows[0], ['Contact Name', 'Phone Number', '', 'City']);
  assert.deepEqual(rows[2], ['Ali & Co', '923001234567', '', 'Lahore']);
  const { leads } = rowsToLeads(rows);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].rowNumber, 3);
  assert.equal(leads[0].name, 'Ali & Co');
  assert.equal(leads[0].city, 'Lahore');
});

test('headers are recognised in common spellings; other columns are kept', () => {
  const { leads, recognized } = rowsToLeads([
    ['', ''],
    ['First Name', 'Last Name', 'Mobile No.', 'E-mail', 'Company', 'Country', 'Town', 'Budget'],
    ['Sara', 'Khan', '0300-1234567', 'SARA@x.com', 'Acme', 'Pakistan', 'Karachi', '5000'],
  ]);
  assert.ok(recognized.includes('phone') && recognized.includes('email') && recognized.includes('city'));
  assert.equal(leads[0].name, 'Sara Khan');
  assert.equal(leads[0].phone, '0300-1234567');
  assert.equal(leads[0].companyName, 'Acme');
  assert.deepEqual(leads[0].extra, { Budget: '5000' });
});

test('phone key matches the Contacts duplicate rule (last 10 digits)', () => {
  assert.equal(phoneKey('0300 1234567'), '3001234567');
  assert.equal(phoneKey('+92 300 1234567'), '3001234567');
  assert.equal(phoneKey('+1 (415) 555-0100'), '4155550100');
  assert.equal(phoneKey('12345'), '');
});

test('validation and in-file duplicates', () => {
  const base = { country: '', city: '', companyName: '', extra: {} };
  const leads = [
    { rowNumber: 2, name: 'A', phone: '03001234567', email: '', ...base },
    { rowNumber: 3, name: '', phone: '03001234568', email: '', ...base },
    { rowNumber: 4, name: 'C', phone: '', email: '', ...base },
    { rowNumber: 5, name: 'D', phone: '+92 300 1234567', email: '', ...base },
    { rowNumber: 6, name: 'E', phone: '', email: 'bad-email', ...base },
    { rowNumber: 7, name: 'F', phone: '', email: 'f@x.com', ...base },
    { rowNumber: 8, name: 'G', phone: '', email: 'F@X.com', ...base },
  ];
  assert.equal(validateLead(leads[0]), null);
  const issues = checkLeadRows(leads);
  assert.equal(issues.get(2), undefined);
  assert.equal(issues.get(3)?.reason, 'Name is missing');
  assert.equal(issues.get(4)?.reason, 'Phone or email is required');
  assert.deepEqual(issues.get(5), { kind: 'duplicate', reason: 'Same phone as row 2' });
  assert.equal(issues.get(6)?.reason, 'Email is not valid');
  assert.equal(issues.get(7), undefined);
  assert.deepEqual(issues.get(8), { kind: 'duplicate', reason: 'Same email as row 7' });
});
