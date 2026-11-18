import { describe, expect, test } from 'vitest';
import type { Bounds } from '../src/cad/cadGeometry';
import { toScreen } from '../src/cad/cadView';
import { MAX_SHEET_PIXELS, formatScale, orientationFor, scaleLayout, sheetLayout } from '../src/site/exportSheet';

/** A 10 m × 5 m plan drawn in millimetres. */
const plan: Bounds = [0, 0, 10_000, 5_000];
const MM = 0.001;

describe('export sheet', () => {
  test('a sheet is the paper size at the chosen resolution', () => {
    const layout = sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: null, dpi: 300 }, MM)!;
    expect([layout.width, layout.height]).toEqual([3508, 2480]);
    const portrait = sheetLayout(plan, { paper: 'A4', orientation: 'portrait', scale: null, dpi: 150 }, MM)!;
    expect([portrait.width, portrait.height]).toEqual([1240, 1754]);
  });

  test('the header, footer and drawing add up to exactly the sheet', () => {
    const layout = sheetLayout(plan, { paper: 'A3', orientation: 'landscape', scale: null, dpi: 150 }, MM)!;
    expect(layout.body.height + layout.frame.headerH + layout.frame.footerH).toBe(layout.height);
  });

  test('fit to paper fills the box inside the margins, centred', () => {
    const layout = sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: null, dpi: 300 }, MM)!;
    const [left, top] = toScreen(layout.view, 0, 5_000);
    const [right, bottom] = toScreen(layout.view, 10_000, 0);
    expect(layout.fits).toBe(true);
    // The area's wider side touches the margins; the other side is centred.
    expect(Math.max(right - left - layout.box.width, bottom - top - layout.box.height)).toBeCloseTo(0, 6);
    expect((left + right) / 2).toBeCloseTo(layout.box.x + layout.box.width / 2, 6);
    expect((top + bottom) / 2).toBeCloseTo(layout.box.y + layout.box.height / 2, 6);
  });

  test('at 1:100, one metre of drawing is 10 mm of paper', () => {
    const layout = sheetLayout(plan, { paper: 'A3', orientation: 'landscape', scale: 100, dpi: 300 }, MM)!;
    const tenMmInPx = (10 / 25.4) * layout.dpi;
    expect(layout.view.scale * 1000).toBeCloseTo(tenMmInPx, 9);
    expect(layout.scaleN).toBeCloseTo(100, 9);
    expect(formatScale(layout.scaleN!)).toBe('1:100');
  });

  test('the same scale works for drawings in metres', () => {
    const metres: Bounds = [0, 0, 10, 5];
    const layout = sheetLayout(metres, { paper: 'A3', orientation: 'landscape', scale: 100, dpi: 300 }, 1)!;
    expect(layout.view.scale).toBeCloseTo((10 / 25.4) * layout.dpi, 9);
  });

  test('says when the area is too big for the paper at that scale', () => {
    // 10 m at 1:20 is 500 mm, wider than A4.
    expect(sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: 20, dpi: 150 }, MM)!.fits).toBe(false);
    expect(sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: 100, dpi: 150 }, MM)!.fits).toBe(true);
  });

  test('a drawing without units is always fitted', () => {
    const layout = sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: 50, dpi: 150 }, null)!;
    expect(layout.fits).toBe(true);
    expect(layout.scaleN).toBeNull();
  });

  test('large sheets drop to a resolution the browser can draw', () => {
    const layout = sheetLayout(plan, { paper: 'A0', orientation: 'landscape', scale: null, dpi: 300 }, MM)!;
    expect(layout.width * layout.height).toBeLessThanOrEqual(MAX_SHEET_PIXELS);
    expect(layout.dpi).toBeLessThan(300);
  });

  test('lines print at their screen width: 1px is 1/96 inch', () => {
    expect(sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: null, dpi: 300 }, MM)!.dpr).toBeCloseTo(300 / 96, 9);
  });

  test('a preview is the same sheet, smaller', () => {
    const layout = sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: 100, dpi: 300 }, MM)!;
    const small = scaleLayout(layout, 0.1);
    expect(small.width).toBe(351);
    expect(small.view.scale).toBeCloseTo(layout.view.scale * 0.1, 9);
    expect(small.body.height + small.frame.headerH + small.frame.footerH).toBe(small.height);
  });

  test('a wide area prints landscape, a tall one portrait', () => {
    expect(orientationFor(plan)).toBe('landscape');
    expect(orientationFor([0, 0, 2, 9])).toBe('portrait');
  });

  test('an empty area has no sheet', () => {
    expect(sheetLayout([3, 3, 3, 9], { paper: 'A4', orientation: 'landscape', scale: null, dpi: 150 }, MM)).toBeNull();
  });
});

describe('brand bands on paper', () => {
  const share = (layout: ReturnType<typeof sheetLayout>) =>
    (layout!.frame.headerH + layout!.frame.footerH) / layout!.height;

  test('take the same share of the sheet on every paper size and resolution', () => {
    const a4 = share(sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: null, dpi: 150 }, MM));
    const a4Fine = share(sheetLayout(plan, { paper: 'A4', orientation: 'landscape', scale: null, dpi: 300 }, MM));
    const a2 = share(sheetLayout(plan, { paper: 'A2', orientation: 'landscape', scale: null, dpi: 300 }, MM));
    const a0 = share(sheetLayout(plan, { paper: 'A0', orientation: 'landscape', scale: null, dpi: 300 }, MM));
    for (const other of [a4Fine, a2, a0]) expect(other).toBeCloseTo(a4, 2);
  });

  test('keep that share in the preview', () => {
    const layout = sheetLayout(plan, { paper: 'A1', orientation: 'portrait', scale: null, dpi: 300 }, MM);
    expect(share(scaleLayout(layout!, 520 / layout!.height))).toBeCloseTo(share(layout), 2);
  });
});
