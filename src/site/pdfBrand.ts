import { KODIFLY_FOOTER_LOGO_ASPECT, KODIFLY_FOOTER_LOGO_SVG } from './kodiflyFooterLogo';
import { SPATIAL_SENSE_LOGO_ASPECT, SPATIAL_SENSE_LOGO_SVG } from './spatialSenseLogo';

/** Millimetre layout from the platform PDF page (header bar, footer rule, logo, copyright, page count). */
const MM = 72 / 25.4;
const MARGIN_X = 18 * MM;
const ACCENT = '0.118 0.502 0.910';
const RULE = '0.820 0.835 0.859';
const MUTED = '0.420 0.447 0.502';
const HEADER_LOGO = SPATIAL_SENSE_LOGO_SVG.replaceAll('fill="#FFFFFF"', 'fill="#14181F"');
const FOOTER_MARK = KODIFLY_FOOTER_LOGO_SVG.replaceAll('fill-opacity="0.45"', 'fill-opacity="0.92"');
const BAND = '0.973 0.980 0.988';

const n = (value: number) => value.toFixed(2);

export type PdfBox = { left: number; bottom: number; width: number; height: number };
export type PdfLogo = { name: string; jpeg: Uint8Array; width: number; height: number };

export type PdfBrand = {
  operators: string;
  box: PdfBox;
  logos: PdfLogo[];
};

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('logo'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function jpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error('jpeg'));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', 0.92);
  });
}

async function rasterLogo(svg: string, name: string, heightPt: number, aspect: number): Promise<PdfLogo> {
  const image = await loadSvg(svg);
  const height = Math.max(1, Math.round(heightPt * 3));
  const width = Math.max(1, Math.round(height * aspect));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { name, jpeg: await jpegBytes(canvas), width, height };
}

let logosPromise: Promise<PdfLogo[]> | null = null;

function loadLogos(headerH: number, footerH: number) {
  logosPromise ??= Promise.all([
    rasterLogo(HEADER_LOGO, 'SsLogo', headerH, SPATIAL_SENSE_LOGO_ASPECT),
    rasterLogo(FOOTER_MARK, 'KfLogo', footerH, KODIFLY_FOOTER_LOGO_ASPECT),
  ]);
  return logosPromise;
}

function imageOp(name: string, x: number, y: number, width: number, height: number) {
  return `q ${n(width)} 0 0 ${n(height)} ${n(x)} ${n(y)} cm /${name} Do Q`;
}

function pdfLabel(label: string, maxWidth: number, size: number) {
  const clean = label.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
  let text = clean;
  while (text.length > 1 && (text.length + 3) * size * 0.5 > maxWidth) text = text.slice(0, -1);
  const shown = text.length < clean.length ? `${text}...` : text;
  return shown.replace(/[\\()]/g, '\\$&');
}

/** Header and footer for one drawing page, and the box left for the sheet. */
export async function pdfBrand(pageWidth: number, pageHeight: number, label = ''): Promise<PdfBrand> {
  const accentH = 1.6 * MM;
  const accentY = pageHeight - 10 * MM - accentH;
  const headerH = 9 * MM;
  const headerY = accentY - 6 * MM - headerH;
  const headerRuleY = headerY - 6 * MM;
  const footerRuleY = 32 * MM;
  const footerH = 7 * MM;
  const footerW = footerH * KODIFLY_FOOTER_LOGO_ASPECT;
  const footerY = (footerRuleY - footerH) / 2;
  const footerBaseline = footerY + footerH * 0.32;
  const headerW = headerH * SPATIAL_SENSE_LOGO_ASPECT;
  const logos = await loadLogos(headerH, footerH).catch(() => [] as PdfLogo[]);
  const year = new Date().getFullYear();
  const notice = `© Copyright ${year} Kodifly. All rights reserved.`;
  const pageLabel = 'Page 1 of 1';
  const noticeWidth = notice.length * 0.5 * 8;
  const pageLabelWidth = pageLabel.length * 0.5 * 8;
  const nameSize = 9;
  const nameRoom = pageWidth - 2 * MARGIN_X - headerW - 10 * MM;
  const name = nameRoom > 80 ? pdfLabel(label, nameRoom, nameSize) : '';
  const nameWidth = name.length * nameSize * 0.5;
  const operators = [
    `${BAND} rg 0 ${n(headerRuleY)} ${n(pageWidth)} ${n(pageHeight - headerRuleY)} re f`,
    `${BAND} rg 0 0 ${n(pageWidth)} ${n(footerRuleY)} re f`,
    `${ACCENT} rg ${n(MARGIN_X)} ${n(accentY)} ${n(pageWidth - 2 * MARGIN_X)} ${n(accentH)} re f`,
    `${RULE} RG 0.6 w`,
    `${n(MARGIN_X)} ${n(headerRuleY)} m ${n(pageWidth - MARGIN_X)} ${n(headerRuleY)} l S`,
    `${n(MARGIN_X)} ${n(footerRuleY)} m ${n(pageWidth - MARGIN_X)} ${n(footerRuleY)} l S`,
    logos.some((logo) => logo.name === 'SsLogo') ? imageOp('SsLogo', MARGIN_X, headerY, headerW, headerH) : '',
    name ? `BT /F1 ${nameSize} Tf ${MUTED} rg ${n(pageWidth - MARGIN_X - nameWidth)} ${n(headerY + headerH * 0.34)} Td (${name}) Tj ET` : '',
    logos.some((logo) => logo.name === 'KfLogo') ? imageOp('KfLogo', MARGIN_X, footerY, footerW, footerH) : '',
    `BT /F1 8 Tf ${MUTED} rg ${n(pageWidth / 2 - noticeWidth / 2)} ${n(footerBaseline)} Td (${notice.replace('©', '\\251')}) Tj ET`,
    `BT /F1 8 Tf ${MUTED} rg ${n(pageWidth - MARGIN_X - pageLabelWidth)} ${n(footerBaseline)} Td (${pageLabel}) Tj ET`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    operators,
    logos,
    box: {
      left: MARGIN_X,
      bottom: footerRuleY + 6 * MM,
      width: pageWidth - 2 * MARGIN_X,
      height: headerRuleY - 6 * MM - (footerRuleY + 6 * MM),
    },
  };
}
