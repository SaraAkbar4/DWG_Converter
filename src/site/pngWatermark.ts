import { KODIFLY_FOOTER_LOGO_ASPECT, KODIFLY_FOOTER_LOGO_SVG } from './kodiflyFooterLogo';
import { SPATIAL_SENSE_LOGO_ASPECT, SPATIAL_SENSE_LOGO_SVG } from './spatialSenseLogo';

const HEADER_LOGO = SPATIAL_SENSE_LOGO_SVG.replaceAll('fill="#FFFFFF"', 'fill="#14181F"');
const FOOTER_LOGO = KODIFLY_FOOTER_LOGO_SVG.replaceAll('fill-opacity="0.45"', 'fill-opacity="0.92"');

const PAPER = '#f8fafc';
const ACCENT = '#1e80e8';
const RULE = '#d1d5db';
const MUTED = '#6b7280';

function loadLogo(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

let logos: Promise<[HTMLImageElement | null, HTMLImageElement | null]> | null = null;

function loadLogos() {
  logos ??= Promise.all([loadLogo(HEADER_LOGO), loadLogo(FOOTER_LOGO)]);
  return logos;
}

function fitLabel(context: CanvasRenderingContext2D, label: string, maxWidth: number) {
  if (context.measureText(label).width <= maxWidth) return label;
  let text = label;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return text.length > 1 ? `${text}…` : '';
}

/** Puts the cropped view between a SpatialSense header and a Kodifly footer. */
export async function frameExportPng(source: HTMLCanvasElement, label: string): Promise<HTMLCanvasElement> {
  const [header, footer] = await loadLogos();
  const scale = Math.min(2.4, Math.max(0.9, Math.max(source.width, source.height) / 1200));
  const margin = Math.round(28 * scale);
  const accentH = Math.max(4, Math.round(6 * scale));
  const headerH = Math.round(86 * scale);
  const footerH = Math.round(72 * scale);
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height + headerH + footerH;
  const context = out.getContext('2d');
  if (!context) return source;

  context.fillStyle = PAPER;
  context.fillRect(0, 0, out.width, out.height);
  context.fillStyle = ACCENT;
  context.fillRect(margin, Math.round(14 * scale), out.width - margin * 2, accentH);

  const logoH = Math.round(30 * scale);
  const logoW = logoH * SPATIAL_SENSE_LOGO_ASPECT;
  const logoY = accentH + Math.round(14 * scale) + (headerH - accentH - Math.round(14 * scale) - logoH) / 2;
  if (header) context.drawImage(header, margin, logoY, logoW, logoH);

  context.font = `500 ${Math.round(15 * scale)}px Helvetica, Arial, sans-serif`;
  context.fillStyle = MUTED;
  context.textBaseline = 'middle';
  const labelRoom = out.width - margin * 2 - logoW - Math.round(24 * scale);
  const fitted = labelRoom > 40 ? fitLabel(context, label, labelRoom) : '';
  if (fitted) context.fillText(fitted, out.width - margin - context.measureText(fitted).width, logoY + logoH / 2);

  context.strokeStyle = RULE;
  context.lineWidth = Math.max(1, scale);
  context.beginPath();
  context.moveTo(margin, headerH - context.lineWidth);
  context.lineTo(out.width - margin, headerH - context.lineWidth);
  context.stroke();

  context.drawImage(source, 0, headerH);

  const footerTop = headerH + source.height;
  context.beginPath();
  context.moveTo(margin, footerTop + context.lineWidth);
  context.lineTo(out.width - margin, footerTop + context.lineWidth);
  context.stroke();

  const markH = Math.round(18 * scale);
  const markW = markH * KODIFLY_FOOTER_LOGO_ASPECT;
  const markY = footerTop + (footerH - markH) / 2;
  if (footer) context.drawImage(footer, margin, markY, markW, markH);

  const notice = `© Copyright ${new Date().getFullYear()} Kodifly. All rights reserved.`;
  const noticeSize = Math.round(13 * scale);
  context.font = `500 ${noticeSize}px Helvetica, Arial, sans-serif`;
  context.fillStyle = MUTED;
  const noticeGap = Math.round(16 * scale);
  const noticeLeft = margin + markW + noticeGap;
  const noticeRight = out.width - margin;
  const fittedNotice = fitLabel(context, notice, Math.max(0, noticeRight - noticeLeft));
  if (fittedNotice) {
    const noticeWidth = context.measureText(fittedNotice).width;
    const centered = out.width / 2 - noticeWidth / 2;
    const x = centered >= noticeLeft ? centered : noticeLeft;
    context.fillText(fittedNotice, x, footerTop + footerH / 2);
  }
  return out;
}
