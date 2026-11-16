import type { CadDrawing, CadEntity, CadText } from '../cad/types';
import { PDF_OPTIONS, PdfExtractFailure, loadPdfjs } from './pdfEmbed';
import type { FileInfo, Sheet } from './protocol';

type Matrix = [number, number, number, number, number, number];
type Ops = { fnArray: number[]; argsArray: unknown[] };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const CURVE_STEPS = 8;
/** Fewer painted segments than this across the whole file means a scan, a photo or a blank page. */
const MIN_SEGMENTS = 24;
const POINT_IN_METRES = 0.0254 / 72;
const LAYERS = ['Lines', 'Fills', 'Text'] as const;
const DrawOp = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const round = (value: number) => Math.round(value * 100) / 100;

function hex(color: unknown): string {
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (Array.isArray(color) && color.length >= 3) {
    return '#' + color.slice(0, 3).map((v) => Math.round(Number(v) > 1 ? Number(v) : Number(v) * 255).toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}

/** Turns one page's painting operators into flat polylines in page space (points, y up). */
function pagePaths(ops: Ops, OPS: Record<string, number>) {
  const entities: Array<{ p: number[]; closed: boolean; fill: boolean; color: string }> = [];
  const stack: Matrix[] = [];
  let ctm = IDENTITY;
  let stroke = '#000000';
  let fill = '#000000';
  let images = 0;
  let segments = 0;
  const painted = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === OPS.transform) ctm = multiply(ctm, args as unknown as Matrix);
    else if (fn === OPS.setStrokeRGBColor) stroke = hex(args[0]);
    else if (fn === OPS.setFillRGBColor) fill = hex(args[0]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) images++;
    else if (fn === OPS.constructPath) {
      const [op, dataWrap] = args as [number, Float32Array[] | Float32Array];
      if (!painted.has(op)) continue; // clipping paths and discarded paths draw nothing
      const data = Array.isArray(dataWrap) ? dataWrap[0] : dataWrap;
      if (!data) continue;
      const isFill = fills.has(op);
      const color = isFill ? fill : stroke;
      let p: number[] = [];
      let closed = false;
      let [cx, cy] = [0, 0];
      const flush = () => {
        if (p.length >= 4) {
          segments += p.length / 2 - 1;
          entities.push({ p, closed: closed || isFill, fill: isFill, color });
        }
        p = [];
        closed = false;
      };
      for (let k = 0; k < data.length; ) {
        const code = data[k++];
        if (code === DrawOp.moveTo) {
          flush();
          [cx, cy] = [data[k++]!, data[k++]!];
          p.push(...apply(ctm, cx, cy).map(round));
        } else if (code === DrawOp.lineTo) {
          [cx, cy] = [data[k++]!, data[k++]!];
          p.push(...apply(ctm, cx, cy).map(round));
        } else if (code === DrawOp.curveTo || code === DrawOp.quadraticCurveTo) {
          const quad = code === DrawOp.quadraticCurveTo;
          const [x1, y1, x2, y2] = [data[k++]!, data[k++]!, data[k++]!, data[k++]!];
          const [x3, y3] = quad ? [x2, y2] : [data[k++]!, data[k++]!];
          for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS;
            const u = 1 - t;
            const x = quad ? u * u * cx + 2 * u * t * x1 + t * t * x2 : u ** 3 * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3;
            const y = quad ? u * u * cy + 2 * u * t * y1 + t * t * y2 : u ** 3 * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3;
            p.push(...apply(ctm, x, y).map(round));
          }
          [cx, cy] = [x3, y3];
        } else if (code === DrawOp.closePath) {
          closed = true;
        }
      }
      flush();
    }
  }
  return { entities, images, segments };
}

type PdfText = { s: string; x: number; y: number; h: number; r: number };
type PdfPath = { p: number[]; fill: boolean };

/** Metres per PDF point from a "SCALE 1:50" note, else from dimension numbers measured against their dimension lines. */
function detectScale(texts: PdfText[], paths: PdfPath[]): { metersPerPoint: number; note: string } | null {
  const joined = texts.map((t) => t.s).join(' ');
  const noted = /\b(?:SCALE|SC\.?|ÉCHELLE|MASSSTAB)\s*[:=]?\s*1\s*[:/]\s*(\d{1,4})\b/i.exec(joined) ?? /\b1\s*:\s*(\d{2,4})\b/.exec(joined);
  if (noted) {
    const n = Number(noted[1]);
    if (n >= 1 && n <= 5000) return { metersPerPoint: POINT_IN_METRES * n, note: `1:${n}` };
  }
  // Dimension text sits on or just above a straight line whose length, in points, it describes.
  const lines = paths.filter((e) => !e.fill && e.p.length === 4).map((e) => {
    const [x1, y1, x2, y2] = e.p as [number, number, number, number];
    return { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1), mx: (x1 + x2) / 2, my: (y1 + y2) / 2, horizontal: Math.abs(y2 - y1) < Math.abs(x2 - x1) * 0.05, vertical: Math.abs(x2 - x1) < Math.abs(y2 - y1) * 0.05 };
  });
  const samples: number[] = [];
  const values: number[] = [];
  for (const t of texts) {
    const value = /^\s*(\d{2,6}(?:\.\d+)?)\s*(?:mm)?\s*$/.exec(t.s)?.[1];
    if (!value) continue;
    const v = Number(value);
    const w = t.h * t.s.length * 0.6;
    const along = Math.abs(((t.r % 180) + 180) % 180 - 90) < 20 ? 'vertical' : 'horizontal';
    const near = lines.filter((l) => {
      if (!l[along] || l.len < w) return false;
      const cx = along === 'horizontal' ? t.x + w / 2 : t.x;
      const cy = along === 'horizontal' ? t.y : t.y + w / 2;
      const across = along === 'horizontal' ? Math.abs(l.my - cy) : Math.abs(l.mx - cx);
      const alongDist = along === 'horizontal' ? Math.abs(l.mx - cx) : Math.abs(l.my - cy);
      return across < t.h * 2.5 && alongDist < l.len / 2;
    });
    if (near.length !== 1) continue;
    samples.push(v / near[0]!.len);
    values.push(v);
  }
  if (samples.length < 3) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const agreeing = samples.filter((r) => Math.abs(r - median) / median < 0.05).length;
  if (agreeing < Math.max(3, samples.length * 0.6)) return null;
  const typical = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const unitInMetres = typical >= 100 ? 0.001 : 1; // small numbers are metres, large ones millimetres
  const metersPerPoint = median * unitInMetres;
  return { metersPerPoint, note: `1:${Math.round(metersPerPoint / POINT_IN_METRES)}` };
}

