/**
 * Lead Distribution: reading uploaded files and checking their rows.
 *
 * - CSV is parsed here (RFC 4180: quotes, escaped quotes, commas and line breaks
 *   inside quotes).
 * - .xlsx is a zip of XML files; it is unzipped with the platform's
 *   DecompressionStream and the first worksheet is read. No extra dependency.
 * - Legacy .xls (binary) is not supported: save it as .xlsx or CSV.
 *
 * Everything here is pure apart from the unzip, so it runs in the browser, on
 * the server (to re-check rows) and in tests.
 */

import { normalizePakistaniPhone, normalizePhoneDigits } from './pakistan-phone';

export const LEAD_IMPORT_MAX_ROWS = 2000;
export const LEAD_IMPORT_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export type LeadImportRow = {
  /** 1-based row number in the file (header = row 1). */
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  country: string;
  city: string;
  /** Other columns from the file, keyed by their header. */
  extra: Record<string, string>;
};

export type LeadRowIssue =
  | { kind: 'invalid'; reason: string }
  | { kind: 'duplicate'; reason: string };

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      // Excel in some regions saves CSV with ";" — accept both, and tabs.
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX (zip + XML)
// ---------------------------------------------------------------------------

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: search backwards for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not-a-zip');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('bad-zip');
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    // Data starts after the local header, whose name/extra lengths can differ.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    entries.push({ name, method, compressedSize, offset: localOffset + 30 + localNameLength + localExtraLength });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const data = bytes.subarray(entry.offset, entry.offset + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('unsupported-compression');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Text of every <t> inside a fragment (rich text runs are joined). */
function textRuns(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]);
  return out;
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** First worksheet of an .xlsx file as rows of text. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = readZipEntries(bytes);
  const find = (name: string) => entries.find((e) => e.name === name);

  // Resolve the first sheet through the workbook, falling back to sheet1.xml.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = find('xl/workbook.xml');
  const rels = find('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const wb = await readZipText(bytes, workbook);
    const firstSheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) ?? /<sheet\b[^>]*\bid="([^"]+)"/.exec(wb);
    if (firstSheet) {
      const relXml = await readZipText(bytes, rels);
      const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstSheet[1]}"[^>]*Target="([^"]+)"`).exec(relXml)
        ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet[1]}"`).exec(relXml);
      if (rel) sheetPath = rel[1].startsWith('/') ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, '')}`;
    }
  }
  const sheet = find(sheetPath);
  if (!sheet) throw new Error('no-sheet');

  const shared: string[] = [];
  const sharedEntry = find('xl/sharedStrings.xml');
  if (sharedEntry) {
    const xml = await readZipText(bytes, sharedEntry);
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));
  }

  const xml = await readZipText(bytes, sheet);
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      let value = '';
      if (type === 'inlineStr') value = textRuns(body);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (v !== undefined) value = type === 's' ? shared[Number(v)] ?? '' : decodeXml(v);
      }
      cells[index] = value;
    }
    rows[rowIndex] = Array.from(cells, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}

/** Reads a File into rows of text, or throws an Error with a message for the user. */
export async function readLeadFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) {
    try {
      return await parseXlsx(await file.arrayBuffer());
    } catch {
      throw new Error('This Excel file could not be read. Open it in Excel and save it again as .xlsx or CSV.');
    }
  }
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported yet. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then upload that file.');
  }
  throw new Error('Choose an Excel (.xlsx) or CSV file.');
}

// ---------------------------------------------------------------------------
// Columns → leads
// ---------------------------------------------------------------------------

type Field = 'name' | 'phone' | 'email' | 'companyName' | 'country' | 'city' | 'firstName' | 'lastName';

const HEADER_ALIASES: Record<Field, string[]> = {
  name: ['name', 'contact name', 'full name', 'customer name', 'client name', 'lead name', 'contact', 'contact person', 'person'],
  firstName: ['first name', 'firstname', 'given name'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'mobile no', 'cell', 'cell number', 'contact number', 'contact no', 'whatsapp', 'whatsapp number', 'number', 'tel', 'telephone'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  companyName: ['company', 'company name', 'business', 'business name', 'organization', 'organisation', 'firm'],
  country: ['country'],
  city: ['city', 'town'],
};

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[_.:#*]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Which field each column holds; unknown columns are kept as extra info. */
export function mapHeaders(headers: string[]): Array<Field | null> {
  const used = new Set<Field>();
  return headers.map((header) => {
    const h = normalizeHeader(header);
    if (!h) return null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[Field, string[]]>) {
      if (!used.has(field) && aliases.includes(h)) {
        used.add(field);
        return field;
      }
    }
    return null;
  });
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Turns raw rows (first non-empty row = headers) into leads. */
export function rowsToLeads(rows: string[][]): { leads: LeadImportRow[]; headers: string[]; recognized: Field[] } {
  const headerIndex = rows.findIndex((r) => r.some((c) => clean(c)));
  if (headerIndex < 0) return { leads: [], headers: [], recognized: [] };
  const headers = rows[headerIndex].map(clean);
  const fields = mapHeaders(headers);
  const leads: LeadImportRow[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (!cells.some((c) => clean(c))) continue;
    const lead: LeadImportRow = { rowNumber: i + 1, name: '', phone: '', email: '', companyName: '', country: '', city: '', extra: {} };
    let first = '';
    let last = '';
    headers.forEach((header, col) => {
      const value = clean(cells[col]);
      if (!value) return;
      const field = fields[col];
      if (field === 'firstName') first = value;
      else if (field === 'lastName') last = value;
      else if (field) lead[field] = value;
      else if (header) lead.extra[header] = value;
    });
    if (!lead.name) lead.name = clean(`${first} ${last}`);
    leads.push(lead);
  }
  return { leads, headers, recognized: fields.filter((f): f is Field => Boolean(f)) };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** Last 10 digits, the same key the Contacts duplicate check uses. Empty when too short. */
export function phoneKey(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let digits = normalizePhoneDigits(value);
  const pk = normalizePakistaniPhone(value);
  if (pk.ok) digits = pk.value;
  return digits.length >= 10 ? digits.slice(-10) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problems with one row on its own (not duplicates). */
export function validateLead(lead: LeadImportRow): string | null {
  if (!lead.name) return 'Name is missing';
  if (!lead.phone && !lead.email) return 'Phone or email is required';
  if (lead.phone && !phoneKey(lead.phone)) return 'Phone number is too short';
  if (lead.email && !EMAIL_RE.test(lead.email)) return 'Email is not valid';
  if (lead.name.length > 200) return 'Name is too long';
  return null;
}

/**
 * Checks every row: invalid rows, then repeats inside the file (the first copy
 * is kept). Matches already in the database are added by the server.
 */
export function checkLeadRows(leads: LeadImportRow[]): Map<number, LeadRowIssue> {
  const issues = new Map<number, LeadRowIssue>();
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  for (const lead of leads) {
    const invalid = validateLead(lead);
    if (invalid) {
      issues.set(lead.rowNumber, { kind: 'invalid', reason: invalid });
      continue;
    }
    const key = phoneKey(lead.phone);
    const email = lead.email.toLowerCase();
    const firstPhone = key ? seenPhone.get(key) : undefined;
    const firstEmail = email ? seenEmail.get(email) : undefined;
    if (firstPhone !== undefined || firstEmail !== undefined) {
      issues.set(lead.rowNumber, {
        kind: 'duplicate',
        reason: `Same ${firstPhone !== undefined ? 'phone' : 'email'} as row ${firstPhone ?? firstEmail}`,
      });
      continue;
    }
    if (key) seenPhone.set(key, lead.rowNumber);
    if (email) seenEmail.set(email, lead.rowNumber);
  }
  return issues;
}
