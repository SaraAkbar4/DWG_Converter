export type Bounds = [number, number, number, number];

export function pointsBounds(p: number[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] as number;
    const y = p[i + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function polylineDistance(px: number, py: number, p: number[], closed: boolean): number {
  let best = Infinity;
  const count = p.length / 2;
  const last = closed ? count : count - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % count;
    const d = segmentDistance(
      px,
      py,
      p[i * 2] as number,
      p[i * 2 + 1] as number,
      p[j * 2] as number,
      p[j * 2 + 1] as number,
    );
    if (d < best) best = d;
  }
  return best;
}

export function pointInPolygon(px: number, py: number, p: number[]): boolean {
  let inside = false;
  const count = p.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = p[i * 2] as number;
    const yi = p[i * 2 + 1] as number;
    const xj = p[j * 2] as number;
    const yj = p[j * 2 + 1] as number;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polylineLength(p: number[], closed: boolean): number {
  let total = 0;
  const count = p.length / 2;
  const last = closed ? count : count - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % count;
    total += Math.hypot(
      (p[j * 2] as number) - (p[i * 2] as number),
      (p[j * 2 + 1] as number) - (p[i * 2 + 1] as number),
    );
  }
  return total;
}

export function polygonArea(p: number[]): number {
  let twice = 0;
  const count = p.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    twice +=
      (p[j * 2] as number) * (p[i * 2 + 1] as number) -
      (p[i * 2] as number) * (p[j * 2 + 1] as number);
  }
  return Math.abs(twice) / 2;
}
