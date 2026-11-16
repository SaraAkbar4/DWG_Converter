import { expect, test } from '@playwright/test';

const PAGES = ['/privacy', '/terms', '/', '/dwg-viewer', '/dxf-viewer', '/open-dwg-without-autocad'];

test('every page has the site navbar', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const header = page.locator('header').first();
    await expect(header.getByRole('link', { name: 'SpatialSense' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Start free trial' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Switch theme' })).toBeVisible();

    const wide = (page.viewportSize()?.width ?? 0) > 900;
    if (!wide) await header.getByRole('button', { name: 'Menu' }).click();
    const how = page.getByRole('link', { name: 'How it works' });
    await expect(how).toBeVisible();
    const onLegal = path === '/privacy' || path === '/terms';
    await expect(how).toHaveAttribute('href', onLegal ? '/#how' : '#how');
    const back = header.getByRole('link', { name: 'Back' });
    if (onLegal) await expect(back).toHaveAttribute('href', '/');
    else await expect(back).toHaveCount(0);
    if (!wide) await header.getByRole('button', { name: 'Close menu' }).click();
  }
});

test('a section link on a legal page returns home', async ({ page }) => {
  await page.goto('/terms');
  const wide = (page.viewportSize()?.width ?? 0) > 900;
  if (!wide) await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/\/#how$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Nothing to install.' })).toBeVisible();
});