/**
 * Reads the drawing that a PDF paints (lines, curves, fills and text) into the viewer's format,
 * one sheet per page. A PDF that paints no vectors, such as a scan, is refused.
 */
export async function extractPdfVectors(file: File): Promise<{ sheets: Sheet[]; info: FileInfo }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...PDF_OPTIONS });
  try {
    const doc = await task.promise;
    const sheets: Sheet[] = [];
    let segments = 0;
    let images = 0;
    let scaleNote: string | null = null;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const paths = pagePaths((await page.getOperatorList()) as Ops, pdfjs.OPS as unknown as Record<string, number>);
      segments += paths.segments;
      images += paths.images;
      const colors: string[] = [];
      const colorIndex = (c: string) => {
        let index = colors.indexOf(c);
        if (index < 0) index = colors.push(c) - 1;
        return index;
      };
      // A fill that blankets the page is its background, not the drawing.
      const [px0 = 0, py0 = 0, px1 = 0, py1 = 0] = page.view;
      const pageArea = Math.abs((px1 - px0) * (py1 - py0));
      const isBackground = (e: { p: number[]; fill: boolean }) => {
        if (!e.fill || e.p.length < 8) return false;
        const xs = e.p.filter((_, k) => k % 2 === 0);
        const ys = e.p.filter((_, k) => k % 2 === 1);
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) > pageArea * 0.9;
      };
      const entities: CadEntity[] = paths.entities
        .filter((e) => !isBackground(e))
        .map((e) => ({ t: e.fill ? 'FILL' : 'PATH', p: e.p, closed: e.closed, fill: e.fill, l: e.fill ? 1 : 0, c: colorIndex(e.color), b: 0 }));
      const texts: CadText[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [a, b, , d, e, f] = item.transform as Matrix;
        texts.push({ s: item.str, x: round(e), y: round(f), h: round(Math.hypot(b, d) || item.height), r: Math.round((Math.atan2(b, a) * 180) / Math.PI), ha: 'left', va: 'baseline', l: 2, c: colorIndex('#000000'), b: 0 });
      }
      const scale = detectScale(texts, paths.entities);
      if (scale && !scaleNote) scaleNote = scale.note;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const e of entities) for (let k = 0; k < e.p.length; k += 2) xs.push(e.p[k]!), ys.push(e.p[k + 1]!);
      for (const t of texts) xs.push(t.x, t.x + t.h * t.s.length * 0.6), ys.push(t.y, t.y + t.h);
      const extents: CadDrawing['extents'] = xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [px0, py0, px1, py1];
      const count = (l: number) => entities.filter((e) => e.l === l).length + (l === 2 ? texts.length : 0);
      sheets.push({
        name: doc.numPages > 1 ? `Page ${n}` : 'Page',
        drawing: {
          version: 1,
          // Without a known plot scale a point is just paper; measurements then read in points until the visitor sets a scale.
          units: scale ? 'mm' : 'pt',
          meters_per_unit: scale?.metersPerPoint ?? null,
          extents,
          level: null,
          layers: LAYERS.map((name, l) => ({ name, color: l === 2 ? '#ffffff' : (colors[0] ?? '#ffffff'), linetype: 'continuous', visible: true, count: count(l) })),
          colors: colors.length ? colors : ['#000000'],
          block_paths: [''],
          entities,
          texts,
          rooms: [],
          grids: [],
          unsupported: images ? { image: images } : {},
        },
      });
      page.cleanup();
    }
    if (segments < MIN_SEGMENTS) {
      throw new PdfExtractFailure(
        'unsupported',
        images
          ? 'This PDF is a scanned image or photo, not a vector drawing, so there is nothing to convert. Export the PDF from your CAD program, or open the DWG or DXF directly.'
          : 'This PDF has no drawing in it. Export the PDF from your CAD program, or open the DWG or DXF directly.',
      );
    }
    const pages = `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
    return { sheets, info: { name: file.name, size: file.size, format: 'PDF', version: scaleNote ? `${pages} · scale ${scaleNote}` : pages } };
  } catch (error) {
    if (error instanceof PdfExtractFailure) throw error;
    if (error instanceof pdfjs.PasswordException) throw new PdfExtractFailure('unsupported', 'This PDF is password-protected, so it could not be read.');
    throw new PdfExtractFailure('corrupt', 'This PDF could not be read.');
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
