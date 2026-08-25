import { expect, test, type Page } from '@playwright/test';
import path from 'path';

const CUSTOMER = 'TEST-CUSTOMER-001';
const VENDOR = 'TEST-VENDOR-001';
const INVOICE_LINE = 'TEST-INVOICE-001';
const BILL_LINE = 'TEST-BILL-001';
const SHOT_DIR = path.join('test-results', 'accounting-cycle');

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

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
    timeout: 45_000,
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
      // Click-through may already have selected an org.
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
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        /hydration|React DevTools|HMR|Fast Refresh|Download the React|module factory is not available/i.test(
          text
        )
      ) {
        return;
      }
      consoleErrors.push(text.slice(0, 400));
    }
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (
      /_next\/static|_next\/webpack|favicon|hot-update|__nextjs/i.test(url)
    ) {
      return;
    }
    failedRequests.push(`${status} ${res.request().method()} ${url}`);
  });
}

async function saveContact(page: Page, kind: 'customers' | 'vendors') {
  if (/^Admin$/i.test(await triggerLabel(page))) {
    throw new Error('Cannot save contact while session is still Admin context');
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/Contact created|Contact updated/i).first()
  ).toBeVisible({ timeout: 20_000 });
  try {
    await page.waitForURL(
      new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`, 'i'),
      { timeout: 8_000 }
    );
  } catch {
    await page.goto(`/accounting/${kind}`, { waitUntil: 'domcontentloaded' });
    await page.getByText(kind === 'customers' ? CUSTOMER : VENDOR).first().click();
    await page.waitForURL(new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`, 'i'), {
      timeout: 20_000,
    });
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

async function fillDocumentLine(page: Page, productName: string, price: string) {
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

  const tax = page.locator('table input[title="Tax %"]').first();
  if ((await tax.count()) > 0) {
    await tax.fill('0');
  }
}

async function payInvoice(page: Page, amount: string) {
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pay' })).toBeVisible();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Cash' }).click();
  await page.locator('input.h-8.rounded-sm.pl-9').fill(amount);
  await page.getByRole('button', { name: 'Create Payment' }).click();
  await expect(page.getByRole('heading', { name: 'Pay' })).toHaveCount(0, {
    timeout: 60_000,
  });
}

