import { expect, test, type Page } from '@playwright/test';

test.setTimeout(240_000);

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
      if (await byText.isVisible().catch(() => false)) {
        await byText.click();
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

async function openStatement(page: Page, statement: string) {
  await page.goto(`/accounting/reports?statement=${statement}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/is not defined|Application error/i)
  ).toHaveCount(0);
}

function num(el: { getAttribute: (n: string) => Promise<string | null> }, attr: string) {
  return el.getAttribute(attr).then((v) => Number(v || 0));
}

test.describe('STEP 7 reporting reconciliation', () => {
  test('posted reports stay internally consistent on ABC Technologies', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (/hydration|React DevTools|HMR|module factory/i.test(text)) return;
        consoleErrors.push(text.slice(0, 300));
      }
    });

    await login(page);
    await ensureOrganization(page);

    await openStatement(page, 'trial_balance');
    const tb = page.getByTestId('trial-balance-totals');
    await expect(tb).toBeVisible({ timeout: 60_000 });
    const tbDebit = await num(tb, 'data-period-debit');
    const tbCredit = await num(tb, 'data-period-credit');
    const tbBalanced = await tb.getAttribute('data-balanced');
    console.log(`TB debit=${tbDebit} credit=${tbCredit} balanced=${tbBalanced}`);
    expect(
      tbBalanced,
      `Trial Balance period imbalance ${tbDebit} vs ${tbCredit}`
    ).toBe('true');
    expect(Math.abs(tbDebit - tbCredit)).toBeLessThanOrEqual(0.05);
    expect(tbDebit).toBeGreaterThan(0);

    await openStatement(page, 'general_ledger');
    const gl = page.getByTestId('general-ledger-totals');
    await expect(gl).toBeVisible({ timeout: 60_000 });
    const glDebit = await num(gl, 'data-debit');
    const glCredit = await num(gl, 'data-credit');
    expect(await gl.getAttribute('data-balanced')).toBe('true');
    expect(Math.abs(glDebit - tbDebit)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(glCredit - tbCredit)).toBeLessThanOrEqual(0.05);

    await openStatement(page, 'balance_sheet');
    const bs = page.getByTestId('balance-sheet-report');
    await expect(bs).toBeVisible({ timeout: 60_000 });
    expect(await bs.getAttribute('data-balanced')).toBe('true');
    const assets = await num(bs, 'data-assets');
    const liabEq = await num(bs, 'data-liabilities-equity');
    console.log(`BS assets=${assets} L+E=${liabEq}`);
    expect(Math.abs(assets - liabEq)).toBeLessThanOrEqual(0.05);

    await openStatement(page, 'profit_loss');
    const pl = page.getByTestId('profit-loss-report');
    await expect(pl).toBeVisible({ timeout: 60_000 });
    const net = await num(pl, 'data-net');
    const income = await num(pl, 'data-income');
    const expenses = await num(pl, 'data-expenses');
    console.log(`P&L net=${net} income=${income} expenses=${expenses}`);
    expect(Number.isFinite(net)).toBe(true);
    expect(Math.abs(net - (income - expenses))).toBeLessThanOrEqual(0.05);

    await openStatement(page, 'cash_flow');
    const cf = page.getByTestId('cash-flow-report');
    await expect(cf).toBeVisible({ timeout: 60_000 });
    const opening = await num(cf, 'data-opening');
    const closing = await num(cf, 'data-closing');
    const cfNet = await num(cf, 'data-net');
    console.log(`CF open=${opening} close=${closing} net=${cfNet}`);
    expect(Math.abs(cfNet - (closing - opening))).toBeLessThanOrEqual(0.05);

    await openStatement(page, 'aged_receivable');
    const ar = page.getByTestId('aging-grand-total');
    await expect(ar).toBeVisible({ timeout: 60_000 });
    const arTotal = await num(ar, 'data-amount');

    await openStatement(page, 'aged_payable');
    const ap = page.getByTestId('aging-grand-total');
    await expect(ap).toBeVisible({ timeout: 60_000 });
    const apTotal = await num(ap, 'data-amount');

    await openStatement(page, 'partner_ledger');
    const partner = page.getByTestId('partner-ledger-report');
    await expect(partner).toBeVisible({ timeout: 60_000 });
    const rec = await num(partner, 'data-receivable');
    const pay = await num(partner, 'data-payable');
    console.log(
      `AR aging=${arTotal} partner rec=${rec}; AP aging=${apTotal} partner pay=${pay}`
    );
    expect(Math.abs(rec - arTotal)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(pay - apTotal)).toBeLessThanOrEqual(0.05);

    await openStatement(page, 'tax_report');
    const tax = page.getByTestId('tax-report');
    await expect(tax).toBeVisible({ timeout: 60_000 });
    const taxTotal = await num(tax, 'data-total-tax');
    const salesTax = await num(tax, 'data-sales-tax');
    const purchaseTax = await num(tax, 'data-purchase-tax');
    console.log(
      `Tax total=${taxTotal} sales=${salesTax} purchases=${purchaseTax}`
    );
    expect(Number.isFinite(taxTotal)).toBe(true);
    expect(Math.abs(taxTotal - -income)).toBeGreaterThan(0.05);

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
