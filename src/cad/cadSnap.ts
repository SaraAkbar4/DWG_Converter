import { GRID_CELLS, cellsOverlapping, type CadScene } from './prepareCadScene';
import type { CadEntity } from './types';

export type CadSnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'intersection'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'grid';

export const CAD_SNAP_KINDS: CadSnapKind[] = [
  'endpoint',
  'midpoint',
  'center',
  'intersection',
  'perpendicular',
  'tangent',
  'nearest',
  'grid',
];

export const CAD_SNAP_LABELS: Record<CadSnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  center: 'Centre',
  intersection: 'Intersection',
  perpendicular: 'Perpendicular',
  tangent: 'Tangent',
  nearest: 'Nearest',
  grid: 'Grid',
};

/** Lower wins when two snaps are both within reach. */
const RANK: Record<CadSnapKind, number> = {
  endpoint: 0,
  center: 0,
  intersection: 1,
  midpoint: 1,
  perpendicular: 2,
  tangent: 2,
  nearest: 3,
  grid: 4,
};

export type CadSnapSettings = { enabled: boolean; kinds: Record<CadSnapKind, boolean> };

export const DEFAULT_SNAP_SETTINGS: CadSnapSettings = {
  enabled: true,
  kinds: {
    endpoint: true,
    midpoint: true,
    center: true,
    intersection: true,
    perpendicular: true,
    tangent: false,
    nearest: true,
    grid: false,
  },
};

/** Degrees the measuring line is locked to, or 0 for free. 90 is ortho (horizontal or vertical). */
export type CadAngleLock = 0 | 90 | 45 | 15;
export const CAD_ANGLE_LOCKS: CadAngleLock[] = [0, 90, 45, 15];

export type CadPoint = [number, number];
export type CadSnap = { point: CadPoint; kind: CadSnapKind };

/** A circle or arc recovered from the points it was drawn with. */
export type CadArc = {
  cx: number;
  cy: number;
  r: number;
  start: number;
  /** Signed sweep in radians; ±2π for a whole circle. */
  sweep: number;
};

type Curve =
  | { kind: 'segment'; ax: number; ay: number; bx: number; by: number; entity: number }
  | { kind: 'arc'; arc: CadArc; entity: number };

const TAU = Math.PI * 2;
/** Points are rounded to 0.001 when the file is read, so a fitted circle can be off by about that much. */
const FIT_SLACK = 0.003;
const arcCache = new WeakMap<CadEntity, CadArc | null>();

function circumcircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x, y, r: Math.hypot(ax - x, ay - y) };
}

/**
 * Circles and arcs reach the viewer as short straight segments. When every point of a CIRCLE or ARC
 * lies on one circle, this returns that circle so snaps land on the true curve and its centre.
 * A block scaled unevenly turns a circle into an ellipse; that returns null and the segments are used.
 */
export function entityArc(entity: CadEntity): CadArc | null {
  if (entity.t !== 'CIRCLE' && entity.t !== 'ARC') return null;
  const cached = arcCache.get(entity);
  if (cached !== undefined) return cached;
  const p = entity.p;
  const n = p.length / 2;
  let arc: CadArc | null = null;
  if (n >= 3) {
    const at = (i: number) => [p[i * 2] as number, p[i * 2 + 1] as number] as const;
    const whole = entity.t === 'CIRCLE';
    // Three points spread around the curve; points close together make the fit sensitive to rounding.
    // A full circle repeats its first point at the end, so it is spread over thirds instead of the ends.
    const last = n - 1;
    const [ax, ay] = at(0);
    const [bx, by] = at(Math.round(last / (whole ? 3 : 2)));
    const [cx, cy] = at(whole ? Math.round((last * 2) / 3) : last);
    const fit = circumcircle(ax, ay, bx, by, cx, cy);
    if (fit && fit.r > 0) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const [x, y] = at(i);
        if (Math.abs(Math.hypot(x - fit.x, y - fit.y) - fit.r) > FIT_SLACK + fit.r * 1e-4) ok = false;
      }
      if (ok) {
        const start = Math.atan2(ay - fit.y, ax - fit.x);
        if (whole) {
          arc = { cx: fit.x, cy: fit.y, r: fit.r, start, sweep: TAU };
        } else {
          // Walk the points to get the sweep and its direction.
          let sweep = 0;
          let previous = start;
          for (let i = 1; i < n; i++) {
            const [x, y] = at(i);
            const angle = Math.atan2(y - fit.y, x - fit.x);
            let step = angle - previous;
            if (step > Math.PI) step -= TAU;
            if (step < -Math.PI) step += TAU;
            sweep += step;
            previous = angle;
          }
          arc = { cx: fit.x, cy: fit.y, r: fit.r, start, sweep };
        }
      }
    }
  }
  arcCache.set(entity, arc);
  return arc;
}

