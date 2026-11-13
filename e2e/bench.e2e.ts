import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `BENCH_DIR=/folder/of/drawings pnpm e2e bench --project=desktop` opens every DWG and DXF in the
 * folder and reports time to first render, memory and pan smoothness.
 */
const dir = process.env.BENCH_DIR;
const files = dir ? fs.readdirSync(dir).filter((name) => /\.(dwg|dxf)$/i.test(name)).sort((a, b) => fs.statSync(path.join(dir, a)).size - fs.statSync(path.join(dir, b)).size) : [];

for (const name of files) {
  test(`benchmark ${name}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    const started = Date.now();
    await page.locator('input[type=file]').setInputFiles(path.join(dir!, name));
    const canvas = page.getByRole('img', { name: 'Vector drawing' });
    const failure = page.getByText(/could not be opened|too heavy/);
    await expect(canvas.or(failure)).toBeVisible({ timeout: 280_000 });
    const size = `${(fs.statSync(path.join(dir!, name)).size / 1048576).toFixed(1)} MB`;
    if (await failure.isVisible()) {
      console.log(`BENCH ${name} | ${size} | not opened: ${await page.locator('main p').first().innerText()}`);
      return;
    }
    await page.waitForTimeout(1500);
    const opened = Date.now() - started - 1500;
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Record frame times while dragging the drawing around.
    await page.evaluate(() => {
      const record = window as Window & { benchFrames?: number[]; benchStop?: boolean };
      record.benchFrames = [];
      let last = performance.now();
      const tick = (now: number) => {
        record.benchFrames!.push(now - last);
        last = now;
        if (!record.benchStop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(box.x + box.width / 2 + i * 5, box.y + box.height / 2 + i * 3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const frames = await page.evaluate(() => {
      const record = window as Window & { benchFrames?: number[]; benchStop?: boolean };
      record.benchStop = true;
      return record.benchFrames!.slice(1);
    });
    const heap = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    const objects = (await page.getByText(/objects/).first().textContent())?.match(/[\d,]+ objects/)?.[0];
    const sorted = [...frames].sort((a, b) => a - b);
    console.log(`BENCH ${name} | ${size} | ${objects} | open ${(opened / 1000).toFixed(1)} s | page memory ${Math.round(heap / 1048576)} MB | pan frame median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(0)} ms, worst ${sorted.at(-1)!.toFixed(0)} ms`);
  });
}
