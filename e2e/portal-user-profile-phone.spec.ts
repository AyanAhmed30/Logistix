import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 45_000,
  });
}

async function openSettings(page: Page) {
  await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: /users, profiles, and organization setup/i }).click();
}

async function createSalesUser(
  page: Page,
  fullName: string,
  username: string,
  password: string
) {
  await openSettings(page);
  await expect(page.getByRole('heading', { name: /users/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^new$/i }).click();
  await page.locator('#full_name').fill(fullName);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);

  const companyBox = page.locator('label').filter({ has: page.getByRole('checkbox') }).first();
  if (!(await companyBox.isVisible().catch(() => false))) {
    test.skip(true, 'No companies available to create a portal user');
  }
  await companyBox.click();
  const defaultCompany = page.getByRole('combobox').filter({ hasText: /select default company/i });
  if (await defaultCompany.isVisible()) {
    await defaultCompany.click();
    await page.getByRole('option').first().click();
  }
  await page.getByRole('combobox').filter({ hasText: /^No$/ }).click();
  await page.getByRole('option', { name: 'User: All Documents' }).click();
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByPlaceholder('Search users...')).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Search users...').fill(username);
  await expect(page.getByRole('row').filter({ hasText: username })).toBeVisible({
    timeout: 20_000,
  });
}

async function deletePortalUser(page: Page, username: string) {
  await openSettings(page);
  const search = page.getByPlaceholder('Search users...');
  if (!(await search.isVisible({ timeout: 15_000 }).catch(() => false))) return;
  await search.fill(username);
  const row = page.getByRole('row').filter({ hasText: username });
  if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) return;
  await row.getByRole('button').click();
  await page.getByRole('dialog').getByRole('button', { name: /^delete$/i }).click();
  await expect(page.getByText('User deleted')).toBeVisible({ timeout: 20_000 });
}

test.describe('Portal user profile phone', () => {
  test('sales user can save, persist, edit, and cancel own phone number', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now().toString().slice(-8);
    const username = `phoneqa${stamp}`;
    const otherUsername = `phoneqb${stamp}`;
    const password = 'PhoneQa123';
    const fullName = `Phone QA ${stamp}`;
    const otherName = `Phone QB ${stamp}`;
    const firstPhone = `+92300${stamp}`;
    const secondPhone = `+92301${stamp}`;

    await login(page, 'admin', 'admin123');
    try {
      await createSalesUser(page, fullName, username, password);

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    await login(page, username, password);
    await openSettings(page);
    await expect(page.getByText('My Profile', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByPlaceholder('Search users...')).toHaveCount(0);
    await expect(page.getByText('Enter your phone number')).toBeVisible();

    await page.locator('#profile-phone').fill('   ');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Enter your phone number.')).toBeVisible();

    await page.locator('#profile-phone').fill(firstPhone);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Phone number saved')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(firstPhone)).toBeVisible();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();

    await page.reload();
    await openSettings(page);
    await expect(page.getByText(firstPhone)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /back to modules/i }).click();
    const salesCard = page.getByRole('button', {
      name: /quotations, orders, and customers/i,
    });
    await expect(salesCard).toBeVisible({ timeout: 20_000 });
    await salesCard.click();
    await expect(page).toHaveURL(/\/sales\//, { timeout: 20_000 });
    await page.goto('/admin/dashboard');
    await page.getByRole('button', { name: /users, profiles, and organization setup/i }).click();
    await expect(page.getByText(firstPhone)).toBeVisible({ timeout: 20_000 });

    const orgSwitch = page.getByRole('button', { name: /ABC Technologies|switch|company/i }).first();
    if (await orgSwitch.isVisible().catch(() => false)) {
      await orgSwitch.click();
      const otherOrg = page.getByRole('menuitem').or(page.getByRole('option')).nth(1);
      if (await otherOrg.isVisible().catch(() => false)) {
        await otherOrg.click();
        await expect(page.getByText(firstPhone)).toBeVisible({ timeout: 20_000 });
      } else {
        await page.keyboard.press('Escape');
      }
    }

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.locator('#profile-phone').fill(secondPhone);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(secondPhone)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.locator('#profile-phone').fill('+921111111111');
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByText(secondPhone)).toBeVisible();
    await expect(page.locator('#profile-phone')).toHaveCount(0);

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await login(page, username, password);
    await openSettings(page);
    await expect(page.getByText(secondPhone)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await login(page, 'admin', 'admin123');
    await createSalesUser(page, otherName, otherUsername, password);
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    await login(page, otherUsername, password);
    await openSettings(page);
    await expect(page.getByText('Enter your phone number')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(secondPhone)).toHaveCount(0);
    await page.locator('#profile-phone').fill(`+92302${stamp}`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Phone number saved')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await login(page, username, password);
    await openSettings(page);
    await expect(page.getByText(secondPhone)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`+92302${stamp}`)).toHaveCount(0);

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await login(page, 'admin', 'admin123');
    await openSettings(page);
    await page.getByPlaceholder('Search users...').fill(username);
    await page.getByRole('row').filter({ hasText: username }).locator('td').first().click();
    await expect(page.locator('#phone')).toHaveValue(secondPhone, { timeout: 20_000 });
    await page.getByRole('button', { name: /^users$/i }).click();
    } finally {
      await page.goto('/login').catch(() => {});
      await login(page, 'admin', 'admin123').catch(() => {});
      await deletePortalUser(page, username).catch(() => {});
      await deletePortalUser(page, otherUsername).catch(() => {});
    }
  });
});