function onArc(arc: CadArc, angle: number): boolean {
  if (Math.abs(arc.sweep) >= TAU - 1e-9) return true;
  let offset = (angle - arc.start) * Math.sign(arc.sweep);
  offset = ((offset % TAU) + TAU) % TAU;
  return offset <= Math.abs(arc.sweep) + 1e-9;
}

function arcPoint(arc: CadArc, angle: number): CadPoint {
  return [arc.cx + arc.r * Math.cos(angle), arc.cy + arc.r * Math.sin(angle)];
}

function closestOnSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): CadPoint {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return [ax + t * dx, ay + t * dy];
}

function closestOnCurve(curve: Curve, x: number, y: number): CadPoint | null {
  if (curve.kind === 'segment') return closestOnSegment(x, y, curve.ax, curve.ay, curve.bx, curve.by);
  const { arc } = curve;
  const angle = Math.atan2(y - arc.cy, x - arc.cx);
  if (onArc(arc, angle)) return arcPoint(arc, angle);
  const a = arcPoint(arc, arc.start);
  const b = arcPoint(arc, arc.start + arc.sweep);
  return Math.hypot(a[0] - x, a[1] - y) < Math.hypot(b[0] - x, b[1] - y) ? a : b;
}

function segmentIntersection(a: Extract<Curve, { kind: 'segment' }>, b: Extract<Curve, { kind: 'segment' }>): CadPoint[] {
  const rx = a.bx - a.ax;
  const ry = a.by - a.ay;
  const sx = b.bx - b.ax;
  const sy = b.by - b.ay;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return [];
  const qx = b.ax - a.ax;
  const qy = b.ay - a.ay;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return [];
  return [[a.ax + t * rx, a.ay + t * ry]];
}

function segmentArcIntersection(s: Extract<Curve, { kind: 'segment' }>, arc: CadArc): CadPoint[] {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const fx = s.ax - arc.cx;
  const fy = s.ay - arc.cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - arc.r * arc.r;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return [];
  const root = Math.sqrt(disc);
  const out: CadPoint[] = [];
  for (const t of disc === 0 ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const point: CadPoint = [s.ax + t * dx, s.ay + t * dy];
    if (onArc(arc, Math.atan2(point[1] - arc.cy, point[0] - arc.cx))) out.push(point);
  }
  return out;
}

function arcArcIntersection(p: CadArc, q: CadArc): CadPoint[] {
  const d = Math.hypot(q.cx - p.cx, q.cy - p.cy);
  if (d === 0 || d > p.r + q.r || d < Math.abs(p.r - q.r)) return [];
  const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
  const mx = p.cx + (a * (q.cx - p.cx)) / d;
  const my = p.cy + (a * (q.cy - p.cy)) / d;
  const ox = (h * (q.cy - p.cy)) / d;
  const oy = (h * (q.cx - p.cx)) / d;
  const points: CadPoint[] = h === 0 ? [[mx, my]] : [[mx + ox, my - oy], [mx - ox, my + oy]];
  return points.filter(
    ([x, y]) => onArc(p, Math.atan2(y - p.cy, x - p.cx)) && onArc(q, Math.atan2(y - q.cy, x - q.cx)),
  );
}

function intersect(a: Curve, b: Curve): CadPoint[] {
  if (a.kind === 'segment' && b.kind === 'segment') return segmentIntersection(a, b);
  if (a.kind === 'segment' && b.kind === 'arc') return segmentArcIntersection(a, b.arc);
  if (a.kind === 'arc' && b.kind === 'segment') return segmentArcIntersection(b, a.arc);
  if (a.kind === 'arc' && b.kind === 'arc') return arcArcIntersection(a.arc, b.arc);
  return [];
}

export type FindSnapOptions = {
  settings: CadSnapSettings;
  hiddenLayers: ReadonlySet<number>;
  /** The previous point of the measurement, needed for perpendicular and tangent snaps. */
  from: CadPoint | null;
  /** Grid spacing and origin in drawing units, when the grid is shown. */
  grid: { step: number; origin: CadPoint } | null;
};

