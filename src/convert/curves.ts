export type Point = [number, number];

const MIN_SEGMENTS = 2;
const MAX_SEGMENTS = 128;
const SPLINE_SAMPLES_PER_SPAN = 8;
const MAX_SPLINE_SAMPLES = 2000;

function segmentsFor(radius: number, sweep: number, tolerance: number) {
  const step = radius > tolerance ? 2 * Math.acos(1 - tolerance / radius) : Math.PI / 4;
  return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.ceil(Math.abs(sweep) / step)));
}

export function arcPoints(center: Point, radius: number, start: number, end: number, tolerance: number): Point[] {
  const count = segmentsFor(radius, end - start, tolerance);
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = start + ((end - start) * i) / count;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)] as Point;
  });
}

/** Points strictly between two polyline vertices joined by an arc of the given bulge. */
export function bulgePoints(from: Point, to: Point, bulge: number, tolerance: number): Point[] {
  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (!chord) return [];
  const sweep = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2));
  const toCenter = Math.atan2(to[1] - from[1], to[0] - from[0]) + (Math.PI / 2 - sweep / 2);
  const center: Point = [from[0] + radius * Math.sign(bulge) * Math.cos(toCenter), from[1] + radius * Math.sign(bulge) * Math.sin(toCenter)];
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  return arcPoints(center, radius, start, start + sweep, tolerance).slice(1, -1);
}

export function ellipsePoints(center: Point, major: Point, ratio: number, start: number, end: number, tolerance: number): Point[] {
  const a = Math.hypot(major[0], major[1]);
  const rotation = Math.atan2(major[1], major[0]);
  const sweep = end > start ? end - start : end - start + Math.PI * 2;
  const count = segmentsFor(a, sweep, tolerance);
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = start + (sweep * i) / count;
    const x = a * Math.cos(t);
    const y = a * ratio * Math.sin(t);
    return [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)] as Point;
  });
}

/** Samples a (rational) B-spline with de Boor's algorithm. */
export function splinePoints(control: Point[], degree: number, knots: number[] = [], weights?: number[]): Point[] {
  const n = control.length;
  if (n <= degree || knots.length < n + degree + 1) return control;
  const lo = knots[degree]!;
  const hi = knots[n]!;
  const samples = Math.min(MAX_SPLINE_SAMPLES, (n - degree) * SPLINE_SAMPLES_PER_SPAN);
  const out: Point[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s === samples ? hi : lo + ((hi - lo) * s) / samples;
    let span = degree;
    while (span < n - 1 && knots[span + 1]! <= t) span++;
    const d = Array.from({ length: degree + 1 }, (_, j) => {
      const index = span - degree + j;
      const w = weights?.[index] ?? 1;
      return [control[index]![0] * w, control[index]![1] * w, w];
    });
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = span - degree + j;
        const denominator = knots[i + degree - r + 1]! - knots[i]!;
        const alpha = denominator ? (t - knots[i]!) / denominator : 0;
        d[j] = d[j]!.map((value, k) => (1 - alpha) * d[j - 1]![k]! + alpha * value);
      }
    }
    const [x, y, w] = d[degree]!;
    out.push([x! / (w || 1), y! / (w || 1)]);
  }
  return out;
}
