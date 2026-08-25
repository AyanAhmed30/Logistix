import { expect, test, type Page } from '@playwright/test';
import path from 'path';

const CUSTOMER = 'TEST-TAX-CUSTOMER-AUTO-001';
const VENDOR = 'TEST-TAX-VENDOR-AUTO-001';
const INVOICE_LINE = 'TEST-TAX-INVOICE-AUTO-001';
const BILL_LINE = 'TEST-TAX-BILL-AUTO-001';
const SHOT_DIR = path.join('test-results', 'accounting-tax-engine');

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function moneyRe(n: number) {
  const rounded = Math.round(n);
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return new RegExp(grouped);
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
}

async function orgSwitcher(page: Page) {
  return page.getByTestId('organization-switcher');
}

async function triggerLabel(page: Page) {
  const trigger = await orgSwitcher(page);
  return ((await trigger.innerText()) || '').replace(/\s+/g, ' ').trim();
}

async function ensureOrganization(page: Page) {
  await page.goto('/accounting', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Accounting Dashboard' })
  ).toBeVisible({ timeout: 45_000 });

  const trigger = await orgSwitcher(page);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  if (!/^Admin$/i.test(await triggerLabel(page))) return;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await trigger.click();
    const abc = page.getByRole('menuitem', { name: 'ABC Technologies' });
    try {
      await abc.waitFor({ state: 'visible', timeout: 2500 });
      await abc.click();
    } catch {
      /* already selected */
    }
    await page.waitForTimeout(900);
    if (!/^Admin$/i.test(await triggerLabel(page))) {
      await page.keyboard.press('Escape').catch(() => undefined);
      break;
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Accounting Dashboard' })
  ).toBeVisible({ timeout: 30_000 });
  if (/^Admin$/i.test(await triggerLabel(page))) {
    throw new Error(
      'Organization switch did not persist after reload — session is still Admin'
    );
  }
}

async function attachDiagnostics(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (
      /hydration|React DevTools|HMR|Fast Refresh|Download the React|module factory is not available/i.test(
        text
      )
    ) {
      return;
    }
    consoleErrors.push(text.slice(0, 400));
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (/_next\/static|_next\/webpack|favicon|hot-update|__nextjs/i.test(url)) {
      return;
    }
    failedRequests.push(`${status} ${res.request().method()} ${url}`);
  });
}

async function saveContact(page: Page) {
  if (/^Admin$/i.test(await triggerLabel(page))) {
    throw new Error('Cannot save contact while session is still Admin context');
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/Contact created|Contact updated/i).first()
  ).toBeVisible({ timeout: 20_000 });
  try {
    await page.waitForURL(/\/accounting\/(customers|vendors)\/[0-9a-f-]{8,}/i, {
      timeout: 8_000,
    });
  } catch {
    /* stay on form; caller reloads list */
  }
}

async function pickContact(page: Page, name: string) {
  const picker = page
    .getByPlaceholder(/Search a name|Find a vendor|Type to find/i)
    .first();
  await picker.click();
  await picker.fill(name);
  const option = page.locator('button[data-picker-index="0"]');
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
}