/** The best snap within `tolerance` (drawing units) of (x, y), or null when nothing is close. */
export function findSnap(scene: CadScene, x: number, y: number, tolerance: number, options: FindSnapOptions): CadSnap | null {
  const { settings, hiddenLayers, from, grid } = options;
  if (!settings.enabled) return null;
  const on = settings.kinds;
  let best: (CadSnap & { rank: number; distance: number }) | null = null;
  const offer = (kind: CadSnapKind, point: CadPoint) => {
    if (!on[kind]) return;
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (distance > tolerance) return;
    const rank = RANK[kind];
    if (!best || rank < best.rank || (rank === best.rank && distance < best.distance)) {
      best = { point, kind, rank, distance };
    }
  };

  const near: Curve[] = [];
  const seen = new Set<number>();
  for (const [cx, cy] of cellsOverlapping(scene, [x - tolerance, y - tolerance, x + tolerance, y + tolerance])) {
    for (const index of scene.cells[cx * GRID_CELLS + cy] ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const entity = scene.drawing.entities[index];
      if (!entity || hiddenLayers.has(entity.l)) continue;
      const box = scene.entityBounds[index];
      if (box && (x < box[0] - tolerance || x > box[2] + tolerance || y < box[1] - tolerance || y > box[3] + tolerance)) continue;

      const arc = entityArc(entity);
      if (arc) {
        offer('center', [arc.cx, arc.cy]);
        const whole = Math.abs(arc.sweep) >= TAU - 1e-9;
        if (!whole) {
          offer('endpoint', arcPoint(arc, arc.start));
          offer('endpoint', arcPoint(arc, arc.start + arc.sweep));
          offer('midpoint', arcPoint(arc, arc.start + arc.sweep / 2));
        }
        if (Math.abs(Math.hypot(x - arc.cx, y - arc.cy) - arc.r) <= tolerance) near.push({ kind: 'arc', arc, entity: index });
        continue;
      }

      const p = entity.p;
      const count = p.length / 2;
      const closed = entity.closed || entity.fill;
      for (let i = 0; i < count; i++) offer('endpoint', [p[i * 2] as number, p[i * 2 + 1] as number]);
      const segments = closed ? count : count - 1;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % count;
        const ax = p[i * 2] as number;
        const ay = p[i * 2 + 1] as number;
        const bx = p[j * 2] as number;
        const by = p[j * 2 + 1] as number;
        if (ax === bx && ay === by) continue;
        offer('midpoint', [(ax + bx) / 2, (ay + by) / 2]);
        const [qx, qy] = closestOnSegment(x, y, ax, ay, bx, by);
        if (Math.hypot(qx - x, qy - y) <= tolerance) near.push({ kind: 'segment', ax, ay, bx, by, entity: index });
      }
    }
  }

  if (on.intersection) {
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i] as Curve;
        const b = near[j] as Curve;
        if (a.entity === b.entity) continue;
        for (const point of intersect(a, b)) offer('intersection', point);
      }
    }
  }

  if (from) {
    for (const curve of near) {
      if (curve.kind === 'segment') {
        if (!on.perpendicular) continue;
        const dx = curve.bx - curve.ax;
        const dy = curve.by - curve.ay;
        const t = ((from[0] - curve.ax) * dx + (from[1] - curve.ay) * dy) / (dx * dx + dy * dy);
        if (t >= 0 && t <= 1) offer('perpendicular', [curve.ax + t * dx, curve.ay + t * dy]);
        continue;
      }
      const { arc } = curve;
      const toFrom = Math.atan2(from[1] - arc.cy, from[0] - arc.cx);
      if (on.perpendicular) {
        for (const angle of [toFrom, toFrom + Math.PI]) if (onArc(arc, angle)) offer('perpendicular', arcPoint(arc, angle));
      }
      const d = Math.hypot(from[0] - arc.cx, from[1] - arc.cy);
      if (on.tangent && d > arc.r) {
        const spread = Math.acos(arc.r / d);
        for (const angle of [toFrom + spread, toFrom - spread]) if (onArc(arc, angle)) offer('tangent', arcPoint(arc, angle));
      }
    }
  }

  if (on.nearest) {
    for (const curve of near) {
      const point = closestOnCurve(curve, x, y);
      if (point) offer('nearest', point);
    }
  }

  if (on.grid && grid && grid.step > 0) {
    const gx = grid.origin[0] + Math.round((x - grid.origin[0]) / grid.step) * grid.step;
    const gy = grid.origin[1] + Math.round((y - grid.origin[1]) / grid.step) * grid.step;
    offer('grid', [gx, gy]);
  }

  const found = best as (CadSnap & { rank: number; distance: number }) | null;
  return found ? { point: found.point, kind: found.kind } : null;
}

/**
 * Keeps the line from `from` at a multiple of `stepDegrees` (90 = horizontal or vertical),
 * sliding `point` onto that direction so a snapped point still lines up with it.
 */
export function lockAngle(from: CadPoint, point: CadPoint, stepDegrees: number): CadPoint {
  const dx = point[0] - from[0];
  const dy = point[1] - from[1];
  if (!stepDegrees || (dx === 0 && dy === 0)) return point;
  const step = (stepDegrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const t = dx * ux + dy * uy;
  return [from[0] + t * ux, from[1] + t * uy];
}
