/**
 * Reads a text (ASCII) DXF file in plain TypeScript. DXF is an open, documented format of
 * `group code / value` line pairs, so it needs no WebAssembly. The result uses the same field
 * names as LibreDWG's database (angles in radians) so `extract.ts` handles both alike.
 */
import type { DrawingSource, SourceEntity } from './source';

type Pair = [code: number, value: string];
type Fields = Record<string, unknown> & SourceEntity;

const CHUNK_BYTES = 8 * 1024 * 1024;
const RADIANS = Math.PI / 180;
const CODE_PAGES: Record<string, string> = {
  ANSI_932: 'shift_jis',
  ANSI_936: 'gbk',
  ANSI_949: 'euc-kr',
  ANSI_950: 'big5',
  ANSI_874: 'windows-874',
  ...Object.fromEntries([1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258].map((n) => [`ANSI_${n}`, `windows-${n}`])),
};

/** DXF from AutoCAD 2007 on is UTF-8; older files use the code page named in their header. */
function encodingOf(buffer: ArrayBuffer) {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 65536));
  const version = /\$ACADVER\s+1\s+(AC\d{4})/.exec(head)?.[1] ?? 'AC1009';
  if (version >= 'AC1021') return 'utf-8';
  return CODE_PAGES[/\$DWGCODEPAGE\s+3\s+(\S+)/.exec(head)?.[1]?.toUpperCase() ?? ''] ?? 'windows-1252';
}

/** Yields the file's group-code pairs, decoding it a chunk at a time to keep memory flat. */
function* pairsOf(buffer: ArrayBuffer): Generator<Pair> {
  const decoder = new TextDecoder(encodingOf(buffer));
  let rest = '';
  let code: number | null = null;
  for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_BYTES) {
    const last = offset + CHUNK_BYTES >= buffer.byteLength;
    const text = rest + decoder.decode(buffer.slice(offset, offset + CHUNK_BYTES), { stream: !last });
    const lines = text.split('\n');
    rest = last ? '' : lines.pop()!;
    for (const raw of lines) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (code === null) code = parseInt(line, 10);
      else {
        if (!Number.isNaN(code)) yield [code, line];
        code = null;
      }
    }
  }
}

const first = (pairs: Pair[], code: number) => pairs.find((pair) => pair[0] === code)?.[1];
const num = (pairs: Pair[], code: number, fallback = 0) => {
  const value = Number(first(pairs, code));
  return Number.isFinite(value) ? value : fallback;
};
const all = (pairs: Pair[], code: number) => pairs.filter((pair) => pair[0] === code).map((pair) => Number(pair[1]));
const point = (pairs: Pair[], xCode: number) => ({ x: num(pairs, xCode), y: num(pairs, xCode + 10) });
/** Every `(x, y)` point of one kind, each with the bulge (code 42) that follows it, if any. */
function points(pairs: Pair[], xCode: number) {
  const out: Array<{ x: number; y: number; bulge: number }> = [];
  for (const [code, value] of pairs) {
    const current = out[out.length - 1];
    if (code === xCode) out.push({ x: Number(value), y: 0, bulge: 0 });
    else if (current && code === xCode + 10) current.y = Number(value);
    else if (current && code === 42) current.bulge = Number(value);
  }
  return out;
}

/** HATCH boundaries are positional, so they are read in file order from the path count (code 91). */
function hatchPaths(pairs: Pair[]) {
  let at = pairs.findIndex((pair) => pair[0] === 91);
  if (at < 0) return [];
  const take = (code: number) => {
    while (at < pairs.length && pairs[at]![0] !== code) at++;
    return at < pairs.length ? Number(pairs[at++]![1]) : 0;
  };
  const takePoint = (xCode: number) => ({ x: take(xCode), y: take(xCode + 10) });
  const bulgeNext = () => (pairs[at]?.[0] === 42 ? Number(pairs[at++]![1]) : 0);
  const paths: Array<Record<string, unknown>> = [];
  for (let remaining = take(91); remaining > 0 && at < pairs.length; remaining--) {
    const flag = take(92);
    if (flag & 2) {
      take(72);
      take(73);
      const vertices = Array.from({ length: take(93) }, () => ({ ...takePoint(10), bulge: bulgeNext() }));
      paths.push({ boundaryPathTypeFlag: flag, vertices });
    } else {
      const edges = Array.from({ length: take(93) }, () => {
        const type = take(72);
        if (type === 1) return { type, start: takePoint(10), end: takePoint(11) };
        if (type === 2) {
          return { type, center: takePoint(10), radius: take(40), startAngle: take(50) * RADIANS, endAngle: take(51) * RADIANS, isCCW: take(73) === 1 };
        }
        if (type === 3) {
          return { type, center: takePoint(10), end: takePoint(11), lengthOfMinorAxis: take(40), startAngle: take(50) * RADIANS, endAngle: take(51) * RADIANS, isCCW: take(73) === 1 };
        }
        const degree = take(94);
        take(73);
        take(74);
        const knotCount = take(95);
        const controlCount = take(96);
        const knots = Array.from({ length: knotCount }, () => take(40));
        const controlPoints = Array.from({ length: controlCount }, () => ({ ...takePoint(10), weight: bulgeNext() || 1 }));
        return { type, degree, knots, controlPoints };
      });
      paths.push({ boundaryPathTypeFlag: flag, edges });
    }
    for (let sources = pairs[at]?.[0] === 97 ? take(97) : 0; sources > 0; sources--) take(330);
  }
  return paths;
}

