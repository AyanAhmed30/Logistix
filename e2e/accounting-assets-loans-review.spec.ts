import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'path';

const ASSET_NAME = `TEST-ASSET-STEP5-${Date.now()}`;
const LOAN_NAME = `TEST-LOAN-STEP5-${Date.now()}`;
const ASSET_VALUE = '123456';
const LOAN_PRINCIPAL = '55555';
const POSTING_DATE = '2026-08-01';
const SHOT_DIR = path.join('test-results', 'accounting-assets-loans-review');

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

test.setTimeout(360_000);

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await expect(page.locator('#username')).toBeVisible();
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

function labeledInput(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following::input[1]');
}

function labeledSelect(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following::select[1]');
}

async function fillLabeledInput(page: Page, label: string, value: string) {
  const input = labeledInput(page, label);
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.click();
  await input.fill(value);
  await input.blur();
}

async function replaceTypedInput(input: Locator, value: string) {
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.click();
  await input.evaluate((el, v) => {
    const node = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    setter?.call(node, v);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(input).toHaveValue(value);
  await input.blur();
}

async function dismissDevOverlays(page: Page) {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-next-badge]').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
      (el as HTMLElement).style.pointerEvents = 'none';
    });
  }).catch(() => undefined);
}

async function waitForListReady(page: Page, createLabel: string, emptyHint: RegExp) {
  await dismissDevOverlays(page);
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0, {
    timeout: 40_000,
  });
  await expect(
    page.getByText(emptyHint).or(page.getByRole('cell').first())
  ).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
}

