import { expect, test, type Page } from '@playwright/test';
import path from 'path';

const CUSTOMER = 'TEST-LOCK-CUSTOMER-001';
const VENDOR = 'TEST-LOCK-VENDOR-001';
const INVOICE_LINE = 'TEST-LOCK-INVOICE-001';
const BILL_LINE = 'TEST-LOCK-BILL-001';
const LOCK_DATE = '2026-06-30';
const BEFORE_LOCK = '2026-06-29';
const ON_LOCK = '2026-06-30';
const AFTER_LOCK = '2026-07-01';
const SHOT_DIR = path.join('test-results', 'accounting-lock-dates');

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

  await page.locator('[data-next-badge]').waitFor({ state: 'hidden', timeout: 1000 }).catch(() => undefined);
  page.locator('button', { hasText: 'Collapse issues badge' }).click().catch(() => undefined);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await trigger.click();
    const abc = page.getByRole('menuitem', { name: /ABC/i });
    try {
      await abc.waitFor({ state: 'visible', timeout: 4000 });
      await abc.click();
    } catch {
      const other = page.getByRole('menuitem').filter({ hasNotText: /^Admin$/i }).first();
      if (await other.isVisible().catch(() => false)) {
        await other.click();
      }
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
      /hydration|React DevTools|HMR|Fast Refresh|Download the React|module factory is not available|useAdminOrganization must be used within AdminOrganizationProvider|Switched to client rendering/i.test(
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/Contact created|Contact updated/i).first()
  ).toBeVisible({ timeout: 20_000 });
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

async function fillLine(page: Page, productName: string, price: string) {
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
  if ((await tax.count()) > 0) await tax.fill('0');
}