function entityOf(type: string, pairs: Pair[]): Fields {
  const trueColor = first(pairs, 420);
  const base: Fields = {
    type,
    layer: first(pairs, 8) ?? '0',
    colorIndex: num(pairs, 62, 256),
    color: trueColor === undefined ? undefined : Number(trueColor),
    isVisible: num(pairs, 60) !== 1,
    isInPaperSpace: num(pairs, 67) === 1,
    extrusionDirection: { z: num(pairs, 230, 1) },
  };
  const textFields = (verticalCode: number) => ({
    text: first(pairs, 1) ?? '',
    startPoint: point(pairs, 10),
    endPoint: first(pairs, 11) === undefined ? undefined : point(pairs, 11),
    textHeight: num(pairs, 40, 1),
    rotation: num(pairs, 50) * RADIANS,
    halign: num(pairs, 72),
    valign: num(pairs, verticalCode),
  });
  switch (type) {
    case 'LINE':
      return { ...base, startPoint: point(pairs, 10), endPoint: point(pairs, 11) };
    case 'LWPOLYLINE':
      return { ...base, flag: num(pairs, 70), vertices: points(pairs, 10) };
    case 'POLYLINE':
      return { ...base, type: 'POLYLINE2D', flag: num(pairs, 70), vertices: [] };
    case 'VERTEX':
      return { ...base, ...point(pairs, 10), bulge: num(pairs, 42), flag: num(pairs, 70) };
    case 'CIRCLE':
      return { ...base, center: point(pairs, 10), radius: num(pairs, 40) };
    case 'ARC':
      return { ...base, center: point(pairs, 10), radius: num(pairs, 40), startAngle: num(pairs, 50) * RADIANS, endAngle: num(pairs, 51) * RADIANS };
    case 'ELLIPSE':
      return { ...base, center: point(pairs, 10), majorAxisEndPoint: point(pairs, 11), axisRatio: num(pairs, 40, 1), startAngle: num(pairs, 41), endAngle: num(pairs, 42, Math.PI * 2) };
    case 'SPLINE': {
      const weights = all(pairs, 41);
      return { ...base, flag: num(pairs, 70), degree: num(pairs, 71, 3), knots: all(pairs, 40), weights: weights.length ? weights : undefined, controlPoints: points(pairs, 10), fitPoints: points(pairs, 11) };
    }
    case 'TEXT':
      return { ...base, ...textFields(73) };
    case 'ATTRIB':
    case 'ATTDEF':
      return { ...base, ...textFields(74), flags: num(pairs, 70) };
    case 'MTEXT': {
      const text = pairs.filter((pair) => pair[0] === 3).map((pair) => pair[1]).join('') + (first(pairs, 1) ?? '');
      return { ...base, text, insertionPoint: point(pairs, 10), textHeight: num(pairs, 40, 1), rectWidth: num(pairs, 41), attachmentPoint: num(pairs, 71, 1), direction: first(pairs, 11) === undefined ? undefined : point(pairs, 11), rotation: num(pairs, 50) * RADIANS };
    }
    case 'INSERT':
      return { ...base, name: first(pairs, 2) ?? '', insertionPoint: point(pairs, 10), xScale: num(pairs, 41, 1), yScale: num(pairs, 42, 1), rotation: num(pairs, 50) * RADIANS, columnCount: num(pairs, 70, 1), rowCount: num(pairs, 71, 1), columnSpacing: num(pairs, 44), rowSpacing: num(pairs, 45), attribs: [] };
    case 'DIMENSION':
      return { ...base, name: first(pairs, 2) ?? '' };
    case 'SOLID':
    case 'TRACE':
    case '3DFACE':
      return { ...base, corner1: point(pairs, 10), corner2: point(pairs, 11), corner3: point(pairs, 12), corner4: first(pairs, 13) === undefined ? undefined : point(pairs, 13) };
    case 'LEADER':
      return { ...base, vertices: points(pairs, 10) };
    case 'HATCH':
      return { ...base, solidFill: num(pairs, 70), boundaryPaths: hatchPaths(pairs) };
    case 'VIEWPORT':
      return { ...base, viewportCenter: point(pairs, 10), width: num(pairs, 40), height: num(pairs, 41), viewportId: num(pairs, 69), statusBitFlags: num(pairs, 90), displayCenter: point(pairs, 12), viewDirection: point(pairs, 16), targetPoint: point(pairs, 17), viewHeight: num(pairs, 45), viewTwistAngle: num(pairs, 51) * RADIANS };
    default:
      return base;
  }
}