async function openDraftOrCreate(
  page: Page,
  args: {
    listPath: string;
    detailPattern: RegExp;
    preferredName: string;
    draftName: string;
    createLabel: string;
    emptyHint: RegExp;
  }
) {
  await page.goto(args.listPath, { waitUntil: 'domcontentloaded' });
  await waitForListReady(page, args.createLabel, args.emptyHint);

  const preferredDraft = page
    .getByRole('row')
    .filter({ hasText: args.preferredName })
    .filter({ hasText: /draft/i })
    .first();
  if (await preferredDraft.isVisible().catch(() => false)) {
    await preferredDraft.click();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 60_000,
    });
    return;
  }

  const unnamedDraft = page.getByRole('cell', { name: args.draftName, exact: true }).first();
  if (await unnamedDraft.isVisible().catch(() => false)) {
    await unnamedDraft.click();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 60_000,
    });
    return;
  }

  const anyDraft = page.getByRole('row').filter({ hasText: /\bdraft\b/i }).first();
  if (await anyDraft.isVisible().catch(() => false)) {
    await anyDraft.click();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 60_000,
    });
    return;
  }

  const emptyCreate = page.getByRole('button', { name: args.createLabel, exact: true });
  const newBtn = page.getByRole('button', { name: 'New', exact: true });
  await dismissDevOverlays(page);
  if (await page.getByText(args.emptyHint).isVisible().catch(() => false)) {
    await expect(emptyCreate).toBeVisible();
    await emptyCreate.click();
  } else {
    await expect(newBtn).toBeEnabled({ timeout: 20_000 });
    await newBtn.click();
  }
  await page.waitForURL(args.detailPattern, { timeout: 90_000 });
  try {
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({
      timeout: 30_000,
    });
  } catch (err) {
    const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
    throw new Error(
      `Could not open ${args.createLabel}. url=${page.url()} toasts=${JSON.stringify(
        toasts
      )} console=${consoleErrors.slice(-8).join(' | ')} requests=${failedRequests
        .slice(-8)
        .join(' | ')} original=${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function openNewAsset(page: Page) {
  await openDraftOrCreate(page, {
    listPath: '/accounting/assets',
    detailPattern: /\/accounting\/assets\/[0-9a-f-]{8,}/,
    preferredName: ASSET_NAME,
    draftName: 'New Asset',
    createLabel: 'Create Asset',
    emptyHint: /No assets yet/i,
  });
}

async function openNewLoan(page: Page) {
  await openDraftOrCreate(page, {
    listPath: '/accounting/loans',
    detailPattern: /\/accounting\/loans\/[0-9a-f-]{8,}/,
    preferredName: LOAN_NAME,
    draftName: 'New Loan',
    createLabel: 'Create Loan',
    emptyHint: /No loans yet/i,
  });
}

async function waitForSuccessOrError(
  page: Page,
  success: Locator,
  timeout = 90_000
) {
  const errorToast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: /not confirmed|must be|Failed|required|not created/i });
  const result = await Promise.race([
    success.waitFor({ state: 'visible', timeout }).then(() => 'ok' as const),
    errorToast.waitFor({ state: 'visible', timeout }).then(() => 'error' as const),
  ]);
  if (result === 'error') {
    throw new Error(((await errorToast.innerText()) || 'Posting failed').trim());
  }
  await expect(success).toBeVisible();
}

async function pickAccount(page: Page, label: string, prefer: RegExp, used: Set<string>) {
  const select = labeledSelect(page, label);
  if ((await select.count()) === 0) return;
  const options = await select.locator('option').all();
  let chosen = '';
  for (const opt of options) {
    const val = await opt.getAttribute('value');
    const text = ((await opt.textContent()) || '').trim();
    if (!val || used.has(val)) continue;
    if (prefer.test(text)) {
      chosen = val;
      break;
    }
  }
  if (!chosen) {
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && !used.has(val)) {
        chosen = val;
        break;
      }
    }
  }
  if (chosen) {
    used.add(chosen);
    await select.selectOption(chosen);
  }
}

test('STEP 5 — assets, loans, journals, review, P&L and balance sheet are one posting flow', async ({
  page,
}) => {
  consoleErrors.length = 0;
  failedRequests.length = 0;
  attachDiagnostics(page);

  await login(page);
  await ensureOrganization(page);

  await openNewAsset(page);

  const assetName = page.getByPlaceholder(/e\.g\. Laptop/i);
  await expect(assetName).toBeVisible();
  await assetName.click();
  await assetName.fill(ASSET_NAME);
  await assetName.blur();

  await replaceTypedInput(labeledInput(page, 'Asset Value'), ASSET_VALUE);
  await replaceTypedInput(labeledInput(page, 'Number of Depreciations'), '12');
  await expect(labeledInput(page, 'Asset Value')).toHaveValue(ASSET_VALUE);

  await page.getByRole('button', { name: 'Compute Depreciation' }).click();
  await expect(page.getByText('Depreciation schedule computed')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: '12 Depreciation Board' })).toBeVisible();

  const assetAccounts = new Set<string>();
  await pickAccount(page, 'Fixed Asset Account', /1500|Fixed Assets/, assetAccounts);
  await pickAccount(page, 'Depreciation Account', /1600|Accumulated Depreciation/, assetAccounts);
  await pickAccount(page, 'Expense Account', /5400|Depreciation Expense/, assetAccounts);
  await pickAccount(page, 'Journal', /GEN|Miscellaneous|General/i, new Set());

  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Confirm' }).click();
  await waitForSuccessOrError(
    page,
    page.getByRole('button', { name: 'Post Due Depreciation' })
  );
  await expect(page.getByRole('button', { name: '1 Posted Entries' })).toBeVisible({
    timeout: 20_000,
  });

  const assetNumber = ((await page.locator('p.font-mono').first().innerText()) || '').trim();
  expect(assetNumber.length).toBeGreaterThan(2);
  await shot(page, '01-asset-confirmed');

  await page.getByRole('button', { name: '12 Depreciation Board' }).click();
  await expect(page.getByText(/10,288/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Post', exact: true }).first().click();
  await waitForSuccessOrError(page, page.getByText('Depreciation posted', { exact: true }));
  await expect(page.getByText('Posted').first()).toBeVisible({ timeout: 20_000 });
  await shot(page, '02-depreciation-posted');

  await openNewLoan(page);

  await page.getByPlaceholder(/Bank Term Loan/i).click();
  await page.getByPlaceholder(/Bank Term Loan/i).fill(LOAN_NAME);
  await page.getByPlaceholder(/Bank Term Loan/i).blur();
  await fillLabeledInput(page, 'Principal Amount', LOAN_PRINCIPAL);
  await fillLabeledInput(page, 'Interest Rate (%)', '12');
  await fillLabeledInput(page, 'Start Date', POSTING_DATE);
  await fillLabeledInput(page, 'First Installment', POSTING_DATE);
  await fillLabeledInput(page, 'Total Installments', '12');

  const loanAccounts = new Set<string>();
  await pickAccount(page, 'Loan Liability Account', /2100|Accounts Payable|liab/i, loanAccounts);
  await pickAccount(page, 'Interest Expense Account', /5100|5400|General Expense|Depreciation Expense/i, loanAccounts);
  await pickAccount(page, 'Bank / Cash Account', /1100|1200|Cash|Bank/i, loanAccounts);
  await pickAccount(page, 'Journal', /GEN|Miscellaneous|General/i, new Set());

  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Confirm' }).click();
  await waitForSuccessOrError(
    page,
    page.getByRole('button', { name: '1 Journal Entries' })
  );
  const loanNumber = ((await page.locator('p.font-mono').first().innerText()) || '').trim();
  expect(loanNumber.length).toBeGreaterThan(2);
  await shot(page, '03-loan-confirmed');

  await page.getByRole('button', { name: 'Installments', exact: true }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).first().click();
  await waitForSuccessOrError(
    page,
    page.getByText('Installment paid', { exact: true })
  );
  await expect(page.getByText('paid', { exact: false }).first()).toBeVisible();
  await shot(page, '04-loan-paid');

  await page.goto('/accounting/review', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({
    timeout: 20_000,
  });
  for (const title of [
    'Assets',
    'Loans',
    'Journal Entries',
    'Journal Items',
    'Audit Trail',
    'Depreciation Schedule',
    'Loans Analysis',
    'Invoiced Not Delivered',
    'Deferred Revenues',
    'Deferred Expenses',
  ]) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }

  await page.goto('/accounting/review/depreciation-schedule', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Depreciation Schedule' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByPlaceholder('Search…').fill(ASSET_NAME);
  await expect(page.getByText(ASSET_NAME).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/10,288/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'JE' }).first()).toBeVisible();
  await shot(page, '05-review-depreciation');

  await page.goto('/accounting/review/loans-analysis', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Loans Analysis' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByPlaceholder('Search…').fill(LOAN_NAME);
  await expect(page.getByText(LOAN_NAME).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'JE' }).first()).toBeVisible();
  await shot(page, '06-review-loans-analysis');

  await page.goto('/accounting/review/journal-items', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Journal Items' })).toBeVisible({
    timeout: 20_000,
  });
  const itemSearch = page.getByPlaceholder('Search…');
  await itemSearch.fill(assetNumber);
  await expect(page.getByText(assetNumber).first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/123,456/).first()).toBeVisible();
  await itemSearch.fill(loanNumber);
  await expect(page.getByText(loanNumber).first()).toBeVisible({ timeout: 25_000 });
  await shot(page, '07-review-journal-items');

  await page.goto('/accounting/review/audit-trail', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(/asset confirmed|depreciation posted|loan confirmed|installment paid/i).first()
  ).toBeVisible({ timeout: 25_000 });
  await shot(page, '08-review-audit-trail');

  await page.goto('/accounting/reports?statement=profit_loss', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText('Operating Expenses')).toBeVisible({ timeout: 45_000 });
  const opexExpand = page
    .locator('div')
    .filter({ has: page.getByText('Operating Expenses', { exact: true }) })
    .getByLabel('Expand')
    .first();
  if (await opexExpand.isVisible().catch(() => false)) {
    await opexExpand.click();
  }
  const plHasDep = await page.getByText(/10,288/).first().isVisible().catch(() => false);
  if (!plHasDep) {
    const opexRow = page.locator('div').filter({ hasText: /^Operating Expenses/ }).first();
    await expect(opexRow).not.toContainText('0.00');
  }
  await shot(page, '09-profit-loss');

  await page.goto('/accounting/reports?statement=balance_sheet', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText(/ASSETS/i).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/LIABILIT/i).first()).toBeVisible();
  const bsBody = await page.locator('body').innerText();
  expect(bsBody).toMatch(/123,456|113,168|55,555|10,288/);
  await shot(page, '10-balance-sheet');

  expect(failedRequests, failedRequests.join('\n')).toEqual([]);
});
