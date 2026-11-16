/** A tiny PDF 1.4 file. `payload` is one embedded file; omit it for a PDF with no attachments. */
export function pdfBytes(name: string, payload?: string): Uint8Array {
  const page = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 3 3] >>';
  const objects = payload
    ? [
        '<< /Type /Catalog /Pages 2 0 R /Names 3 0 R >>',
        '<< /Type /Pages /Count 1 /Kids [7 0 R] >>',
        '<< /EmbeddedFiles 4 0 R >>',
        `<< /Names [(${name}) 5 0 R] >>`,
        `<< /Type /Filespec /F (${name}) /EF << /F 6 0 R >> >>`,
        `<< /Type /EmbeddedFile /Length ${payload.length} >>\nstream\n${payload}\nendstream`,
        page,
      ]
    : ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', page];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function assemble(objects: string[]): Uint8Array {
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** A one-page PDF that paints a small plan: a wall outline, a door arc and a grid of lines. */
export function vectorPdfBytes(): Uint8Array {
  const lines: string[] = ['0 0 1 RG 1 w', '50 50 m 350 50 l 350 250 l 50 250 l h S', '0.6 0 0 RG 150 50 m 150 120 l S'];
  for (let i = 0; i < 24; i++) lines.push(`0.5 G ${60 + i * 12} 60 m ${60 + i * 12} 240 l S`);
  for (let i = 0; i < 8; i++) lines.push(`${70 + i * 20} 60 m ${330} ${60 + i * 20} l S`);
  lines.push('0 0 1 rg 200 150 m 240 150 l 240 190 l 200 190 l h f');
  lines.push('BT /F1 10 Tf 60 230 Td (LIVING ROOM) Tj ET');
  const content = lines.join('\n');
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

/** A one-page PDF whose only content is a 2x2 grey image, like a scanned sheet. */
export function scanPdfBytes(): Uint8Array {
  const content = 'q 400 0 0 300 0 0 cm /Im1 Do Q';
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\u0080\u0090\u00a0\u00b0\nendstream',
  ]);
}