export function parseDxf(buffer: ArrayBuffer): DrawingSource {
  const header: DrawingSource['header'] = {};
  const layers: DrawingSource['tables']['LAYER']['entries'] = [];
  const blocks = new Map<string, DrawingSource['tables']['BLOCK_RECORD']['entries'][number]>();
  const blockNamed = (name: string) => {
    let block = blocks.get(name);
    if (!block) blocks.set(name, (block = { name, handle: name, basePoint: { x: 0, y: 0 }, entities: [] }));
    return block;
  };
  const model = blockNamed('*Model_Space');

  let section = '';
  let variable = '';
  let type = '';
  let pairs: Pair[] = [];
  let block: SourceEntity[] | null = null;
  /** The POLYLINE or INSERT whose VERTEX / ATTRIB records are being read, until SEQEND. */
  let owner: Fields | null = null;

  const finish = () => {
    if (!type) return;
    if (section === 'TABLES' && type === 'LAYER') {
      const aci = num(pairs, 62, 7);
      const trueColor = first(pairs, 420);
      layers.push({
        name: first(pairs, 2) ?? '0',
        colorIndex: Math.abs(aci),
        trueColor: trueColor === undefined ? undefined : Number(trueColor),
        lineType: first(pairs, 6) ?? 'Continuous',
        off: aci < 0,
        frozen: (num(pairs, 70) & 1) === 1,
      });
    } else if (section === 'BLOCKS' && type === 'BLOCK') {
      const record = blockNamed(first(pairs, 2) ?? '');
      record.basePoint = point(pairs, 10);
      block = record.entities;
    } else if (section === 'BLOCKS' && type === 'ENDBLK') {
      block = null;
    } else if (section === 'ENTITIES' || (section === 'BLOCKS' && block)) {
      const entity = entityOf(type, pairs);
      if (type === 'SEQEND') owner = null;
      else if (owner && type === 'VERTEX') {
        // Bit 16 marks a spline's control frame, which AutoCAD does not draw.
        if (!(Number(entity.flag) & 16)) (owner.vertices as Fields[]).push(entity);
      } else if (owner && type === 'ATTRIB') (owner.attribs as Fields[]).push(entity);
      else {
        owner = type === 'POLYLINE' || (type === 'INSERT' && num(pairs, 66) === 1) ? entity : null;
        (block ?? (entity.isInPaperSpace ? blockNamed('*Paper_Space').entities : model.entities)).push(entity);
      }
    }
  };

  for (const [code, value] of pairsOf(buffer)) {
    if (code === 0) {
      finish();
      type = value.trim();
      pairs = [];
      if (type === 'SECTION' || type === 'ENDSEC') {
        section = '';
        type = '';
      }
    } else if (!section && code === 2) {
      section = value.trim();
    } else if (section === 'HEADER') {
      if (code === 9) variable = value.trim();
      else if (variable === '$INSUNITS' && code === 70) header.INSUNITS = Number(value);
      else if (variable === '$EXTMIN' || variable === '$EXTMAX') {
        const target = (header[variable === '$EXTMIN' ? 'EXTMIN' : 'EXTMAX'] ??= { x: 0, y: 0 });
        if (code === 10) target.x = Number(value);
        else if (code === 20) target.y = Number(value);
      }
    } else if (type) {
      pairs.push([code, value]);
    }
  }
  finish();
  return { header, tables: { LAYER: { entries: layers }, BLOCK_RECORD: { entries: [...blocks.values()] } }, objects: { LAYOUT: [] } };
}