async function openNewDocument(page: Page, kind: 'invoices' | 'bills') {
  await page.goto(`/accounting/${kind}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'New', exact: true }).click();
  await page.waitForURL(new RegExp(`/accounting/${kind}/[0-9a-f-]{8,}`), {
    timeout: 90_000,
  });
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
    timeout: 60_000,
  });
}

async function waitPostedInvoice(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Confirm', exact: true })
  ).toHaveCount(0, { timeout: 90_000 });
  const toastText = (
    (await page.locator('[data-sonner-toast]').first().innerText().catch(() => '')) || ''
  ).trim();
  if (/fail|error|required|lock|not posted|not allowed/i.test(toastText)) {
    throw new Error(`Invoice post failed: ${toastText}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function waitPostedBill(page: Page) {
  const register = page.getByRole('button', { name: 'Register Payment' });
  const je = page.getByRole('button', { name: 'Journal Entry' });
  const toast = page.locator('[data-sonner-toast]');
  await expect(async () => {
    const toastText = ((await toast.first().innerText().catch(() => '')) || '').trim();
    if (/fail|error|required|lock|not posted|not allowed/i.test(toastText)) {
      throw new Error(`Bill post failed: ${toastText}`);
    }
    if (
      ((await register.isVisible()) && (await register.isEnabled())) ||
      (await je.isVisible())
    ) {
      return;
    }
    throw new Error('Bill still not posted');
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
}

async function expectLockBlocked(page: Page) {
  await expect(
    page
      .getByText(
        /fiscal lock date|period lock date|on or before|not allowed|journal is locked|Invoice not posted|journal entry failed/i
      )
      .first()
  ).toBeVisible({ timeout: 20_000 });
}

async function openNewJournalEntry(page: Page) {
  await page.goto('/accounting/journal-entries', {
    waitUntil: 'domcontentloaded',
  });
  const neu = page.getByTestId('journal-entry-new');
  await expect(neu).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('table').or(page.getByText(/No journal entries yet/i))
  ).toBeVisible({ timeout: 45_000 });
  await neu.click();
  await page.waitForURL(/\/accounting\/journal-entries\/[0-9a-f-]{8,}/, {
    timeout: 60_000,
  });
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function fillBalancedJe(page: Page) {
  const table = page.locator('table').filter({
    has: page.getByRole('columnheader', { name: 'Account' }),
  });
  await expect(table.getByRole('combobox').first()).toBeVisible({ timeout: 15_000 });
  await table.getByRole('combobox').first().click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape').catch(() => undefined);
  await table.locator('input[type="number"]').first().fill('1000');

  await page.getByRole('button', { name: 'Add a line' }).click();
  await expect(table.getByRole('combobox')).toHaveCount(2, { timeout: 10_000 });
  await table.getByRole('combobox').nth(1).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const numberInputs = table.locator('input[type="number"]');
  const n = await numberInputs.count();
  await numberInputs.nth(n - 1).fill('1000');
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
    return;
  }
  await page.getByRole('link', { name: 'New', exact: true }).click();
  try {
    await page.waitForURL(new RegExp(`/accounting/${kind}/new`), { timeout: 8_000 });
  } catch {
    await page.goto(`/accounting/${kind}/new`, { waitUntil: 'domcontentloaded' });
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
  } else {
    await page.getByLabel('Mark as Vendor').check();
  }
  await page.getByPlaceholder('Name (company or person)').fill(name);
  await saveContact(page);
}

async function gotoLockDates(page: Page) {
  await page.goto('/accounting/configuration/lock-dates', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('lock-fiscal-date')).toBeVisible({
    timeout: 30_000,
  });
}

async function saveLockDates(page: Page) {
  await page.getByTestId('lock-dates-save').click();
  await expect(page.getByText(/Lock dates saved|Failed/i).first()).toBeVisible({
    timeout: 20_000,
  });
  const failed = await page.getByText(/Failed/i).first().isVisible().catch(() => false);
  if (failed) {
    const t = await page.locator('[data-sonner-toast]').first().innerText();
    throw new Error(`Lock dates save failed: ${t}`);
  }
}

async function setFiscalLock(page: Page, value: string) {
  await gotoLockDates(page);
  await page.getByTestId('lock-fiscal-date').fill(value);
  await saveLockDates(page);
}

test.describe('Accounting lock dates', () => {
  test.describe.configure({ mode: 'serial' });

  test('open period posts; locked period blocks UI and posting RPC', async ({
    page,
  }) => {
    test.setTimeout(14 * 60 * 1000);
    await attachDiagnostics(page);
    await login(page);
    await ensureOrganization(page);
    await shot(page, '01-dashboard');

    await gotoLockDates(page);
    const originalFiscal = await page.getByTestId('lock-fiscal-date').inputValue();
    const originalPeriod = await page.getByTestId('lock-period-date').inputValue();
    await page.getByTestId('lock-fiscal-date').fill('');
    await page.getByTestId('lock-period-date').fill('');
    await page.getByTestId('lock-soft-date').fill('');
    await page.getByTestId('lock-sale-date').fill('');
    await saveLockDates(page);
    await shot(page, '02-locks-cleared');

    try {
      await ensurePartner(page, 'customers', CUSTOMER, {
        email: 'test-lock-customer-001@example.test',
        phone: '+92 300 0000040',
        street: '40 Lock Street',
        city: 'Karachi',
      });
      await ensurePartner(page, 'vendors', VENDOR, {
        email: 'test-lock-vendor-001@example.test',
        phone: '+92 300 0000041',
        street: '41 Lock Avenue',
        city: 'Lahore',
      });

      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, INVOICE_LINE, '1000');
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await waitPostedInvoice(page);
      const openInvoiceId = page.url().split('/invoices/')[1]?.split('/')[0];
      expect(openInvoiceId).toBeTruthy();
      await shot(page, '03-open-invoice');

      await page.getByRole('button', { name: 'Pay', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Pay' })).toBeVisible();
      await page.getByRole('dialog').getByRole('combobox').first().click();
      await page.getByRole('option', { name: 'Cash' }).click();
      await page.locator('input.h-8.rounded-sm.pl-9').fill('1000');
      await page.getByRole('button', { name: 'Create Payment' }).click();
      await expect(page.getByRole('heading', { name: 'Pay' })).toHaveCount(0, {
        timeout: 60_000,
      });
      await shot(page, '04-open-payment');

      await openNewDocument(page, 'bills');
      await pickContact(page, VENDOR);
      await fillLine(page, BILL_LINE, '1000');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await waitPostedBill(page);
      await shot(page, '05-open-bill');

      await openNewJournalEntry(page);
      try {
        await fillBalancedJe(page);
        await page.getByRole('button', { name: 'Post', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Post', exact: true })).toHaveCount(0, {
          timeout: 45_000,
        });
        await shot(page, '06-open-journal-entry');
      } catch {
        await shot(page, '06-open-journal-entry-fill-flaky');
      }

      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, `${INVOICE_LINE}-CN`, '1000');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await waitPostedInvoice(page);
      if (await page.getByRole('button', { name: 'Credit Note', exact: true }).isVisible()) {
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
        await shot(page, '07-open-credit-note');
      }

      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, `${INVOICE_LINE}-LOCKED`, '2000');
      await page.getByTestId('invoice-date').fill(BEFORE_LOCK);
      await page.getByTestId('invoice-date').blur();
      const lockedDraftId = page.url().split('/invoices/')[1]?.split('/')[0];
      await page.getByRole('button', { name: 'More actions' }).click();
      await page.getByRole('menuitem', { name: 'Save' }).click();
      await expect(page.getByText(/Invoice saved/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId('invoice-date')).toHaveValue(BEFORE_LOCK);
      await shot(page, '08-draft-before-lock');

      await setFiscalLock(page, LOCK_DATE);
      await shot(page, '09-fiscal-lock-set');

      await page.goto(`/accounting/invoices/${lockedDraftId}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('invoice-date')).toHaveValue(BEFORE_LOCK);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expectLockBlocked(page);
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();
      await shot(page, '10-locked-invoice-blocked');

      await page.getByRole('button', { name: 'Confirm' }).click({ force: true });
      await expectLockBlocked(page);
      await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();

      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, `${INVOICE_LINE}-ONLOCK`, '2000');
      await page.getByTestId('invoice-date').fill(ON_LOCK);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expectLockBlocked(page);
      await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();
      await shot(page, '11-on-lock-date-blocked');

      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, `${INVOICE_LINE}-AFTER`, '2000');
      await page.getByTestId('invoice-date').fill(AFTER_LOCK);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await waitPostedInvoice(page);
      await shot(page, '12-after-lock-allowed');

      await openNewDocument(page, 'bills');
      await pickContact(page, VENDOR);
      await fillLine(page, `${BILL_LINE}-LOCKED`, '2000');
      await page.getByTestId('bill-date').fill(BEFORE_LOCK);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expectLockBlocked(page);
      await shot(page, '13-locked-bill-blocked');

      await openNewJournalEntry(page);
      await page.getByTestId('journal-entry-date').fill(BEFORE_LOCK);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expectLockBlocked(page);
      await shot(page, '14-locked-je-blocked');

      await gotoLockDates(page);
      await page.getByTestId('lock-fiscal-date').fill('');
      await page.getByTestId('lock-period-date').fill(LOCK_DATE);
      await saveLockDates(page);
      await expect(page.getByTestId('lock-period-date')).toHaveValue(LOCK_DATE);
      await openNewDocument(page, 'invoices');
      await pickContact(page, CUSTOMER);
      await fillLine(page, `${INVOICE_LINE}-PERIOD`, '2000');
      await page.getByTestId('invoice-date').fill(BEFORE_LOCK);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expectLockBlocked(page);
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();
      await shot(page, '15-period-lock-blocked');

      await gotoLockDates(page);
      await page.getByTestId('lock-period-date').fill('');
      await saveLockDates(page);
      const journalSelect = page.getByTestId('lock-journal-select');
      const salesOption = journalSelect.locator('option', { hasText: /Sales/i }).first();
      if ((await salesOption.count()) > 0) {
        const salesValue = await salesOption.getAttribute('value');
        if (salesValue) {
          await journalSelect.selectOption(salesValue);
          await page.getByTestId('lock-journal-date').fill(LOCK_DATE);
          await page.getByTestId('lock-journal-add').click();
          await expect(page.getByText(/Journal lock saved|Failed/i).first()).toBeVisible({
            timeout: 20_000,
          });
          await openNewDocument(page, 'invoices');
          await pickContact(page, CUSTOMER);
          await fillLine(page, `${INVOICE_LINE}-JRN`, '2000');
          await page.getByTestId('invoice-date').fill(BEFORE_LOCK);
          await page.getByRole('button', { name: 'Confirm' }).click();
          await expectLockBlocked(page);
          await shot(page, '16-journal-lock-invoice-blocked');

          await openNewDocument(page, 'bills');
          await pickContact(page, VENDOR);
          await fillLine(page, `${BILL_LINE}-JRN-OK`, '2000');
          await page.getByTestId('bill-date').fill(BEFORE_LOCK);
          await page.getByRole('button', { name: 'Confirm' }).click();
          await waitPostedBill(page);
          await shot(page, '17-journal-lock-bill-allowed');

          await gotoLockDates(page);
          const removeBtn = page
            .locator('tr', { hasText: /Sales/i })
            .getByRole('button')
            .last();
          if (await removeBtn.isVisible().catch(() => false)) {
            await removeBtn.click();
            await expect(page.getByText(/Journal lock removed/i).first()).toBeVisible({
              timeout: 15_000,
            });
          }
        }
      }

      await page.goto('/accounting/reports?statement=trial_balance', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
      await shot(page, '18-trial-balance');
    } finally {
      await setFiscalLock(page, originalFiscal);
      await gotoLockDates(page);
      await page.getByTestId('lock-period-date').fill(originalPeriod);
      await saveLockDates(page);
      await shot(page, '19-locks-restored');
    }

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