async function openNewDocument(
  page: Page,
  kind: 'invoices' | 'bills'
) {
  await page.goto(`/accounting/${kind}/new`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page).toHaveURL(
    new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`),
    { timeout: 15_000 }
  );
}

async function fillDocumentLine(
  page: Page,
  productName: string,
  price: string,
  tax: string
) {
  const productInput = page.getByPlaceholder('Search product…').first();
  await productInput.click();
  await productInput.fill(productName);
  await page.keyboard.press('Escape');

  const qty = page.locator('table input[type="number"]').first();
  await qty.fill('1');

  const priced = page.locator('table input[title*="Unit price"]').first();
  if ((await priced.count()) > 0) {
    await priced.fill(price);
    await priced.blur();
  } else {
    await page.locator('table input[type="number"]').nth(1).fill(price);
  }

  const taxInput = page.locator('table input[title="Tax %"]').first();
  if ((await taxInput.count()) > 0) {
    await taxInput.fill(tax);
    await taxInput.blur();
  } else {
    const nums = page.locator('table input[type="number"]');
    const count = await nums.count();
    if (count >= 3) {
      await nums.nth(2).fill(tax);
      await nums.nth(2).blur();
    }
  }
}

async function waitForInvoicePosted(page: Page) {
  const toast = page.locator('[data-sonner-toast]');
  await expect(async () => {
    const toastText = ((await toast.first().innerText().catch(() => '')) || '').trim();
    if (/fail|error|required|lock|not posted/i.test(toastText)) {
      throw new Error(`Invoice post failed: ${toastText}`);
    }
    if (await page.getByRole('button', { name: 'Confirm', exact: true }).isVisible()) {
      throw new Error('Invoice still draft');
    }
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/INV/i, {
    timeout: 15_000,
  });
}

async function waitForBillPosted(page: Page) {
  const pay = page.getByRole('button', { name: /Register Payment/i });
  const toast = page.locator('[data-sonner-toast]');
  await expect(async () => {
    const toastText = ((await toast.first().innerText().catch(() => '')) || '').trim();
    if (/fail|error|required|lock|not posted/i.test(toastText)) {
      throw new Error(`Bill post failed: ${toastText}`);
    }
    if (await pay.isVisible()) return;
    throw new Error('Bill still not posted');
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
}

async function openJournalEntry(page: Page) {
  const cnLink = page.getByTestId('credit-note-journal-entry');
  const named = page.getByRole('button', { name: 'Journal Entry' });
  const items = page.getByRole('button', { name: /Journal Items/ });
  if (await cnLink.isVisible().catch(() => false)) {
    const href = await cnLink.getAttribute('href');
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded' });
    } else {
      await cnLink.click({ timeout: 30_000 });
    }
  } else if (await named.isVisible().catch(() => false)) {
    await named.click();
  } else if (await items.isVisible().catch(() => false)) {
    await items.click();
  } else {
    await page.getByText('Journal Entry', { exact: true }).click();
  }
  await page.waitForURL(/\/accounting\/journal-entries\//, {
    timeout: 20_000,
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
}

async function payCash(page: Page, amount: string) {
  const pay = page.getByRole('button', { name: 'Pay', exact: true });
  await expect(pay).toBeEnabled({ timeout: 45_000 });
  await pay.click();
  await expect(page.getByRole('heading', { name: 'Pay' })).toBeVisible();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Cash' }).click();
  await page.locator('input.h-8.rounded-sm.pl-9').fill(amount);
  await page.getByRole('button', { name: 'Create Payment' }).click();
  await expect(page.getByRole('heading', { name: 'Pay' })).toHaveCount(0, {
    timeout: 60_000,
  });
}

async function ensurePartner(
  page: Page,
  kind: 'customers' | 'vendors',
  name: string,
  extra: { email: string; phone: string; street: string; city: string }
) {
  await page.goto(`/accounting/${kind}`, { waitUntil: 'domcontentloaded' });
  const existing = page.getByText(name).first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
    await page.waitForURL(new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`), {
      timeout: 20_000,
    });
    return page.url().split(`/${kind}/`)[1]?.split('/')[0] || '';
  }
  await page.getByRole('link', { name: 'New', exact: true }).click();
  try {
    await page.waitForURL(new RegExp(`/accounting/${kind}/new`), {
      timeout: 8_000,
    });
  } catch {
    await page.goto(`/accounting/${kind}/new`, {
      waitUntil: 'domcontentloaded',
    });
  }
  await page.getByPlaceholder('Name (company or person)').fill(name);
  await page.getByPlaceholder('Email').fill(extra.email);
  await page.getByPlaceholder('Phone').fill(extra.phone);
  await page.getByPlaceholder('Street…').fill(extra.street);
  await page.getByPlaceholder('City').fill(extra.city);
  await page.getByPlaceholder('Country').fill('Pakistan');
  await page.getByRole('button', { name: 'Sales & Purchase' }).click();
  if (kind === 'customers') {
    await page.getByLabel('Mark as Customer (show in CRM)').check();
    await page.getByRole('main').getByRole('button', { name: 'Accounting' }).click();
  } else {
    await page.getByLabel('Mark as Vendor').check();
  }
  await page.getByPlaceholder('Name (company or person)').fill(name);
  await saveContact(page);
  if (!new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`).test(page.url())) {
    await page.goto(`/accounting/${kind}`, { waitUntil: 'domcontentloaded' });
    await page.getByText(name).first().click();
    await page.waitForURL(new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`), {
      timeout: 20_000,
    });
  }
  return page.url().split(`/${kind}/`)[1]?.split('/')[0] || '';
}

