import { useCallback, useEffect, useRef, useState } from 'react';
import { PdfExtractFailure, extractEmbeddedDwgs, isPdf } from './pdfEmbed';
import { extractPdfVectors } from './pdfVector';
import type { FailureCode, FileInfo, Sheet, Stage, WorkerMessage, WorkerRequest } from './protocol';
import { unzipDrawings } from './unzip';

const MB = 1024 * 1024;
/** Both formats stop at 50 MB. Larger drawings are refused before they are read. */
const FILE_LIMIT = 50 * MB;
const LIMITS = { desktop: { dwg: FILE_LIMIT, dxf: FILE_LIMIT, open: 8 }, mobile: { dwg: FILE_LIMIT, dxf: FILE_LIMIT, open: 3 } };

export type DrawingDoc = { sheets: Sheet[]; info: FileInfo };
export type DrawingLoading = { fileName: string; stage: Stage };
export type DrawingFailure = { fileName: string; code: FailureCode; message: string };

class Failure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
  }
}

function deviceLimits() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return LIMITS[/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || memory <= 4 ? 'mobile' : 'desktop'];
}

/** Opens drawings one at a time in a Web Worker and keeps them as open documents. */
export function useDrawingFiles() {
  const [docs, setDocs] = useState<DrawingDoc[]>([]);
  const [loading, setLoading] = useState<DrawingLoading | null>(null);
  const [error, setError] = useState<DrawingFailure | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef(0);
  const countRef = useRef(0);
  countRef.current = docs.length;

  const cancel = useCallback(() => {
    runRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    setLoading(null);
  }, []);
  useEffect(() => cancel, [cancel]);

  const parse = (file: File, onStage: (stage: Stage) => void) =>
    new Promise<DrawingDoc>((resolve, reject) => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.type === 'stage') onStage(data.stage);
        else if (data.type === 'done') resolve({ sheets: data.sheets, info: data.info });
        else reject(new Failure(data.code, data.message));
      };
      // A worker that dies outright (usually out of memory) reports nothing else.
      worker.onerror = () =>
        reject(new Failure('crashed', 'The browser ran out of memory while opening this drawing. Close other tabs and try again, or try a smaller file.'));
      void file.arrayBuffer().then((buffer) => worker.postMessage({ name: file.name, buffer } satisfies WorkerRequest, [buffer]));
    }).finally(() => workerRef.current?.terminate());

  const open = useCallback(
    async (picked: File[]) => {
      cancel();
      const run = runRef.current;
      setError(null);
      const limits = deviceLimits();
      const files: File[] = [];
      const ready: DrawingDoc[] = [];
      let blocked: DrawingFailure | null = null;
      let emptyContainer: DrawingFailure | null = null;
      for (const file of picked) {
        if (run !== runRef.current) return;
        try {
          if (/\.zip$/i.test(file.name)) {
            const drawings = await unzipDrawings(file);
            if (run !== runRef.current) return;
            if (!drawings.length && !emptyContainer) {
              emptyContainer = { fileName: file.name, code: 'unsupported', message: 'This zip archive has no DWG or DXF drawing inside.' };
            }
            files.push(...drawings);
            continue;
          }
          if (await isPdf(file)) {
            if (run !== runRef.current) return;
            if (file.size > limits.dwg) {
              throw new Failure('too_large', `This drawing is ${Math.round(file.size / MB)} MB. On this device the browser can open up to about ${Math.round(limits.dwg / MB)} MB.`);
            }
            setLoading({ fileName: file.name, stage: 'reading' });
            const drawings = await extractEmbeddedDwgs(file);
            if (run !== runRef.current) return;
            if (drawings.length) {
              files.push(...drawings);
              continue;
            }
            // No DWG attached: convert what the PDF paints. A scan with no vectors is refused here.
            setLoading({ fileName: file.name, stage: 'parsing' });
            const converted = await extractPdfVectors(file);
            if (run !== runRef.current) return;
            ready.push(converted);
            continue;
          }
          files.push(file);
        } catch (failure) {
          if (run !== runRef.current) return;
          blocked =
            failure instanceof Failure || failure instanceof PdfExtractFailure
              ? { fileName: file.name, code: failure.code, message: failure.message }
              : { fileName: file.name, code: 'corrupt', message: 'This file could not be opened.' };
        }
      }
      if (run !== runRef.current) return;
      if (ready.length) {
        const room = Math.max(0, limits.open - countRef.current);
        setDocs((current) => [...current, ...ready.slice(0, room)]);
        if (ready.length > room) blocked ??= { fileName: ready[room]!.info.name, code: 'too_large', message: `Up to ${limits.open} drawings can be open at once on this device. Close one to open another.` };
      }
      if (blocked) setError(blocked);
      else if (!files.length && emptyContainer) setError(emptyContainer);
      else if (!files.length && !ready.length && picked.length) {
        setError({ fileName: picked[0]?.name ?? '', code: 'unsupported', message: 'This zip archive has no DWG or DXF drawing inside.' });
      }
      for (const [index, file] of files.entries()) {
        if (run !== runRef.current) return;
        try {
          if (countRef.current + index >= limits.open) {
            throw new Failure('too_large', `Up to ${limits.open} drawings can be open at once on this device. Close one to open another.`);
          }
          const limit = /\.dxf$/i.test(file.name) ? limits.dxf : limits.dwg;
          if (file.size > limit) {
            throw new Failure('too_large', `This drawing is ${Math.round(file.size / MB)} MB. On this device the browser can open up to about ${Math.round(limit / MB)} MB.`);
          }
          setLoading({ fileName: file.name, stage: 'reading' });
          const doc = await parse(file, (stage) => run === runRef.current && setLoading({ fileName: file.name, stage }));
          if (run !== runRef.current) return;
          setDocs((current) => [...current, doc]);
        } catch (failure) {
          if (run !== runRef.current) return;
          const known = failure instanceof Failure;
          setError({
            fileName: file.name,
            code: known ? failure.code : 'corrupt',
            message: known ? failure.message : 'This file could not be opened.',
          });
        }
      }
      if (run === runRef.current) setLoading(null);
    },
    [cancel],
  );

  const close = useCallback((index: number) => setDocs((current) => current.filter((_, i) => i !== index)), []);
  const closeAll = useCallback(() => setDocs([]), []);
  /** Sets the real-world size of one sheet, for PDFs whose plot scale could not be read. */
  const setScale = useCallback(
    (docIndex: number, sheetIndex: number, metersPerUnit: number) =>
      setDocs((current) =>
        current.map((doc, i) =>
          i !== docIndex
            ? doc
            : { ...doc, sheets: doc.sheets.map((sheet, j) => (j !== sheetIndex ? sheet : { ...sheet, drawing: { ...sheet.drawing, meters_per_unit: metersPerUnit, units: 'mm' } })) },
        ),
      ),
    [],
  );
  return { docs, loading, error, open, close, closeAll, cancel, setScale, dismissError: useCallback(() => setError(null), []) };
}
