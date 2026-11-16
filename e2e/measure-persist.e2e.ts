import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const sample = readFileSync('public/samples/studio-apartment.dxf');

const bluePixels = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const node = document.querySelector('canvas');
    if (!node) return 0;
    const ctx = node.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, node.width, node.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (b > 160 && r < 120 && g < 170 && b > r + 40) count += 1;
    }
    return count;
  });

test('measurements stay on the sheet and in the export', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'studio-apartment.dxf', mimeType: 'application/dxf', buffer: sample });
  const canvas = page.getByRole('img', { name: 'Vector drawing' });
  await expect(canvas).toBeVisible();
  const glimpse = page.getByRole('button', { name: 'Show the drawing' });
  if (await glimpse.isVisible()) await glimpse.click();

  const before = await bluePixels(page);
  await page.keyboard.press('m');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.35, y: box.height * 0.5 }, force: true });
  await canvas.click({ position: { x: box.width * 0.62, y: box.height * 0.42 }, force: true });
  const measured = await bluePixels(page);
  expect(measured).toBeGreaterThan(before);

  await page.keyboard.press('m');
  await expect(page.getByText('Measure distance')).toHaveCount(0);
  const kept = await bluePixels(page);
  expect(kept).toBeGreaterThan(before);

  await page.locator('header').getByRole('button', { name: /Export|^$/ }).filter({ has: page.locator('svg.lucide-download') }).click();
  await page.getByRole('menuitem', { name: /PNG/ }).click();
  const pick = page.getByRole('dialog', { name: 'Choose an area to export' });
  await expect(pick).toBeVisible();
  const area = (await pick.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.2, area.y + area.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.8, area.y + area.height * 0.8, { steps: 8 });
  await page.mouse.up();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('studio-apartment.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (stream) {
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});