test.describe('Accounting tax engine', () => {
  test.describe.configure({ mode: 'serial' });

  test('configured sales and purchase tax post, reverse, pay, and report from JEs', async ({
    page,
  }) => {
    test.setTimeout(14 * 60 * 1000);
    await attachDiagnostics(page);
    await login(page);
    await ensureOrganization(page);
    await shot(page, '01-dashboard');

    await page.goto('/accounting/configuration/taxes', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Tax Name').first()).toBeVisible({
      timeout: 30_000,
    });
    const salesRow = page
      .locator('tr[data-tax-type="sales_tax"]:not([data-tax-rate="0"])')
      .first();
    await expect(salesRow).toBeVisible({ timeout: 20_000 });
    const salesRate = Number(await salesRow.getAttribute('data-tax-rate'));
    expect(salesRate).toBeGreaterThan(0);
    const purchaseRow = page.locator('tr[data-tax-type="purchase_tax"]').first();
    await expect(purchaseRow).toBeVisible({ timeout: 15_000 });
    const purchaseRate = Number(await purchaseRow.getAttribute('data-tax-rate'));
    expect(purchaseRate).toBeGreaterThan(0);
    await shot(page, '02-taxes');

    const subtotal = 100000;
    const salesTaxAmt = Math.round(subtotal * (salesRate / 100) * 100) / 100;
    const salesTotal = Math.round((subtotal + salesTaxAmt) * 100) / 100;
    const purchaseTaxAmt =
      Math.round(subtotal * (purchaseRate / 100) * 100) / 100;
    const purchaseTotal = Math.round((subtotal + purchaseTaxAmt) * 100) / 100;

    const customerId = await ensurePartner(page, 'customers', CUSTOMER, {
      email: 'test-tax-customer-auto-001@example.test',
      phone: '+92 300 0000017',
      street: '17 Tax Street',
      city: 'Karachi',
    });
    expect(customerId).toBeTruthy();

    await openNewDocument(page, 'invoices');
    await pickContact(page, CUSTOMER);
    await fillDocumentLine(page, INVOICE_LINE, String(subtotal), String(salesRate));
    await expect(page.getByText(moneyRe(salesTotal)).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForInvoicePosted(page);
    const invoiceId = page.url().split('/invoices/')[1]?.split('/')[0];
    expect(invoiceId).toBeTruthy();
    const invoiceNumber = (
      (await page.getByRole('heading', { level: 1 }).innerText()) || ''
    ).trim();
    expect(invoiceNumber).toMatch(/INV/i);
    await expect(page.getByTestId('invoice-amount-due')).toContainText(
      moneyRe(salesTotal)
    );
    await shot(page, '03-invoice-posted');

    await openJournalEntry(page);
    await expect(page.locator('table')).toContainText('4100 Revenue');
    await expect(page.locator('table')).toContainText('2200 Tax Payable');
    await expect(page.locator('table')).toContainText('1300 Accounts Receivable');
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    await shot(page, '04-invoice-je');

    await page.goto('/accounting/review/journal-items', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
    await shot(page, '05-journal-items');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toContainText(
      moneyRe(salesTotal),
      { timeout: 30_000 }
    );
    await shot(page, '05b-customer-ledger');

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toContainText(
      moneyRe(salesTotal),
      { timeout: 30_000 }
    );
    await shot(page, '05c-aged-ar');

    await page.goto('/accounting/reports?statement=tax_report', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/Sales/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('main')).toContainText(
      new RegExp(`${salesRate.toFixed(1)}\\s*%`)
    );
    await shot(page, '06-tax-report-sales');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await payCash(page, String(salesTotal));
    await expect(page.getByTestId('invoice-amount-due')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Paid/i).first()).toBeVisible();
    await shot(page, '06b-cash-paid-taxed-invoice');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Credit Note', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Credit Note' })).toBeVisible();
    await page.getByRole('button', { name: 'Reverse', exact: true }).click();
    await page.waitForURL(/\/accounting\/credit-notes\/[0-9a-f-]{8,}/, {
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByTestId('credit-note-journal-entry')).toBeVisible({
      timeout: 60_000,
    });
    await openJournalEntry(page);
    await expect(page.locator('table')).toContainText('2200 Tax Payable');
    await expect(page.locator('table')).toContainText('4100 Revenue');
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    await shot(page, '07-credit-note-je');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/Paid/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('invoice-amount-due')).toHaveCount(0);

    const vendorId = await ensurePartner(page, 'vendors', VENDOR, {
      email: 'test-tax-vendor-auto-001@example.test',
      phone: '+92 300 0000018',
      street: '18 Purchase Tax Avenue',
      city: 'Lahore',
    });
    expect(vendorId).toBeTruthy();

    await openNewDocument(page, 'bills');
    await pickContact(page, VENDOR);
    await fillDocumentLine(page, BILL_LINE, String(subtotal), String(purchaseRate));
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForBillPosted(page);
    const billId = page.url().split('/bills/')[1]?.split('/')[0];
    expect(billId).toBeTruthy();
    await expect(page.getByText(moneyRe(purchaseTotal)).first()).toBeVisible();
    await shot(page, '09-bill-posted');

    await openJournalEntry(page);
    await expect(page.locator('table')).toContainText(/5100|Expense/i);
    await expect(page.locator('table')).toContainText(/2100|Payable/i);
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    const billJeText = (await page.locator('table').innerText()) || '';
    expect(/1400|2200|Tax/i.test(billJeText)).toBeTruthy();
    await shot(page, '10-bill-je');

    await page.goto('/accounting/reports?statement=aged_payable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(VENDOR).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(moneyRe(purchaseTotal)).first()).toBeVisible();

    await page.goto(`/accounting/bills/${billId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Register Payment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Register Payment' })
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .locator('input[type="number"]')
      .first()
      .fill(String(purchaseTotal));
    await page.getByRole('dialog').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Cash' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Paid/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await shot(page, '10b-bill-cash-paid');

    await page.goto(`/accounting/bills/${billId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: 'Create Refund' }).click();
    await page.waitForURL(/\/accounting\/vendor-refunds\//, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Posted|Refunded/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await openJournalEntry(page);
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    await shot(page, '11-vendor-refund-je');

    for (const statement of [
      'general_ledger',
      'trial_balance',
      'partner_ledger',
      'profit_loss',
      'balance_sheet',
      'tax_report',
      'aged_receivable',
      'aged_payable',
    ]) {
      await page.goto(`/accounting/reports?statement=${statement}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
    }
    await shot(page, '13-reports');

    const orgName = await triggerLabel(page);
    await (await orgSwitcher(page)).click();
    const adminItem = page.getByRole('menuitem', { name: 'Admin' });
    if (await adminItem.isVisible().catch(() => false)) {
      await adminItem.click();
      await page.waitForTimeout(800);
      await page.goto('/accounting/invoices', { waitUntil: 'domcontentloaded' });
      await shot(page, '14-admin-org-isolation');
      await (await orgSwitcher(page)).click();
      const back = page.getByRole('menuitem', { name: orgName });
      if (await back.isVisible().catch(() => false)) await back.click();
    }

    expect(invoiceId).toBeTruthy();
    expect(billId).toBeTruthy();
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
    const accountingFails = failedRequests.filter((r) =>
      /\/accounting|server action/i.test(r)
    );
    expect(accountingFails, accountingFails.join('\n')).toEqual([]);
  });
});