async function waitForInvoicePosted(page: Page) {
  const pay = page.getByRole('button', { name: 'Pay', exact: true });
  const toast = page.locator('[data-sonner-toast]');
  await expect(async () => {
    const toastText = ((await toast.first().innerText().catch(() => '')) || '').trim();
    if (/fail|error|required|lock|not posted/i.test(toastText)) {
      throw new Error(`Invoice post failed: ${toastText}`);
    }
    if (await pay.isVisible()) return;
    throw new Error('Invoice still not posted');
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
}

async function waitForBillPosted(page: Page) {
  const register = page.getByRole('button', { name: 'Register Payment' });
  const je = page.getByRole('button', { name: 'Journal Entry' });
  const toast = page.locator('[data-sonner-toast]');
  await expect(async () => {
    const toastText = ((await toast.first().innerText().catch(() => '')) || '').trim();
    if (/fail|error|required|lock|not posted/i.test(toastText)) {
      throw new Error(`Bill post failed: ${toastText}`);
    }
    if ((await register.isVisible()) || (await je.isVisible())) return;
    throw new Error('Bill still not posted');
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
}

async function openJournalEntry(page: Page) {
  const named = page.getByRole('button', { name: 'Journal Entry' });
  const items = page.getByRole('button', { name: /Journal Items/ });
  if (await named.isVisible().catch(() => false)) {
    await named.click();
  } else if (await items.isVisible().catch(() => false)) {
    await items.click();
  } else {
    await page.getByText('Journal Entry', { exact: true }).click();
  }
  await page.waitForURL(/\/accounting\/journal-entries\//, { timeout: 20_000 });
  await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
}

test.describe('Accounting live E2E cycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('customer invoice post pay reports then vendor bill payment refund', async ({
    page,
  }) => {
    test.setTimeout(12 * 60 * 1000);
    await attachDiagnostics(page);
    await login(page);
    await ensureOrganization(page);
    await shot(page, '01-dashboard');

    await page.keyboard.press('Escape').catch(() => undefined);
    for (const label of [
      'Dashboard',
      'Accounting',
      'Review',
      'Reporting',
      'Configuration',
      'Customers',
      'Vendors',
    ]) {
      await expect(
        page.locator('header').getByText(label, { exact: true }).first()
      ).toBeVisible();
    }

    await page.goto('/accounting/customers', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'New', exact: true }).click();
    try {
      await page.waitForURL(/\/accounting\/customers\/new/, { timeout: 8_000 });
    } catch {
      await page.goto('/accounting/customers/new', {
        waitUntil: 'domcontentloaded',
      });
    }
    const nameInput = page.getByTestId('contact-name-input');
    await expect(nameInput).toBeVisible({ timeout: 20_000 });
    await nameInput.click();
    await nameInput.fill(CUSTOMER);
    await expect(nameInput).toHaveValue(CUSTOMER);
    await page.getByPlaceholder('Email').fill('test-customer-001@example.test');
    await page.getByPlaceholder('Phone').fill('+92 300 0000001');
    await page.getByPlaceholder('Street…').fill('1 Test Street');
    await page.getByPlaceholder('City').fill('Karachi');
    await page.getByPlaceholder('Country').fill('Pakistan');
    await page.getByRole('button', { name: 'Sales & Purchase' }).click();
    await page.getByLabel('Mark as Customer (show in CRM)').check();
    await page.getByRole('main').getByRole('button', { name: 'Accounting' }).click();
    await saveContact(page, 'customers');
    await expect(page.getByPlaceholder('Name (company or person)')).toHaveValue(
      CUSTOMER
    );
    const customerUrl = page.url();
    const customerId = customerUrl.split('/customers/')[1]?.split('/')[0];
    expect(customerId).toBeTruthy();
    await shot(page, '02-customer-saved');

    await page.goto('/accounting/invoices', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'New', exact: true }).click();
    await page.waitForURL(/\/accounting\/invoices\/[0-9a-f-]+/, {
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 30_000,
    });
    await pickContact(page, CUSTOMER);
    await fillDocumentLine(page, INVOICE_LINE, '100000');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForInvoicePosted(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForInvoicePosted(page);
    await expect(page.getByText(/100,000/).first()).toBeVisible({
      timeout: 20_000,
    });
    const invoiceUrl = page.url();
    const invoiceId = invoiceUrl.split('/invoices/')[1]?.split('/')[0];
    expect(invoiceId).toBeTruthy();
    await shot(page, '03-invoice-posted');

    await openJournalEntry(page);
    await expect(page.getByText(/100,000/).first()).toBeVisible();
    await shot(page, '04-invoice-journal-entry');

    await page.goto('/accounting/review/journal-items', {
      waitUntil: 'domcontentloaded',
    });
    const search = page.getByPlaceholder(/Search/);
    if (await search.count()) {
      await search.first().fill(CUSTOMER);
    }
    await expect(page.getByText(CUSTOMER).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '05-review-journal-items');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await payInvoice(page, '60000');
    await expect(page.getByText(/40,000/).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '06-invoice-paid-60');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Customer Ledger' })
    ).toBeVisible();
    await expect(page.getByText(/40,000/).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '07-customer-ledger-40k');

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(CUSTOMER).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/40,000/).first()).toBeVisible();
    await shot(page, '08-aged-receivable-40k');

    for (const statement of [
      'trial_balance',
      'general_ledger',
      'partner_ledger',
      'profit_loss',
      'balance_sheet',
      'cash_flow',
    ]) {
      await page.goto(`/accounting/reports?statement=${statement}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
      const crash = await page
        .getByText(/is not defined|Application error/i)
        .count();
      expect(crash, `${statement} crashed`).toBe(0);
    }

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await payInvoice(page, '40000');
    await expect(
      page.getByRole('button', { name: 'Pay', exact: true })
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/PKR\s*0(\.00)?/).first()).toBeVisible();
    await shot(page, '09-invoice-paid-in-full');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/Closing balance:.*\b0/)).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    const stillListed = await page.getByText(CUSTOMER).count();
    if (stillListed > 0) {
      const row = page.locator('tr', { hasText: CUSTOMER }).first();
      await expect(row).toContainText(/0\.00|0$/);
    }
    await shot(page, '10-aged-receivable-cleared');

    await page.goto('/accounting/vendors', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'New', exact: true }).click();
    try {
      await page.waitForURL(/\/accounting\/vendors\/new/, { timeout: 8_000 });
    } catch {
      await page.goto('/accounting/vendors/new', { waitUntil: 'domcontentloaded' });
    }
    const vendorName = page.getByTestId('contact-name-input');
    await expect(vendorName).toBeVisible({ timeout: 20_000 });
    await vendorName.click();
    await vendorName.fill(VENDOR);
    await expect(vendorName).toHaveValue(VENDOR);
    await page.getByPlaceholder('Email').fill('test-vendor-001@example.test');
    await page.getByPlaceholder('Phone').fill('+92 300 0000002');
    await page.getByPlaceholder('Street…').fill('2 Vendor Avenue');
    await page.getByPlaceholder('City').fill('Lahore');
    await page.getByRole('button', { name: 'Sales & Purchase' }).click();
    await page.getByLabel('Mark as Vendor').check();
    await saveContact(page, 'vendors');
    const vendorId = page.url().split('/vendors/')[1]?.split('/')[0];
    expect(vendorId).toBeTruthy();
    await shot(page, '11-vendor-saved');

    await page.goto('/accounting/bills', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'New', exact: true }).click();
    await page.waitForURL(/\/accounting\/bills\/[0-9a-f-]{8,}/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 30_000,
    });
    await pickContact(page, VENDOR);
    await fillDocumentLine(page, BILL_LINE, '100000');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForBillPosted(page);
    const billId = page.url().split('/bills/')[1]?.split('/')[0];
    expect(billId).toBeTruthy();
    await shot(page, '12-bill-posted');

    await openJournalEntry(page);
    await expect(page.getByText(/100,000/).first()).toBeVisible();
    await shot(page, '13-bill-journal-entry');

    await page.goto(`/accounting/bills/${billId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Register Payment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Register Payment' })
    ).toBeVisible();
    await page.getByRole('dialog').locator('input[type="number"]').first().fill(
      '60000'
    );
    await page.getByRole('dialog').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Cash' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(page.getByText(/40,000/).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '14-bill-paid-60');

    await page.goto('/accounting/reports?statement=aged_payable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(VENDOR).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/40,000/).first()).toBeVisible();
    await shot(page, '15-aged-payable-40k');

    await page.goto(`/accounting/bills/${billId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: 'Create Refund' }).click();
    await page.waitForURL(/\/accounting\/vendor-refunds\//, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Posted|Refunded/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByRole('button', { name: 'Journal Entry' })
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, '16-vendor-refund-posted');
    await openJournalEntry(page);
    await shot(page, '17-refund-journal-entry');

    await page.goto('/accounting/reports?statement=aged_payable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('main')).toBeVisible();
    await shot(page, '18-aged-payable-after-refund');

    await page.goto('/accounting/configuration/chart-of-accounts', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
    await page.goto('/accounting/configuration/journals');
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/accounting/configuration/taxes');
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/accounting/configuration/payment-terms');
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/accounting/configuration/currencies');
    await expect(page.locator('main')).toBeVisible();
    await shot(page, '19-configuration');

    const hardFailures = failedRequests.filter(
      (r) =>
        !/favicon|hot-update|webpack|_next\/image|\/login/i.test(r) &&
        !/^404 /.test(r)
    );
    expect(hardFailures, hardFailures.join('\n')).toEqual([]);
  });
});
