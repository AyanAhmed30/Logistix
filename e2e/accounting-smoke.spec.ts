import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/accounting',
  '/accounting/customers',
  '/accounting/customers/new',
  '/accounting/invoices',
  '/accounting/invoices/new',
  '/accounting/credit-notes',
  '/accounting/credit-notes/new',
  '/accounting/payments',
  '/accounting/customers/products',
  '/accounting/vendors',
  '/accounting/vendors/new',
  '/accounting/bills',
  '/accounting/bills/new',
  '/accounting/vendor-refunds',
  '/accounting/vendor-payments',
  '/accounting/vendors/products',
  '/accounting/journal-entries',
  '/accounting/reconcile',
  '/accounting/assets',
  '/accounting/loans',
  '/accounting/tax-returns',
  '/accounting/review',
  '/accounting/review/journal-items',
  '/accounting/review/journal-audit',
  '/accounting/review/audit-trail',
  '/accounting/review/loans-analysis',
  '/accounting/review/invoices-to-be-issued',
  '/accounting/review/invoiced-not-delivered',
  '/accounting/review/working-files',
  '/accounting/review/deferred-revenues',
  '/accounting/review/deferred-expenses',
  '/accounting/review/annual-report',
  '/accounting/review/depreciation-schedule',
  '/accounting/reports?statement=balance_sheet',
  '/accounting/reports?statement=profit_loss',
  '/accounting/reports?statement=cash_flow',
  '/accounting/reports?statement=trial_balance',
  '/accounting/reports?statement=general_ledger',
  '/accounting/reports?statement=partner_ledger',
  '/accounting/reports?statement=aged_receivable',
  '/accounting/reports?statement=aged_payable',
  '/accounting/reports?statement=tax_report',
  '/accounting/configuration/chart-of-accounts',
  '/accounting/configuration/journals',
  '/accounting/configuration/taxes',
  '/accounting/configuration/payment-terms',
  '/accounting/configuration/currencies',
  '/accounting/configuration/lock-dates',
];

async function loginAsSuperAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 45_000,
  });
  await page.goto('/accounting', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Accounting Dashboard' })
  ).toBeVisible({ timeout: 45_000 });
}

async function pageCrashed(page: Page) {
  const text = await page.locator('body').innerText();
  return (
    /Application error|is not defined|Internal Server Error|Something went wrong/i.test(
      text
    ) && !/Accounting Dashboard/i.test(text)
  );
}

test.describe('Accounting module smoke', () => {
  test('login and every Accounting route renders without a crash', async ({
    page,
  }) => {
    test.setTimeout(8 * 60 * 1000);
    await loginAsSuperAdmin(page);

    const failures: string[] = [];
    for (const route of ROUTES) {
      const response = await page.goto(route, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      const status = response?.status() ?? 0;
      await page.locator('main, body').first().waitFor({ timeout: 30_000 });
      const crashed = await pageCrashed(page);
      if (status >= 500 || crashed) {
        const body = (await page.locator('body').innerText()).slice(0, 240);
        failures.push(
          `${route} status=${status} crashed=${crashed} body=${body.replace(/\s+/g, ' ')}`
        );
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('Accounting dashboard KPIs and top nav after login', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expect(page.getByRole('heading', { name: 'Accounting Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Invoices/ }).first()).toBeVisible();
    await expect(page.getByText('Receivables').first()).toBeVisible();
    await expect(page.getByText('Vendor Bills').first()).toBeVisible();

    const topNav = page.getByRole('navigation').first();
    await expect(topNav.getByRole('link', { name: 'Refunds' })).toHaveCount(0);
    await expect(topNav.getByRole('link', { name: 'Automation' })).toHaveCount(0);
  });
});
