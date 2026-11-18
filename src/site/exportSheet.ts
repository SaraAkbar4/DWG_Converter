import type { Bounds } from '../cad/cadGeometry';
import type { CadView } from '../cad/cadView';
import { frameBands, frameScaleFor } from './pngWatermark';

/** ISO paper sizes in millimetres, short edge first. The same list ShareCAD's print dialog offers. */
export const PAPER_MM = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
} as const;
export type PaperName = keyof typeof PAPER_MM;
export type Orientation = 'portrait' | 'landscape';

/** Blank border round the drawing on the sheet, as on a plot. */
const SHEET_MARGIN_MM = 10;
/** Drawing scales offered, as the N of 1:N. */
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000] as const;
export const DPI_CHOICES = [150, 300] as const;
/** Safari refuses canvases over ~16.7 million pixels, so large sheets come out at a lower dpi. */
export const MAX_SHEET_PIXELS = 16_000_000;
const MM_PER_INCH = 25.4;
/** CSS pixels per inch: a 1px line on screen prints this many inches wide. */
const CSS_DPI = 96;

export type SheetOptions = {
  paper: PaperName;
  orientation: Orientation;
  /** N of a 1:N scale, or null to fit the area to the paper. */
  scale: number | null;
  dpi: number;
};

export type SheetLayout = {
  /** The whole sheet, header and footer included, in pixels. */
  width: number;
  height: number;
  /** Resolution the sheet is drawn at; lower than asked for when the sheet would be too large. */
  dpi: number;
  /** Size of the header and footer the brand frame adds, and the scale it draws them at. */
  frame: { scale: number; headerH: number; footerH: number };
  /** The drawing part of the sheet (between header and footer). */
  body: { width: number; height: number };
  /** Where the drawing goes inside the body, within the margins. */
  box: { x: number; y: number; width: number; height: number };
  /** Maps drawing units onto the body canvas. */
  view: CadView;
  /** Pixel ratio to draw at, so a 1px screen line prints at its usual width. */
  dpr: number;
  /** The drawing scale actually used, as N of 1:N (also when fitting), or null without units. */
  scaleN: number | null;
  /** False when the area is larger than the paper at the chosen scale and gets cut off. */
  fits: boolean;
};

export function sheetLayout(area: Bounds, options: SheetOptions, metersPerUnit: number | null): SheetLayout | null {
  const [minX, minY, maxX, maxY] = area;
  const areaW = maxX - minX;
  const areaH = maxY - minY;
  if (!(areaW > 0) || !(areaH > 0)) return null;

  const [short, long] = PAPER_MM[options.paper];
  const [paperW, paperH] = options.orientation === 'landscape' ? [long, short] : [short, long];
  const capDpi = Math.sqrt(MAX_SHEET_PIXELS / ((paperW / MM_PER_INCH) * (paperH / MM_PER_INCH)));
  const dpi = Math.max(1, Math.min(options.dpi, Math.floor(capDpi)));
  const px = (mm: number) => (mm / MM_PER_INCH) * dpi;
  const width = Math.round(px(paperW));
  const height = Math.round(px(paperH));

  // The branding grows with the sheet, so it takes the same share of any paper size.
  const frameScale = frameScaleFor(Math.max(width, height));
  const { headerH, footerH } = frameBands(frameScale);
  const body = { width, height: Math.max(1, height - headerH - footerH) };
  const margin = px(SHEET_MARGIN_MM);
  const box = { x: margin, y: margin, width: body.width - margin * 2, height: body.height - margin * 2 };
  if (box.width <= 0 || box.height <= 0) return null;

  // Pixels per drawing unit at a true 1:N scale: one unit is metersPerUnit·1000/N mm on paper.
  const pxPerUnitAt = (n: number) => px((metersPerUnit! * 1000) / n);
  const fitPx = Math.min(box.width / areaW, box.height / areaH);
  const useScale = options.scale !== null && metersPerUnit ? options.scale : null;
  const k = useScale ? pxPerUnitAt(useScale) : fitPx;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const view: CadView = {
    scale: k,
    tx: box.x + box.width / 2 - centerX * k,
    ty: box.y + box.height / 2 + centerY * k,
  };
  const scaleN = metersPerUnit ? (metersPerUnit * 1000 * dpi) / MM_PER_INCH / k : null;
  const fits = areaW * k <= box.width + 1 && areaH * k <= box.height + 1;

  return {
    width,
    height,
    dpi,
    frame: { scale: frameScale, headerH, footerH },
    body,
    box,
    view,
    dpr: dpi / CSS_DPI,
    scaleN,
    fits,
  };
}

/** Portrait or landscape, whichever suits the area's shape. */
export const orientationFor = (area: Bounds): Orientation =>
  area[2] - area[0] >= area[3] - area[1] ? 'landscape' : 'portrait';

/** "1:50", or "1:37.5" for a fitted scale that is not a round number. */
export function formatScale(n: number): string {
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `1:${rounded.toLocaleString('en-US')}`;
}

/**
 * The same sheet `factor` times the size, for a preview that looks like the download: the brand
 * bands, margins, line widths and scale all shrink together.
 */
export function scaleLayout(layout: SheetLayout, factor: number): SheetLayout {
  const frameScale = layout.frame.scale * factor;
  const { headerH, footerH } = frameBands(frameScale);
  const width = Math.max(1, Math.round(layout.width * factor));
  const height = Math.max(1, Math.round(layout.height * factor));
  return {
    ...layout,
    width,
    height,
    dpi: layout.dpi * factor,
    frame: { scale: frameScale, headerH, footerH },
    body: { width, height: Math.max(1, height - headerH - footerH) },
    box: {
      x: layout.box.x * factor,
      y: layout.box.y * factor,
      width: layout.box.width * factor,
      height: layout.box.height * factor,
    },
    view: { scale: layout.view.scale * factor, tx: layout.view.tx * factor, ty: layout.view.ty * factor },
    dpr: layout.dpr * factor,
  };
}
