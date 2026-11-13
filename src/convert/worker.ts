/// <reference lib="webworker" />
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import { parseDxf } from './dxf';
import { EmptyDrawingError, extractDrawings } from './extract';
import type { FailureCode, FileInfo, WorkerMessage, WorkerRequest } from './protocol';

const DWG_VERSIONS: Record<string, string> = {
  AC1012: 'AutoCAD R13',
  AC1014: 'AutoCAD R14',
  AC1015: 'AutoCAD 2000',
  AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007',
  AC1024: 'AutoCAD 2010',
  AC1027: 'AutoCAD 2013',
  AC1032: 'AutoCAD 2018+',
};
const SUPPORTED = 'Supported: DWG from AutoCAD R13 to 2018+ and text (ASCII) DXF.';

class Failure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
  }
}

const post = (message: WorkerMessage) => self.postMessage(message);

/** Detects the format from the file's first bytes, never from its extension. */
function sniff(buffer: ArrayBuffer): Pick<FileInfo, 'format' | 'version'> {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 4096));
  const dwg = /^AC\d{4}/.exec(head)?.[0];
  if (dwg) {
    if (dwg < 'AC1012') throw new Failure('unsupported', `This DWG is older than AutoCAD R13 (${dwg}). ${SUPPORTED}`);
    return { format: 'DWG', version: DWG_VERSIONS[dwg] ?? dwg };
  }
  if (head.startsWith('AutoCAD Binary DXF')) throw new Failure('unsupported', `Binary DXF files are not supported yet. ${SUPPORTED}`);
  if (head.startsWith('PK')) throw new Failure('unsupported', 'This is a zip archive. Unzip it and open the DWG or DXF inside.');
  if (/^\s*(0|999)\s*\r?\n/.test(head) && /SECTION|EOF/.test(head)) {
    const version = /\$ACADVER\s+1\s+(AC\d{4})/.exec(head)?.[1];
    return { format: 'DXF', version: version ? (DWG_VERSIONS[version] ?? version) : null };
  }
  throw new Failure('unsupported', `This does not look like a DWG or DXF drawing. ${SUPPORTED}`);
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    post({ type: 'stage', stage: 'reading' });
    const kind = sniff(data.buffer);
    const size = data.buffer.byteLength;
    post({ type: 'stage', stage: 'parsing' });
    let database;
    if (kind.format === 'DXF') {
      database = parseDxf(data.buffer);
    } else {
      // The WebAssembly engine is fetched only when a DWG is opened.
      const engine = await LibreDwg.create('/wasm');
      const pointer = engine.dwg_read_data(data.buffer, Dwg_File_Type.DWG);
      if (!pointer) throw new Failure('corrupt', 'This file is damaged or incomplete, so it could not be read.');
      database = engine.convert(pointer);
      engine.dwg_free(pointer);
    }

    post({ type: 'stage', stage: 'building' });
    const sheets = extractDrawings(database);
    post({ type: 'stage', stage: 'rendering' });
    post({ type: 'done', sheets, info: { name: data.name, size, ...kind } });
  } catch (error) {
    const code = error instanceof Failure ? error.code : error instanceof EmptyDrawingError ? 'empty' : 'corrupt';
    const message =
      error instanceof Failure || error instanceof EmptyDrawingError
        ? error.message
        : 'This file could not be read. It may be damaged, password-protected or in an unsupported format.';
    post({ type: 'error', code, message });
  }
};
