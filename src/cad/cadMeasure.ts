import { polygonArea, polylineLength } from './cadGeometry';
import { formatArea, formatLength } from './cadUnits';

export type CadMeasureMode = 'distance' | 'area' | 'angle';
export type CadPoint = [number, number];

export type CadMeasure = {
  mode: CadMeasureMode;
  points: CadPoint[];
};

type Units = { meters_per_unit: number | null; units: string };

const flat = (points: CadPoint[]) => points.flat();

export function measureLabel(measure: CadMeasure, drawing: Units): string | null {
  const { mode, points } = measure;
  const [a, b, c] = points;
  if (mode === 'distance' && a && b) {
    return formatLength(Math.hypot(b[0] - a[0], b[1] - a[1]), drawing.meters_per_unit, drawing.units);
  }
  if (mode === 'angle' && a && b && c) {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const dot = ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (ab * cb || 1);
    return `${((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI).toFixed(1)}°`;
  }
  if (mode === 'area' && points.length > 2) {
    const values = flat(points);
    const area = formatArea(polygonArea(values), drawing.meters_per_unit, drawing.units);
    const perimeter = formatLength(polylineLength(values, true), drawing.meters_per_unit, drawing.units);
    return `${area} · ${perimeter}`;
  }
  return null;
}

/** Where the caption sits, in drawing coordinates. */
export function measureAnchor(measure: CadMeasure): CadPoint | null {
  const { mode, points } = measure;
  if (mode === 'distance' && points.length >= 2) {
    const [a, b] = points;
    return [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2];
  }
  if (mode === 'angle' && points[1]) return points[1];
  if (mode === 'area' && points.length > 2) {
    const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0] as CadPoint);
    return [sum[0] / points.length, sum[1] / points.length];
  }
  return points.at(-1) ?? null;
}
