import { measureAnchor, measureLabel, type CadMeasure } from '../cad/cadMeasure';
import type { CadDrawing } from '../cad/types';

const escapeXml = (value: string) => value.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** White CAD ink is unreadable on a white page. */
const ink = (color: string) => (color.toLowerCase() === '#ffffff' ? '#000000' : color);

function download(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** The current view, exactly as shown on screen. */
export function exportPng(canvas: HTMLCanvasElement, stem: string) {
  canvas.toBlob((blob) => blob && download(blob, `${stem}.png`), 'image/png');
}

/** The whole sheet as scalable vectors on a white page. */
const MEASURE_INK = '#2459d8';

function measureSvg(drawing: CadDrawing, measures: CadMeasure[], stroke: number) {
  const size = Math.max(drawing.extents[2] - drawing.extents[0], drawing.extents[3] - drawing.extents[1]) / 70;
  return measures
    .map((measure) => {
      if (measure.points.length === 0) return '';
      const d = measure.points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${-y}`).join('');
      const closed = measure.mode === 'area' && measure.points.length > 2;
      const anchor = measureAnchor(measure);
      const label = measureLabel(measure, drawing);
      const caption =
        label && anchor
          ? `<text x="${anchor[0]}" y="${-anchor[1]}" font-size="${size}" text-anchor="middle" fill="${MEASURE_INK}">${escapeXml(label)}</text>`
          : '';
      return `<path d="${d}${closed ? 'Z' : ''}" fill="${closed ? '#2459d822' : 'none'}" stroke="${MEASURE_INK}" stroke-width="${stroke * 2}"/>${caption}`;
    })
    .join('');
}

export function exportSvg(drawing: CadDrawing, stem: string, measures: CadMeasure[] = []) {
  const [minX, minY, maxX, maxY] = drawing.extents;
  const stroke = Math.max(maxX - minX, maxY - minY) / 2500;
  const byColor = new Map<number, { stroke: string[]; fill: string[] }>();
  for (const entity of drawing.entities) {
    if (!drawing.layers[entity.l]?.visible) continue;
    let group = byColor.get(entity.c);
    if (!group) byColor.set(entity.c, (group = { stroke: [], fill: [] }));
    let d = '';
    for (let i = 0; i < entity.p.length; i += 2) d += `${i ? 'L' : 'M'}${entity.p[i]} ${-entity.p[i + 1]!}`;
    (entity.fill ? group.fill : group.stroke).push(entity.closed || entity.fill ? `${d}Z` : d);
  }
  const paths = [...byColor].map(([c, group]) => {
    const color = ink(drawing.colors[c] ?? '#000000');
    return (
      (group.stroke.length ? `<path d="${group.stroke.join('')}" fill="none" stroke="${color}"/>` : '') +
      (group.fill.length ? `<path d="${group.fill.join('')}" fill="${color}" stroke="none"/>` : '')
    );
  });
  const texts = drawing.texts
    .filter((text) => drawing.layers[text.l]?.visible)
    .map((text) => {
      const anchor = { left: 'start', center: 'middle', right: 'end' }[text.ha];
      const baseline = { top: 'hanging', middle: 'central', bottom: 'text-after-edge', baseline: 'alphabetic' }[text.va];
      return `<text transform="translate(${text.x} ${-text.y}) rotate(${-text.r})" font-size="${text.h}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${ink(drawing.colors[text.c] ?? '#000000')}">${escapeXml(text.s)}</text>`;
    });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY - minY}" stroke-width="${stroke}" stroke-linejoin="round" font-family="Arial, sans-serif"><rect x="${minX}" y="${-maxY}" width="${maxX - minX}" height="${maxY - minY}" fill="#ffffff"/>${paths.join('')}${texts.join('')}${measureSvg(drawing, measures, stroke)}</svg>`;
  download(new Blob([svg], { type: 'image/svg+xml' }), `${stem}.svg`);
}

const PDF_PAGE = [1190.55, 841.89] as const; // A3 in points
const PDF_MARGIN = 28;
const PDF_LINE_WIDTH = 0.35;
/** Rough Helvetica metrics, enough to place centred and right-aligned labels. */
const PDF_CHAR_WIDTH = 0.5;
const PDF_CAP_HEIGHT = 0.72;

/** The whole sheet as a one-page vector PDF (A3, turned to suit the drawing). */
export function exportPdf(drawing: CadDrawing, stem: string, measures: CadMeasure[] = []) {
  const [minX, minY, maxX, maxY] = drawing.extents;
  const landscape = maxX - minX >= maxY - minY;
  const [width, height] = landscape ? PDF_PAGE : [PDF_PAGE[1], PDF_PAGE[0]];
  const scale = Math.min((width - 2 * PDF_MARGIN) / (maxX - minX), (height - 2 * PDF_MARGIN) / (maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale;
  const n = (value: number) => value.toFixed(2);
  const rgb = (color: string) => {
    const value = parseInt(ink(color).slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255].map((channel) => (channel / 255).toFixed(3)).join(' ');
  };

  const content: string[] = [`${PDF_LINE_WIDTH} w 1 J 1 j`];
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

  const stream = content.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1 bytes, so string offsets above equal byte offsets.
  download(new Blob([Uint8Array.from(pdf, (char) => char.charCodeAt(0))], { type: 'application/pdf' }), `${stem}.pdf`);
}
