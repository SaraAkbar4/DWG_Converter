import type { FailureCode } from './protocol';

export class PdfExtractFailure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfExtractFailure';
  }
}

/** True when `%PDF-` sits somewhere in the first 1024 bytes. */
export async function isPdf(file: File): Promise<boolean> {
  const head = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  return head.includes('%PDF-');
}

/** AutoCAD R13 and later. Same cut the DWG reader uses. */
function isSupportedDwg(bytes: Uint8Array): boolean {
  const version = /^AC\d{4}/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 6)))?.[0];
  return version !== undefined && version >= 'AC1012';
}

function dwgName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'drawing';
  return /\.dwg$/i.test(base) ? base : `${base}.dwg`;
}

type Pdfjs = typeof import('pdfjs-dist');
type PdfDocument = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;

let pdfjsPromise: Promise<Pdfjs> | null = null;

/** Standard 14 fonts are served with the site so text in older PDFs can be read. */
export const PDF_OPTIONS = { standardFontDataUrl: '/pdfjs/standard_fonts/', disableFontFace: true } as const;

/** Loaded only when a PDF is opened, and parsed on this thread so no worker file is published. */
export function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.mjs')) as { WorkerMessageHandler: unknown };
    (globalThis as { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
      WorkerMessageHandler: worker.WorkerMessageHandler,
    };
    return pdfjs;
  })();
  return pdfjsPromise;
}

function asFailure(error: unknown, pdfjs: Pdfjs): PdfExtractFailure {
  if (error instanceof PdfExtractFailure) return error;
  if (error instanceof pdfjs.PasswordException) {
    return new PdfExtractFailure('unsupported', 'This PDF is password-protected, so the drawing inside could not be read.');
  }
  return new PdfExtractFailure('corrupt', 'This PDF could not be read.');
}

/** DWG drawings embedded in a PDF. Attachments that are not a supported DWG are ignored. */
export async function extractEmbeddedDwgs(file: File): Promise<File[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, ...PDF_OPTIONS });
  let doc: PdfDocument | undefined;
  try {
    doc = await task.promise;
    const attachments = await doc.getAttachments();
    if (!attachments?.size) return [];
    const drawings: File[] = [];
    for (const [id, attachment] of attachments) {
      const content = await doc.getAttachmentContent(id);
      // Copy before the document is destroyed; pdf.js reuses the underlying buffer.
      if (!content || !isSupportedDwg(content)) continue;
      drawings.push(new File([content.slice()], dwgName(attachment.filename)));
    }
    return drawings;
  } catch (error) {
    throw asFailure(error, pdfjs);
  } finally {
    await doc?.cleanup().catch(() => undefined);
    await task.destroy().catch(() => undefined);
  }
}
