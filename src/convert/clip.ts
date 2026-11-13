export type Rect = [number, number, number, number];

const inside = (x: number, y: number, [minX, minY, maxX, maxY]: Rect) => x >= minX && x <= maxX && y >= minY && y <= maxY;

/** The parts of a flat `[x0, y0, x1, y1, …]` polyline that lie inside `rect` (Liang–Barsky per segment). */
export function clipPolyline(p: number[], closed: boolean, rect: Rect): number[][] {
  const pieces: number[][] = [];
  let current: number[] | null = null;
  const count = p.length / 2;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const x0 = p[i * 2]!;
    const y0 = p[i * 2 + 1]!;
    const next = ((i + 1) % count) * 2;
    const dx = p[next]! - x0;
    const dy = p[next + 1]! - y0;
    let t0 = 0;
    let t1 = 1;
    const edges: Array<[number, number]> = [[-dx, x0 - rect[0]], [dx, rect[2] - x0], [-dy, y0 - rect[1]], [dy, rect[3] - y0]];
    for (const [direction, distance] of edges) {
      if (direction === 0) {
        if (distance < 0) t0 = 2;
      } else if (direction < 0) t0 = Math.max(t0, distance / direction);
      else t1 = Math.min(t1, distance / direction);
    }
    if (t0 > t1) {
      current = null;
      continue;
    }
    if (!current || t0 > 0) pieces.push((current = [x0 + t0 * dx, y0 + t0 * dy]));
    current.push(x0 + t1 * dx, y0 + t1 * dy);
    if (t1 < 1) current = null;
  }
  return pieces;
}

/** A filled polygon cut to `rect` (Sutherland–Hodgman); empty when nothing is left. */
export function clipPolygon(p: number[], rect: Rect): number[] {
  let ring = p;
  for (let edge = 0; edge < 4 && ring.length; edge++) {
    const axis = edge % 2;
    const limit = rect[edge]!;
    const keep = (value: number) => (edge < 2 ? value >= limit : value <= limit);
    const out: number[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const a = [ring[i]!, ring[i + 1]!];
      const j = (i + 2) % ring.length;
      const b = [ring[j]!, ring[j + 1]!];
      const aIn = keep(a[axis]!);
      if (aIn) out.push(a[0]!, a[1]!);
      if (aIn !== keep(b[axis]!)) {
        const t = (limit - a[axis]!) / (b[axis]! - a[axis]!);
        out.push(a[0]! + t * (b[0]! - a[0]!), a[1]! + t * (b[1]! - a[1]!));
      }
    }
    ring = out;
  }
  return ring.length >= 6 ? ring : [];
}

export const pointInRect = inside;
