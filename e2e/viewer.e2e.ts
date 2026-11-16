import { closeSync, ftruncateSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pdfBytes, scanPdfBytes, vectorPdfBytes } from '../tests/pdfFixture';

const sample = readFileSync('public/samples/studio-apartment.dxf');

test('open the sample, use the tools, and export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in your browser');

  await page.locator('input[type=file]').setInputFiles({ name: 'studio-apartment.dxf', mimeType: 'application/dxf', buffer: sample });
  const canvas = page.getByRole('img', { name: 'Vector drawing' });
  await expect(canvas).toBeVisible();
  await expect(page.getByText('88 objects').first()).toBeAttached(); // header and drawings panel both show it

  // Layers: hiding one is reported in the status chip.
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByText('FURNITURE')).toBeVisible();
  await page.getByRole('button', { name: 'Hide all' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Hidden' })).toContainText('FURNITURE');
  await page.getByRole('button', { name: 'Show all' }).last().click(); // the panel's own button
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Measure: two clicks give a length in metres.
  await page.keyboard.press('m');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(page.getByText(/\d+\.\d{2} m ·/)).toBeVisible();
  await page.keyboard.press('Escape');

  // Command palette lists the actions.
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search commands' }).fill('pdf');
  await expect(page.getByRole('option', { name: /Export PDF/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('header').getByRole('button', { name: /Export|^$/ }).filter({ has: page.locator('svg.lucide-download') }).click();
  await page.getByRole('menuitem', { name: /PNG/ }).click();
  const pick = page.getByRole('dialog', { name: 'Choose an area to export' });
  await expect(pick).toBeVisible();
  const area = (await pick.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.25, area.y + area.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.75, area.y + area.height * 0.75, { steps: 8 });
  await page.mouse.up();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('studio-apartment.png');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a PDF opens the DWG embedded in it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Drop a DWG, DXF, or a PDF that contains the drawing')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'plot.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes('notes.txt', 'hello')),
  });
  await expect(page.getByText('This file could not be opened')).toBeVisible();
  await expect(page.locator('main')).toContainText('This PDF has no drawing in it.');

  await page.locator('input[type=file]').setInputFiles({
    name: 'carry.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes('plan.dwg', 'AC1032-not-a-real-drawing')),
  });
  // LibreDWG accepts this header, so the reader runs and reports an empty drawing.
  await expect(page.locator('main')).toContainText('This drawing has nothing to display.');
});

test('a file that is not a drawing gets a clear message', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('just some text') });
  await expect(page.getByText('This file could not be opened')).toBeVisible();
  await expect(page.locator('main')).toContainText('does not look like a DWG or DXF drawing');
});

test('the layer notice clears the sidebar, and stays at the left when the sidebar is closed', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 820 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'studio-apartment.dxf', mimeType: 'application/dxf', buffer: sample });
  await expect(page.getByRole('img', { name: 'Vector drawing' })).toBeVisible();
  const glimpse = page.getByRole('button', { name: 'Show the drawing' });
  if (await glimpse.isVisible()) await glimpse.click();

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Hide all' }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Hidden' });
  const rail = page.getByRole('complementary', { name: 'Drawings and views' });
  await expect(notice).toBeVisible();
  const opened = (await notice.boundingBox())!;
  const railBox = (await rail.boundingBox())!;
  expect(opened.x).toBeGreaterThan(railBox.x + railBox.width);

  await page.getByRole('button', { name: 'Hide drawings and views' }).click();
  const stage = page.locator('[data-left-rail="closed"]');
  await expect(stage).toBeAttached();
  await expect.poll(async () => {
    const closed = await notice.boundingBox();
    const stageBox = await stage.boundingBox();
    return closed && stageBox ? closed.x - stageBox.x : 999;
  }).toBeLessThan(20);
});

test('DWG and DXF files over 50 MB are refused', async ({ page }) => {
  await page.goto('/');
  for (const name of ['heavy.dwg', 'heavy.dxf']) {
    const path = join(tmpdir(), name);
    const handle = openSync(path, 'w');
    ftruncateSync(handle, 51 * 1024 * 1024);
    closeSync(handle);
    await page.locator('input[type=file]').setInputFiles(path);
    await expect(page.getByText('This drawing is too heavy for the browser')).toBeVisible();
    await expect(page.locator('main')).toContainText('up to about 50 MB');
  }
});

test('search landing pages have their own heading', async ({ page }) => {
  await page.goto('/open-dwg-without-autocad');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('without AutoCAD');
  await expect(page).toHaveTitle(/Open a DWG file without AutoCAD/);
});

test('a vector PDF is converted and opens in the viewer', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(vectorPdfBytes()) });
  await expect(page.getByRole('img', { name: 'Vector drawing' })).toBeVisible();
  await expect(page.locator('header')).toContainText('1 page');
});

test('a scanned PDF with no vectors is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(scanPdfBytes()) });
  await expect(page.locator('main')).toContainText('scanned image');
});
