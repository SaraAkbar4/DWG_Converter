/**
 * Turns a parsed DWG/DXF database into the vector JSON the CAD viewer draws.
 * TypeScript port of `cad_floor_plan/extract.py` (ss-ifc-to-3d-tiles): blocks are
 * exploded so every leaf entity is selectable, each keeping its block path.
 */
import type { DrawingSource, SourceEntity } from './source';
import type { CadDrawing, CadEntity, CadGridLabel, CadLayer, CadRoom, CadText } from '../cad/types';
import { aciHex, rgbHex } from './aci';
import { clipPolygon, clipPolyline, pointInRect, type Rect } from './clip';
import { arcPoints, bulgePoints, ellipsePoints, splinePoints, type Point } from './curves';
import { mtextParagraphAlign, parseRoomTag, plainMText, plainText } from './text';

/** 2D affine: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number];
type Shape = Record<string, unknown>;
type Parent = { names: string[]; layer: string; color: string; depth: number; clip?: Rect };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const FLIP_X: Matrix = [-1, 0, 0, 1, 0, 0];
const VIEWPORT_OFF = 131072;
const MAX_BLOCK_DEPTH = 16;
const FLATTEN_TOLERANCE_RATIO = 1e-4;
const EXTENTS_PADDING_RATIO = 0.02;
const OUTLIER_QUANTILE = 0.02;
const BLOCK_PATH_SEPARATOR = ' › ';
const TEXT_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB']);
const SKIPPED_TYPES = new Set(['POINT', 'VIEWPORT', 'IMAGE', 'WIPEOUT', 'OLE2FRAME', 'ATTDEF']);
const INSUNITS: Record<number, [string, number | null]> = {
  0: ['unitless', null],
  1: ['in', 0.0254],
  2: ['ft', 0.3048],
  4: ['mm', 0.001],
  5: ['cm', 0.01],
  6: ['m', 1],
  7: ['km', 1000],
  14: ['dm', 0.1],
};
const LEVEL_RE = /^\s*(level|floor|lvl)\s*[-_ ]?\s*[0-9A-Z]{1,4}\s*$/i;
const GRID_LABEL_RE = /^[A-Z]{1,2}'?$|^\d{1,2}[a-z']?$/;
const H_ALIGN = ['left', 'center', 'right'] as const;
const V_ALIGN = ['top', 'middle', 'bottom'] as const;

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const xy = (p: unknown): Point => {
  const point = (p ?? {}) as { x: number; y: number };
  return [point.x ?? 0, point.y ?? 0];
};
/** Entities drawn in a mirrored object coordinate system carry extrusion z < 0. */
const ocs = (m: Matrix, e: Shape): Matrix =>
  ((e.extrusionDirection as { z?: number } | undefined)?.z ?? 1) < 0 ? multiply(m, FLIP_X) : m;

export type ExtractResult = { name: string; drawing: CadDrawing };

export class EmptyDrawingError extends Error {}

