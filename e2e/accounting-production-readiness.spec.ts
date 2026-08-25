import { expect, test, type Page } from '@playwright/test';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

test.setTimeout(360_000);

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
      const byText = page.getByText('ABC Technologies', { exact: true }).first();
      if (await byText.isVisible().catch(() => false)) await byText.click();
    }
    await page.waitForTimeout(800);
    if (!/^Admin$/i.test(await triggerLabel(page))) {
      await page.keyboard.press('Escape').catch(() => undefined);
      break;
    }
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (/^Admin$/i.test(await triggerLabel(page))) {
    throw new Error('Organization switch did not persist — still Admin');
  }
}

async function expectPageOk(page: Page, path: string, heading?: RegExp) {
  const t0 = Date.now();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Application error|is not defined/i)).toHaveCount(0);
  if (heading) {
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
      timeout: 30_000,
    });
  }
  return Date.now() - t0;
}

test.describe('STEP 8 production-readiness gate', () => {
  test('navigation, org isolation, reports, and TEST customer save', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (/hydration|React DevTools|HMR|module factory/i.test(text)) return;
        consoleErrors.push(text.slice(0, 240));
      }
    });

    await login(page);
    await ensureOrganization(page);

    const timings: Record<string, number> = {};
    timings.dashboard = await expectPageOk(
      page,
      '/accounting',
      /Accounting Dashboard/
    );

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

    const pages: Array<[string, string, RegExp | undefined]> = [
      ['/accounting/customers', 'customers', undefined],
      ['/accounting/invoices', 'invoices', undefined],
      ['/accounting/credit-notes', 'credit-notes', undefined],
      ['/accounting/payments', 'payments', undefined],
      ['/accounting/vendors', 'vendors', undefined],
      ['/accounting/bills', 'bills', undefined],
      ['/accounting/vendor-refunds', 'refunds', undefined],
      ['/accounting/vendor-payments', 'vendor-payments', undefined],
      ['/accounting/journal-entries', 'journal-entries', undefined],
      ['/accounting/configuration/chart-of-accounts', 'coa', undefined],
      ['/accounting/configuration/journals', 'journals', undefined],
      ['/accounting/configuration/taxes', 'taxes', undefined],
      ['/accounting/configuration/payment-terms', 'payment-terms', undefined],
      ['/accounting/configuration/currencies', 'currencies', undefined],
      ['/accounting/configuration/lock-dates', 'lock-dates', undefined],
      ['/accounting/assets', 'assets', undefined],
      ['/accounting/loans', 'loans', undefined],
      ['/accounting/reconcile', 'reconcile', undefined],
      ['/accounting/review/journal-items', 'review-items', undefined],
      ['/accounting/review/journal-audit', 'review-audit', undefined],
      ['/accounting/review/working-files', 'working-files', undefined],
      ['/accounting/review/audit-trail', 'audit-trail', undefined],
      ['/accounting/review/annual-report', 'annual-report', undefined],
      ['/accounting/review/depreciation-schedule', 'depr-sched', undefined],
      ['/accounting/review/deferred-expenses', 'deferred-exp', undefined],
      ['/accounting/review/invoices-to-be-issued', 'inv-to-issue', undefined],
      ['/accounting/review/invoiced-not-delivered', 'inv-not-del', undefined],
      ['/accounting/reports', 'reports', undefined],
    ];

    for (const [path, key, heading] of pages) {
      timings[key] = await expectPageOk(page, path, heading);
    }

    await page.goto('/accounting/reports?statement=trial_balance', {
      waitUntil: 'domcontentloaded',
    });
    const tb = page.getByTestId('trial-balance-totals');
    await expect(tb).toBeVisible({ timeout: 60_000 });
    expect(await tb.getAttribute('data-balanced')).toBe('true');
    const debit = Number((await tb.getAttribute('data-period-debit')) || 0);
    const credit = Number((await tb.getAttribute('data-period-credit')) || 0);
    expect(Math.abs(debit - credit)).toBeLessThanOrEqual(0.05);

    await page.goto('/accounting/reports?statement=balance_sheet', {
      waitUntil: 'domcontentloaded',
    });
    const bs = page.getByTestId('balance-sheet-report');
    await expect(bs).toBeVisible({ timeout: 60_000 });
    expect(await bs.getAttribute('data-balanced')).toBe('true');

    await page.goto('/accounting/reports?statement=profit_loss', {
      waitUntil: 'domcontentloaded',
    });
    const pl = page.getByTestId('profit-loss-report');
    await expect(pl).toBeVisible({ timeout: 60_000 });
    const income = Number((await pl.getAttribute('data-income')) || 0);
    const expenses = Number((await pl.getAttribute('data-expenses')) || 0);
    const net = Number((await pl.getAttribute('data-net')) || 0);
    expect(Math.abs(round2(income - expenses) - net)).toBeLessThanOrEqual(0.05);

    await page.goto('/accounting/reports?statement=cash_flow', {
      waitUntil: 'domcontentloaded',
    });
    const cf = page.getByTestId('cash-flow-report');
    await expect(cf).toBeVisible({ timeout: 60_000 });
    const opening = Number((await cf.getAttribute('data-opening')) || 0);
    const closing = Number((await cf.getAttribute('data-closing')) || 0);
    const cfNet = Number((await cf.getAttribute('data-net')) || 0);
    expect(Math.abs(round2(closing - opening) - cfNet)).toBeLessThanOrEqual(0.05);

    await page.goto('/accounting/reports?statement=partner_ledger', {
      waitUntil: 'domcontentloaded',
    });
    const partner = page.getByTestId('partner-ledger-report');
    await expect(partner).toBeVisible({ timeout: 60_000 });
    const ar = Number((await partner.getAttribute('data-receivable')) || 0);
    const ap = Number((await partner.getAttribute('data-payable')) || 0);

    await page.goto('/accounting/reports?statement=aged_receivable', {
      waitUntil: 'domcontentloaded',
    });
    const agedAr = page.getByTestId('aging-grand-total');
    await expect(agedAr).toBeVisible({ timeout: 60_000 });
    expect(
      Math.abs(Number((await agedAr.getAttribute('data-amount')) || 0) - ar)
    ).toBeLessThanOrEqual(0.05);

    await page.goto('/accounting/reports?statement=aged_payable', {
      waitUntil: 'domcontentloaded',
    });
    const agedAp = page.getByTestId('aging-grand-total');
    await expect(agedAp).toBeVisible({ timeout: 60_000 });
    expect(
      Math.abs(Number((await agedAp.getAttribute('data-amount')) || 0) - ap)
    ).toBeLessThanOrEqual(0.05);

    await page.goto('/accounting/reports?statement=tax_report', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('tax-report')).toBeVisible({ timeout: 60_000 });

    await page.goto('/accounting/configuration/lock-dates', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('lock-dates-save')).toBeVisible({
      timeout: 30_000,
    });
    // Read-only: do not write ABC lock dates in this gate.

    await page.getByTestId('organization-switcher').click();
    const adminItem = page.getByRole('menuitem', { name: /^Admin$/i });
    if (await adminItem.isVisible().catch(() => false)) {
      await adminItem.click();
      await page.waitForTimeout(600);
      await page.goto('/accounting/reports?statement=trial_balance', {
        waitUntil: 'domcontentloaded',
      });
      await expect(
        page.getByText(/Select an organization/i).first()
      ).toBeVisible({ timeout: 20_000 });
    }

    await ensureOrganization(page);

    await page.goto('/accounting/customers/new', { waitUntil: 'domcontentloaded' });
    const nameInput = page.getByTestId('contact-name-input');
    await expect(nameInput).toBeVisible({ timeout: 20_000 });
    await nameInput.click();
    await nameInput.fill('TEST-ACCOUNTING-CUSTOMER-001');
    await expect(nameInput).toHaveValue('TEST-ACCOUNTING-CUSTOMER-001');
    await page.getByPlaceholder('Email').fill('test-accounting-customer-001@example.test');
    await page.getByPlaceholder('Phone').fill('+92 300 0000101');
    await page.getByRole('button', { name: 'Sales & Purchase' }).click();
    await page.getByLabel('Mark as Customer (show in CRM)').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText(/Contact created|Contact updated/i).first()
    ).toBeVisible({ timeout: 25_000 });

    const slow = Object.entries(timings).filter(([, ms]) => ms > 8000);
    console.log('STEP8 timings', JSON.stringify(timings));
    console.log('STEP8 slow', JSON.stringify(slow));
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
