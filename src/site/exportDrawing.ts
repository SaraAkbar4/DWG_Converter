import { measureAnchor, measureLabel, type CadMeasure } from '../cad/cadMeasure';
import type { CadDrawing } from '../cad/types';
import { pdfBrand } from './pdfBrand';
import { frameExportPng } from './pngWatermark';

/** White CAD ink is unreadable on a white page. */
const ink = (color: string) => (color.toLowerCase() === '#ffffff' ? '#000000' : color);

function download(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** CSS pixels on the on-screen canvas. */
export type PngRegion = { x: number; y: number; width: number; height: number };

/** The chosen area of the current view, in the canvas's own pixels. */
export async function exportPng(canvas: HTMLCanvasElement, stem: string, region: PngRegion) {
  const scaleX = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
  const scaleY = canvas.clientHeight > 0 ? canvas.height / canvas.clientHeight : 1;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(region.x * scaleX)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(region.y * scaleY)));
  const width = Math.max(1, Math.min(canvas.width - x, Math.round(region.width * scaleX)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.round(region.height * scaleY)));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const context = out.getContext('2d');
  if (!context) return;
  context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  const framed = await frameExportPng(out, stem).catch(() => out);
  const blob = await new Promise<Blob | null>((resolve) => framed.toBlob(resolve, 'image/png'));
  if (blob) download(blob, `${stem}.png`);
}

const MEASURE_INK = '#2459d8';

const PDF_PAGE = [1190.55, 841.89] as const; // A3 in points
const PDF_MARGIN = 28;
const PDF_LINE_WIDTH = 0.35;
/** Rough Helvetica metrics, enough to place centred and right-aligned labels. */
const PDF_CHAR_WIDTH = 0.5;
const PDF_CAP_HEIGHT = 0.72;

type PdfChunk = string | Uint8Array;

/** The whole sheet as a one-page vector PDF (A3, turned to suit the drawing). */
export async function exportPdf(drawing: CadDrawing, stem: string, measures: CadMeasure[] = []) {
  const [minX, minY, maxX, maxY] = drawing.extents;
  const landscape = maxX - minX >= maxY - minY;
  const [width, height] = landscape ? PDF_PAGE : [PDF_PAGE[1], PDF_PAGE[0]];
  const brand = await pdfBrand(width, height, stem).catch(() => null);
  const box = brand?.box ?? { left: PDF_MARGIN, bottom: PDF_MARGIN, width: width - 2 * PDF_MARGIN, height: height - 2 * PDF_MARGIN };
  const scale = Math.min(box.width / (maxX - minX), box.height / (maxY - minY));
  const offsetX = box.left + (box.width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = box.bottom + (box.height - (maxY - minY) * scale) / 2 - minY * scale;
  const n = (value: number) => value.toFixed(2);
  const rgb = (color: string) => {
    const value = parseInt(ink(color).slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255].map((channel) => (channel / 255).toFixed(3)).join(' ');
  };

  const content: string[] = [`1 1 1 rg 0 0 ${n(width)} ${n(height)} re f`, `${PDF_LINE_WIDTH} w 1 J 1 j`];
  let currentColor = -1;
  const visible = drawing.entities.filter((entity) => drawing.layers[entity.l]?.visible).sort((a, b) => a.c - b.c);
  for (const entity of visible) {
    if (entity.c !== currentColor) {
      currentColor = entity.c;
      const color = rgb(drawing.colors[entity.c] ?? '#000000');
      content.push(`${color} RG ${color} rg`);
    }
    let path = '';
    for (let i = 0; i < entity.p.length; i += 2) {
      path += `${n(entity.p[i]! * scale + offsetX)} ${n(entity.p[i + 1]! * scale + offsetY)} ${i ? 'l' : 'm'} `;
    }
    content.push(path + (entity.fill ? 'f' : entity.closed ? 's' : 'S'));
  }
  for (const text of drawing.texts) {
    if (!drawing.layers[text.l]?.visible) continue;
    const size = text.h * scale;
    const angle = (text.r * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const down = { top: PDF_CAP_HEIGHT, middle: PDF_CAP_HEIGHT / 2, bottom: 0, baseline: 0 }[text.va] * size;
    text.s.split('\n').forEach((line, index) => {
      // The built-in PDF font covers Latin-1 only; other characters print as "?".
      const safe = line.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
      const along = { left: 0, center: 0.5, right: 1 }[text.ha] * safe.length * PDF_CHAR_WIDTH * size;
      const drop = down + index * size * 1.25;
      const x = text.x * scale + offsetX - along * cos + drop * sin;
      const y = text.y * scale + offsetY - along * sin - drop * cos;
      content.push(`BT /F1 ${n(size)} Tf ${rgb(drawing.colors[text.c] ?? '#000000')} rg ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${n(x)} ${n(y)} Tm (${safe}) Tj ET`);
    });
  }
  if (measures.length) {
    content.push(`${rgb(MEASURE_INK)} RG ${rgb(MEASURE_INK)} rg 1.1 w`);
    for (const measure of measures) {
      if (measure.points.length === 0) continue;
      let path = '';
      measure.points.forEach(([x, y], index) => {
        path += `${n(x * scale + offsetX)} ${n(y * scale + offsetY)} ${index ? 'l' : 'm'} `;
      });
      const closed = measure.mode === 'area' && measure.points.length > 2;
      content.push(path + (closed ? 's' : 'S'));
      const label = measureLabel(measure, drawing);
      const anchor = measureAnchor(measure);
      if (!label || !anchor) continue;
      const size = Math.max(8, ((maxX - minX) / 70) * scale);
      const safe = label.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
      content.push(`BT /F1 ${n(size)} Tf ${n(anchor[0] * scale + offsetX)} ${n(anchor[1] * scale + offsetY)} Td (${safe}) Tj ET`);
    }
  }
  if (brand) content.push(brand.operators);

  const stream = content.join('\n');
  const logos = brand?.logos ?? [];
  const xobjects = logos.map((logo, index) => `/${logo.name} ${6 + index} 0 R`).join(' ');
  const objects: PdfChunk[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 5 0 R >> /XObject << ${xobjects} >> >> /Contents 4 0 R >>`],
    [`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`],
    ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],
    ...logos.map((logo) => [
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.jpeg.length} >>\nstream\n`,
      logo.jpeg,
      '\nendstream',
    ]),
  ];
  const parts: PdfChunk[] = ['%PDF-1.4\n'];
  let cursor = parts[0]!.length;
  const offsets = objects.map((body, index) => {
    const offset = cursor;
    const wrapped: PdfChunk[] = [`${index + 1} 0 obj\n`, ...body, '\nendobj\n'];
    parts.push(...wrapped);
    cursor += wrapped.reduce((sum, chunk) => sum + chunk.length, 0);
    return offset;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  parts.push(xref);
  // Latin-1 strings, so their lengths equal byte lengths. Image bytes are appended raw.
  const bytes = parts.map((part) =>
    typeof part === 'string' ? Uint8Array.from(part, (char) => char.charCodeAt(0)) : Uint8Array.from(part),
  );
  download(new Blob(bytes as BlobPart[], { type: 'application/pdf' }), `${stem}.pdf`);
}
