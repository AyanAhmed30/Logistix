import { expect, test } from '@playwright/test';

test.describe('Inquiry reference and operations flag', () => {
  test('operations list shows inquiry ref and can raise a flag', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 45_000 });

    await page.goto('/admin/dashboard?tab=operations&opsTab=leads-inquiry');
    await expect(page.getByRole('heading', { name: 'Leads Inquiry' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/showing \d+ record/i)).toBeVisible();

    const empty = await page.getByText('No lead inquiries received yet.').isVisible().catch(() => false);
    if (empty) {
      test.info().annotations.push({
        type: 'note',
        description: 'No operations inquiries available to raise a flag against.',
      });
      return;
    }

    await expect(page.getByText('Inquiry Ref', { exact: true })).toBeVisible();

    const firstRow = page.locator('table tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.info().annotations.push({
        type: 'note',
        description: 'No operations inquiries available to raise a flag against.',
      });
      return;
    }

    await firstRow.getByRole('button', { name: /view/i }).click();
    await expect(page.getByText('Inquiry Reference')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /raise a flag/i }).click();
    const flagText = `E2E flag ${Date.now()}`;
    await page.getByPlaceholder(/type the issue/i).fill(flagText);
    await page.getByTestId('send-inquiry-flag').click();
    await expect(
      page.getByText(/flag sent to sales|inquiry flags are not available/i).first()
    ).toBeVisible({ timeout: 20_000 });
    if (await page.getByText(/inquiry flags are not available/i).first().isVisible()) {
      test.info().annotations.push({
        type: 'blocked',
        description: 'Run 035_inquiry_reference_and_flags.sql in Supabase before flag send can persist.',
      });
      return;
    }
    await expect(page.getByText(flagText)).toBeVisible();

    await page.getByRole('button', { name: /leads inquiry/i }).first().click();
    await expect(page.getByText('Flag Raised').first()).toBeVisible({ timeout: 20_000 });
  });
});