export function extractDrawings(
  db: DrawingSource,
): ExtractResult[] {
  const blocks = new Map(db.tables.BLOCK_RECORD.entries.map((block) => [block.name, block]));
  const layerTable = new Map(db.tables.LAYER.entries.map((layer) => [layer.name, layer]));
  const [units, metersPerUnit] = INSUNITS[Number(db.header.INSUNITS) || 0] ?? INSUNITS[0]!;
  const headerSpan = Math.max(
    (db.header.EXTMAX?.x ?? 0) - (db.header.EXTMIN?.x ?? 0),
    (db.header.EXTMAX?.y ?? 0) - (db.header.EXTMIN?.y ?? 0),
  );
  const tolerance =
    (Number.isFinite(headerSpan) && headerSpan > 0 && headerSpan < 1e12 ? headerSpan : 1000) *
    FLATTEN_TOLERANCE_RATIO;

  /** `model` is given for a paper-space layout, whose viewports show the model through a window. */
  const extractSpace = (source: SourceEntity[], model?: SourceEntity[]): CadDrawing => {
    const layers: CadLayer[] = [];
    const layerIndex = new Map<string, number>();
    const colors = new Map<string, number>();
    const paths = new Map<string, number>();
    const entities: CadEntity[] = [];
    const texts: CadText[] = [];
    const rooms: CadRoom[] = [];
    const grids: CadGridLabel[] = [];
    const seenRooms = new Set<string>();
    const unsupported: Record<string, number> = {};
    let level: string | null = null;

    const layerOf = (name: string) => {
      let index = layerIndex.get(name);
      if (index === undefined) {
        const row = layerTable.get(name);
        index = layers.length;
        layerIndex.set(name, index);
        layers.push({
          name,
          color: row?.trueColor != null ? rgbHex(row.trueColor) : aciHex(row?.colorIndex ?? 7),
          linetype: row?.lineType ?? 'Continuous',
          visible: !row || (!row.off && !row.frozen),
          count: 0,
        });
      }
      return index;
    };
    const indexOf = (map: Map<string, number>, key: string) => {
      let index = map.get(key);
      if (index === undefined) map.set(key, (index = map.size));
      return index;
    };

    const addGeometry = (type: string, points: Point[], closed: boolean, fill: boolean, m: Matrix, common: Pick<CadEntity, 'l' | 'c' | 'b'>, clip?: Rect) => {
      if (points.length < 2) return false;
      const p: number[] = [];
      for (const [x, y] of points) {
        const [wx, wy] = apply(m, x, y);
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false;
        p.push(round3(wx), round3(wy));
      }
      if (!clip) {
        entities.push({ t: type, p, closed, fill, ...common });
      } else if (fill) {
        const ring = clipPolygon(p, clip);
        if (ring.length) entities.push({ t: type, p: ring.map(round3), closed: true, fill, ...common });
      } else {
        const pieces = clipPolyline(p, closed, clip);
        const whole = pieces.length === 1 && pieces[0]!.length === p.length + (closed ? 2 : 0);
        for (const piece of pieces) entities.push({ t: type, p: whole ? p : piece.map(round3), closed: whole && closed, fill, ...common });
      }
      return true;
    };

    const geometries = (e: Shape, m: Matrix): Array<[Point[], boolean, boolean]> | null => {
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const tol = tolerance / scale;
      const polyline = (vertices: Array<{ x: number; y: number } & { bulge?: number }>, closed: boolean) => {
        const out: Point[] = [];
        vertices.forEach((vertex, i) => {
          const next = vertices[i + 1] ?? (closed ? vertices[0] : undefined);
          out.push([vertex.x, vertex.y]);
          if (next && vertex.bulge) out.push(...bulgePoints(xy(vertex), xy(next), vertex.bulge, tol));
        });
        return out;
      };
      switch (e.type) {
        case 'LINE':
          return [[[xy(e.startPoint), xy(e.endPoint)], false, false]];
        case 'LWPOLYLINE':
        case 'POLYLINE2D':
        case 'POLYLINE3D': {
          const closed = (Number(e.flag) & 1) === 1;
          return [[polyline(e.vertices as { x: number; y: number }[], closed), closed, false]];
        }
        case 'CIRCLE':
          return [[arcPoints(xy(e.center), Number(e.radius), 0, Math.PI * 2, tol), true, false]];
        case 'ARC': {
          const start = Number(e.startAngle);
          let end = Number(e.endAngle);
          if (end <= start) end += Math.PI * 2;
          return [[arcPoints(xy(e.center), Number(e.radius), start, end, tol), false, false]];
        }
        case 'ELLIPSE':
          return [[
            ellipsePoints(xy(e.center), xy(e.majorAxisEndPoint), Number(e.axisRatio), Number(e.startAngle), Number(e.endAngle), tol),
            false,
            false,
          ]];
        case 'SPLINE': {
          const control = (e.controlPoints as { x: number; y: number }[]) ?? [];
          const points = control.length
            ? splinePoints(control.map(xy), Number(e.degree), e.knots as number[], e.weights as number[] | undefined)
            : ((e.fitPoints as { x: number; y: number }[]) ?? []).map(xy);
          return [[points, (Number(e.flag) & 1) === 1, false]];
        }
        case 'SOLID':
        case 'TRACE':
        case '3DFACE': {
          const corners = [e.corner1, e.corner2, e.corner4 ?? e.corner3, e.corner3].map(xy);
          return [[corners, true, e.type !== '3DFACE']];
        }
        case 'LEADER':
          return [[(e.vertices as { x: number; y: number }[]).map(xy), false, false]];
        case 'HATCH': {
          const solid = Number(e.solidFill) === 1;
          const rings: Array<[Point[], boolean, boolean]> = [];
          for (const boundary of (e.boundaryPaths as Shape[]) ?? []) {
            let ring: Point[] = [];
            if (boundary.vertices) {
              ring = polyline(boundary.vertices as { x: number; y: number }[], true);
            } else {
              for (const edge of (boundary.edges as Shape[]) ?? []) {
                if (edge.type === 1) ring.push(xy(edge.start), xy(edge.end));
                else if (edge.type === 2) {
                  const sign = edge.isCCW ? 1 : -1;
                  ring.push(...arcPoints(xy(edge.center), Number(edge.radius), sign * Number(edge.startAngle), sign * Number(edge.endAngle), tol));
                } else if (edge.type === 3) {
                  const sign = edge.isCCW ? 1 : -1;
                  ring.push(...ellipsePoints(xy(edge.center), xy(edge.end), Number(edge.lengthOfMinorAxis), sign * Number(edge.startAngle), sign * Number(edge.endAngle), tol));
                } else if (edge.type === 4) {
                  ring.push(...splinePoints((edge.controlPoints as { x: number; y: number }[]).map(xy), Number(edge.degree), edge.knots as number[]));
                }
              }
            }
            if (ring.length > 2) rings.push([ring, true, solid]);
          }
          return rings;
        }
        default:
          return null;
      }
    };

    const textRecord = (e: Shape, m: Matrix): Omit<CadText, 'l' | 'c' | 'b'> | null => {
      let content: string;
      let anchor: Point;
      let radians: number;
      let height: number;
      let ha: CadText['ha'];
      let va: CadText['va'];
      if (e.type === 'MTEXT') {
        const raw = String(e.text ?? '');
        content = plainMText(raw);
        const attachment = Math.min(9, Math.max(1, Number(e.attachmentPoint) || 1)) - 1;
        const column = attachment % 3;
        ha = H_ALIGN[column]!;
        va = V_ALIGN[Math.floor(attachment / 3)]!;
        const direction = e.direction as { x: number; y: number } | undefined;
        radians = direction && (direction.x || direction.y) ? Math.atan2(direction.y, direction.x) : Number(e.rotation) || 0;
        height = Number(e.textHeight) || 1;
        anchor = xy(e.insertionPoint);
        const paragraph = mtextParagraphAlign(raw);
        const width = Number(e.rectWidth) || 0;
        if (paragraph && width > 0) {
          const offset = ([0, -0.5, -1][column]! + { left: 0, center: 0.5, right: 1 }[paragraph]) * width;
          anchor = [anchor[0] + offset * Math.cos(radians), anchor[1] + offset * Math.sin(radians)];
          ha = paragraph;
        }
      } else {
        // ATTRIB nests its TEXT fields under `text`.
        const t = (typeof e.text === 'object' && e.text ? e.text : e) as Shape;
        content = plainText(String(t.text ?? ''));
        const h = Number(t.halign) || 0;
        const v = Number(t.valign) || 0;
        ha = h === 2 ? 'right' : h === 1 || h === 4 ? 'center' : 'left';
        va = h === 4 ? 'middle' : v === 3 ? 'top' : v === 2 ? 'middle' : v === 1 ? 'bottom' : 'baseline';
        const aligned = (h !== 0 || v !== 0) && h !== 3 && h !== 5 && t.endPoint;
        anchor = xy(aligned ? t.endPoint : t.startPoint);
        radians = Number(t.rotation) || 0;
        height = Number(t.textHeight) || 1;
        m = ocs(m, t);
      }
      content = content.trim();
      if (!content) return null;
      const [x, y] = apply(m, anchor[0], anchor[1]);
      let dx = m[0] * Math.cos(radians) + m[2] * Math.sin(radians);
      let dy = m[1] * Math.cos(radians) + m[3] * Math.sin(radians);
      const up = Math.hypot(-m[0] * Math.sin(radians) + m[2] * Math.cos(radians), -m[1] * Math.sin(radians) + m[3] * Math.cos(radians));
      if (m[0] * m[3] - m[1] * m[2] < 0) {
        // Mirrored text reads backwards; show it readable over the same span.
        dx = -dx;
        dy = -dy;
        ha = ha === 'left' ? 'right' : ha === 'right' ? 'left' : ha;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const degrees = (Math.round((Math.atan2(dy, dx) * 18000) / Math.PI) / 100 + 360) % 360;
      return { s: content, x: round3(x), y: round3(y), h: round3(height * up), r: degrees, ha, va };
    };

    /** Draws model space as seen through one layout viewport (plan views only). */
    const showViewport = (e: Shape) => {
      const width = Number(e.width);
      const height = Number(e.height);
      const viewHeight = Number(e.viewHeight);
      // Viewport 1 is the sheet itself, not a window onto the model.
      if (Number(e.viewportId) === 1 || Number(e.statusBitFlags) & VIEWPORT_OFF || !(width > 0 && height > 0 && viewHeight > 0)) return;
      const direction = e.viewDirection as { x: number; y: number } | undefined;
      if (Math.abs(direction?.x ?? 0) > 1e-6 || Math.abs(direction?.y ?? 0) > 1e-6) {
        unsupported['VIEWPORT (3D view)'] = (unsupported['VIEWPORT (3D view)'] ?? 0) + 1;
        return;
      }
      const scale = height / viewHeight;
      const twist = Number(e.viewTwistAngle) || 0;
      const cos = Math.cos(twist) * scale;
      const sin = Math.sin(twist) * scale;
      const [cx, cy] = xy(e.viewportCenter);
      const [tx, ty] = xy(e.targetPoint);
      const [dx, dy] = xy(e.displayCenter);
      const m: Matrix = [cos, sin, -sin, cos, cx - (cos * tx - sin * ty) - scale * dx, cy - (sin * tx + cos * ty) - scale * dy];
      const clip: Rect = [cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2];
      walk(model!, m, { names: [], layer: '0', color: '#ffffff', depth: 1, clip });
    };

    const walk = (list: SourceEntity[], m: Matrix, parent: Parent) => {
      for (const entity of list) {
        const e = entity as unknown as Shape;
        const type = String(e.type);
        if (type === 'VIEWPORT' && model && parent.depth === 0) showViewport(e);
        if (e.isVisible === false || SKIPPED_TYPES.has(type)) continue;
        let layer = String(e.layer ?? '0');
        if (layer === '0' && parent.names.length) layer = parent.layer;
        const aci = Number(e.colorIndex ?? 256);
        const color =
          e.color != null
            ? rgbHex(Number(e.color))
            : aci === 256
              ? layers[layerOf(layer)]!.color
              : aci === 0
                ? parent.color
                : aciHex(aci);

        if (type === 'INSERT' || type === 'DIMENSION') {
          const block = blocks.get(String(e.name));
          if (!block || parent.depth >= MAX_BLOCK_DEPTH) continue;
          if (type === 'DIMENSION') {
            // A dimension's anonymous block is already drawn in world coordinates.
            walk(block.entities, m, { ...parent, layer, color, depth: parent.depth + 1 });
            continue;
          }
          walk((e.attribs as SourceEntity[]) ?? [], m, { ...parent, layer, color });
          const [ix, iy] = xy(e.insertionPoint);
          const [bx, by] = xy(block.basePoint);
          const rotation = Number(e.rotation) || 0;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          const sx = Number(e.xScale) || 1;
          const sy = Number(e.yScale) || 1;
          const child = { names: [...parent.names, block.name], layer, color, depth: parent.depth + 1, clip: parent.clip };
          const columns = Math.max(1, Number(e.columnCount) || 1);
          const rows = Math.max(1, Number(e.rowCount) || 1);
          for (let column = 0; column < columns; column++) {
            for (let row = 0; row < rows; row++) {
              const ox = column * (Number(e.columnSpacing) || 0);
              const oy = row * (Number(e.rowSpacing) || 0);
              const local: Matrix = [
                cos * sx,
                sin * sx,
                -sin * sy,
                cos * sy,
                ix + cos * ox - sin * oy - (cos * sx * bx - sin * sy * by),
                iy + sin * ox + cos * oy - (sin * sx * bx + cos * sy * by),
              ];
              walk(block.entities, multiply(ocs(m, e), local), child);
            }
          }
          continue;
        }

        const l = layerOf(layer);
        const common = { l, c: indexOf(colors, color), b: indexOf(paths, parent.names.join(BLOCK_PATH_SEPARATOR)) };
        if (TEXT_TYPES.has(type)) {
          if (type === 'ATTRIB' && Number(e.flags) & 1) continue;
          const text = textRecord(e, type === 'MTEXT' ? ocs(m, e) : m);
          if (!text) continue;
          if (parent.clip && !pointInRect(text.x, text.y, parent.clip)) continue;
          texts.push({ ...text, ...common });
          const room = parseRoomTag(text.s);
          if (room && !seenRooms.has(room.id)) {
            seenRooms.add(room.id);
            rooms.push({ ...room, x: text.x, y: text.y, text: texts.length - 1 });
          } else if (layer.toLowerCase().includes('grid') && GRID_LABEL_RE.test(text.s)) {
            grids.push({ label: text.s, x: text.x, y: text.y });
          } else if (level === null && LEVEL_RE.test(text.s)) {
            level = text.s.trim();
          }
        } else {
          const pieces = geometries(e, ocs(m, e));
          const before = entities.length;
          for (const [points, closed, fill] of pieces ?? []) addGeometry(type, points, closed, fill, ocs(m, e), common, parent.clip);
          if (entities.length === before) {
            if (!pieces) unsupported[type] = (unsupported[type] ?? 0) + 1;
            continue;
          }
        }
        layers[l]!.count += 1;
      }
    };

    walk(source, IDENTITY, { names: [], layer: '0', color: '#ffffff', depth: 0 });
    return {
      version: 1,
      units,
      meters_per_unit: metersPerUnit,
      extents: robustExtents(entities, texts),
      level,
      layers,
      colors: [...colors.keys()],
      block_paths: [...paths.keys()],
      entities,
      texts,
      rooms,
      grids,
      unsupported,
    };
  };

  const spaces = db.tables.BLOCK_RECORD.entries.filter((block) => /^\*(model|paper)_space/i.test(block.name));
  const layoutNames = new Map(db.objects.LAYOUT.map((layout) => [layout.paperSpaceTableId, layout.layoutName]));
  const modelSpace = spaces.find((space) => /^\*model_space$/i.test(space.name));
  const results: ExtractResult[] = [];
  for (const space of spaces) {
    const isModel = /^\*model_space$/i.test(space.name);
    if (!space.entities.some((entity) => entity.type === 'VIEWPORT' || !SKIPPED_TYPES.has(entity.type))) continue;
    try {
      const drawing = extractSpace(space.entities, isModel ? undefined : modelSpace?.entities);
      const name = isModel ? 'Model' : (layoutNames.get(space.handle) ?? space.name.replace(/^\*/, ''));
      if (isModel) results.unshift({ name, drawing });
      else results.push({ name, drawing });
    } catch (error) {
      if (!(error instanceof EmptyDrawingError)) throw error;
    }
  }
  if (!results.length) throw new EmptyDrawingError('This drawing has nothing to display.');
  return results;
}

/** Extents of the main drawing, ignoring stray entities far from it (CAD files often have some). */
function robustExtents(entities: CadEntity[], texts: CadText[]): CadDrawing['extents'] {
  const boxes: Array<[number, number, number, number]> = texts.map((t) => [t.x, t.y, t.x + t.h, t.y + t.h]);
  for (const { p } of entities) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]!);
      maxX = Math.max(maxX, p[i]!);
      minY = Math.min(minY, p[i + 1]!);
      maxY = Math.max(maxY, p[i + 1]!);
    }
    boxes.push([minX, minY, maxX, maxY]);
  }
  if (!boxes.length) throw new EmptyDrawingError('This drawing has nothing to display.');

  const mainRange = (axis: 0 | 1): [number, number] => {
    const centres = boxes.map((box) => (box[axis] + box[axis + 2]!) / 2).sort((a, b) => a - b);
    const at = (q: number) => centres[Math.min(centres.length - 1, Math.floor(q * centres.length))]!;
    const lo = at(OUTLIER_QUANTILE);
    const hi = at(1 - OUTLIER_QUANTILE);
    const reach = (hi - lo) * 0.5;
    return boxes.length < 50 ? [-Infinity, Infinity] : [lo - reach, hi + reach];
  };
  const [loX, hiX] = mainRange(0);
  const [loY, hiY] = mainRange(1);
  const extents: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    if (cx < loX || cx > hiX || cy < loY || cy > hiY) continue;
    extents[0] = Math.min(extents[0], box[0]);
    extents[1] = Math.min(extents[1], box[1]);
    extents[2] = Math.max(extents[2], box[2]);
    extents[3] = Math.max(extents[3], box[3]);
  }
  const span = Math.max(extents[2] - extents[0], extents[3] - extents[1]);
  if (!Number.isFinite(span) || span <= 0) throw new EmptyDrawingError('This drawing has no area.');
  const pad = span * EXTENTS_PADDING_RATIO;
  return [round3(extents[0] - pad), round3(extents[1] - pad), round3(extents[2] + pad), round3(extents[3] + pad)];
}
