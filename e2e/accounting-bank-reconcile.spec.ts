import { expect, test, type Page } from '@playwright/test';
import path from 'path';

const CUSTOMER = 'TEST-BANK-CUSTOMER-001';
const INVOICE_LINE = 'TEST-BANK-INVOICE-001';
const SHOT_DIR = path.join('test-results', 'accounting-bank-reconcile');

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
    await page.waitForURL(/\/accounting\/customers\/[0-9a-f-]{8,}/i, {
      timeout: 8_000,
    });
  } catch {
    await page.goto('/accounting/customers', { waitUntil: 'domcontentloaded' });
    await page.getByText(CUSTOMER).first().click();
    await page.waitForURL(/\/accounting\/customers\/[0-9a-f-]{8,}/i, {
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

async function payInvoiceBank(page: Page, amount: string) {
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pay' })).toBeVisible();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Bank' }).click();
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
  await page.waitForURL(/\/accounting\/journal-entries\//, {
    timeout: 20_000,
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
}

async function acceptBankSuggestion(page: Page, invoiceNumber: string) {
  await page.goto('/accounting/reconcile?tab=suggestions', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText('Suggested matches').first()).toBeVisible({
    timeout: 30_000,
  });
  const card = page
    .getByTestId('reconcile-suggestion')
    .filter({ hasText: invoiceNumber })
    .first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  const accept = card.getByTestId('reconcile-accept');
  await expect(accept).toBeEnabled({ timeout: 20_000 });
  await accept.click({ force: true });
  const toast = page.locator('[data-sonner-toast]').first();
  await expect(toast).toBeVisible({ timeout: 60_000 });
  const toastText = ((await toast.innerText()) || '').trim();
  if (/fail|error|must balance|unauthorized|not found/i.test(toastText)) {
    throw new Error(`Reconcile failed: ${toastText}`);
  }
}

test.describe('Accounting bank payment + reconciliation', () => {
  test.describe.configure({ mode: 'serial' });

  test('bank payment stays unreconciled until matched, then clears residual', async ({
    page,
  }) => {
    test.setTimeout(12 * 60 * 1000);
    await attachDiagnostics(page);
    await login(page);
    await ensureOrganization(page);
    await shot(page, '01-dashboard');

    await page.goto('/accounting/configuration/journals', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/Bank Journal|BNK/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '02-bank-journal');

    await page.goto('/accounting/customers', { waitUntil: 'domcontentloaded' });
    const existing = page.getByText(CUSTOMER).first();
    if (await existing.isVisible().catch(() => false)) {
      await existing.click();
      await page.waitForURL(/\/accounting\/customers\/[0-9a-f-]{8,}/, {
        timeout: 20_000,
      });
    } else {
      await page.getByRole('link', { name: 'New', exact: true }).click();
      try {
        await page.waitForURL(/\/accounting\/customers\/new/, { timeout: 8_000 });
      } catch {
        await page.goto('/accounting/customers/new', {
          waitUntil: 'domcontentloaded',
        });
      }
      await page.getByPlaceholder('Name (company or person)').fill(CUSTOMER);
      await page.getByPlaceholder('Email').fill('test-bank-customer-001@example.test');
      await page.getByPlaceholder('Phone').fill('+92 300 0000002');
      await page.getByPlaceholder('Street…').fill('2 Bank Test Street');
      await page.getByPlaceholder('City').fill('Karachi');
      await page.getByPlaceholder('Country').fill('Pakistan');
      await page.getByRole('button', { name: 'Sales & Purchase' }).click();
      await page.getByLabel('Mark as Customer (show in CRM)').check();
      await page.getByRole('main').getByRole('button', { name: 'Accounting' }).click();
      await saveContact(page);
    }
    const customerUrl = page.url();
    const customerId = customerUrl.split('/customers/')[1]?.split('/')[0];
    expect(customerId).toBeTruthy();
    await shot(page, '03-customer');

    await page.goto('/accounting/invoices', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'New', exact: true }).click();
    await page.waitForURL(/\/accounting\/invoices\/[0-9a-f-]{8,}/, {
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 30_000,
    });
    await pickContact(page, CUSTOMER);
    await fillDocumentLine(page, INVOICE_LINE, '100000');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForInvoicePosted(page);
    const invoiceId = page.url().split('/invoices/')[1]?.split('/')[0];
    expect(invoiceId).toBeTruthy();
    const invoiceNumber = (
      (await page.getByRole('heading', { level: 1 }).innerText()) || ''
    ).trim();
    expect(invoiceNumber).toMatch(/INV/i);
    await expect(page.getByTestId('invoice-amount-due')).toContainText(/100,000/);
    await shot(page, '04-invoice-posted');

    await openJournalEntry(page);
    await expect(page.getByText(/100,000/).first()).toBeVisible();
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    await shot(page, '05-invoice-je');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await payInvoiceBank(page, '60000');
    await expect(page.getByTestId('invoice-amount-due')).toContainText(/100,000/, {
      timeout: 30_000,
    });
    await expect(page.getByText(/In Payment/i).first()).toBeVisible();
    await shot(page, '06-bank-pay-unreconciled');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('invoice-payments-button').click();
    await page.waitForURL(/\/accounting\/payments\/[0-9a-f-]{8,}/, {
      timeout: 20_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/60,000/).first()).toBeVisible();
    await openJournalEntry(page);
    await expect(page.getByText(/60,000/).first()).toBeVisible();
    await expect(page.getByText(/Entry is unbalanced/i)).toHaveCount(0);
    await expect(page.getByText(/Outstanding Receipts/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, '07-payment-je');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toContainText(
      /100,000/,
      { timeout: 30_000 }
    );
    await shot(page, '08-ledger-unreconciled');

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toContainText(
      /100,000/,
      { timeout: 30_000 }
    );
    await shot(page, '09-aged-ar-unreconciled');

    await acceptBankSuggestion(page, invoiceNumber);
    await shot(page, '10-reconciled-60');

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('invoice-amount-due')).toContainText(/40,000/, {
      timeout: 30_000,
    });
    await shot(page, '11-invoice-40');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toContainText(
      /40,000/,
      { timeout: 30_000 }
    );

    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await payInvoiceBank(page, '40000');
    await expect(page.getByTestId('invoice-amount-due')).toContainText(/40,000/, {
      timeout: 30_000,
    });
    await shot(page, '12-second-bank-unreconciled');

    await acceptBankSuggestion(page, invoiceNumber);
    await page.goto(`/accounting/invoices/${invoiceId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('invoice-amount-due')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Paid/i).first()).toBeVisible();
    await shot(page, '13-invoice-paid');

    await page.goto(`/accounting/customers/${customerId}/ledger`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tr', { hasText: invoiceNumber })).toHaveCount(0);
    await shot(page, '14-aged-ar-cleared');

    await page.goto('/accounting/reports?statement=partner_ledger', {
      waitUntil: 'domcontentloaded',
    });
    await shot(page, '15-partner-ledger');

    await page.goto('/accounting/reports?statement=trial_balance', {
      waitUntil: 'domcontentloaded',
    });
    await shot(page, '16-trial-balance');

    const orgName = await triggerLabel(page);
    await (await orgSwitcher(page)).click();
    const adminItem = page.getByRole('menuitem', { name: 'Admin' });
    if (await adminItem.isVisible().catch(() => false)) {
      await adminItem.click();
      await page.waitForTimeout(800);
      await page.goto('/accounting/invoices', { waitUntil: 'domcontentloaded' });
      await shot(page, '17-admin-org-isolation');
      await (await orgSwitcher(page)).click();
      const back = page.getByRole('menuitem', { name: orgName });
      if (await back.isVisible().catch(() => false)) await back.click();
    }

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
    const accountingFails = failedRequests.filter((r) =>
      /\/accounting|server action/i.test(r)
    );
    expect(accountingFails, accountingFails.join('\n')).toEqual([]);
  });
});
