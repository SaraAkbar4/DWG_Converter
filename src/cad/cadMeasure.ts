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

/** Arms shorter than this share of the longer one are treated as zero length. */
const DEGENERATE_ARM = 1e-9;

/**
 * The angle at corner `b` between the arms to `a` and to `c`, in degrees from 0 to 180.
 * Null when an arm has no length, since no angle is defined there.
 *
 * atan2 of the cross and dot products stays exact near 0° and 180°, where acos of the
 * normalised dot product loses most of its digits.
 */
export function angleAt(a: CadPoint, b: CadPoint, c: CadPoint): number | null {
  const ux = a[0] - b[0];
  const uy = a[1] - b[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  const u = Math.hypot(ux, uy);
  const v = Math.hypot(vx, vy);
  const longest = Math.max(u, v, Math.abs(b[0]), Math.abs(b[1]));
  if (u <= longest * DEGENERATE_ARM || v <= longest * DEGENERATE_ARM) return null;
  return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI;
}

/** One decimal, without a "-0.0°" or a 180° that reads as 179.99…. */
export function formatAngle(degrees: number): string {
  const rounded = Math.round(degrees * 10) / 10;
  return `${(rounded === 0 ? 0 : rounded).toFixed(1)}°`;
}

/** The dark caption drawn on a measurement: a primary line, an optional second line, and the copy text. */
export type CadMeasureReadout = { title: string; detail: string | null; copy: string };

const grouped = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lengthReadout(drawingUnits: number, drawing: Units): string {
  if (!drawing.meters_per_unit) return `${grouped(drawingUnits)} ${drawing.units}`;
  return `${grouped(drawingUnits * drawing.meters_per_unit)} m`;
}

function areaReadout(squareUnits: number, drawing: Units): string {
  if (!drawing.meters_per_unit) return `${grouped(squareUnits)} ${drawing.units}²`;
  const squareMeters = squareUnits * drawing.meters_per_unit * drawing.meters_per_unit;
  return `${grouped(squareMeters)} m²`;
}

export function measureReadout(measure: CadMeasure, drawing: Units): CadMeasureReadout | null {
  const { mode, points } = measure;
  const [a, b, c] = points;
  if (mode === 'distance' && a && b) {
    const title = `Distance ${lengthReadout(Math.hypot(b[0] - a[0], b[1] - a[1]), drawing)}`;
    return { title, detail: null, copy: title };
  }
  if (mode === 'angle' && a && b && c) {
    const degrees = angleAt(a, b, c);
    if (degrees === null) return null;
    const title = `Angle ${formatAngle(degrees)}`;
    return { title, detail: null, copy: title };
  }
  if (mode === 'area' && points.length > 2) {
    const values = flat(points);
    const title = `Area ${areaReadout(polygonArea(values), drawing)}`;
    const detail = `Perimeter ${lengthReadout(polylineLength(values, true), drawing)}`;
    return { title, detail, copy: `${title}\n${detail}` };
  }
  return null;
}

export function measureLabel(measure: CadMeasure, drawing: Units): string | null {
  const { mode, points } = measure;
  const [a, b, c] = points;
  if (mode === 'distance' && a && b) {
    return lengthReadout(Math.hypot(b[0] - a[0], b[1] - a[1]), drawing);
  }
  if (mode === 'angle' && a && b && c) {
    const degrees = angleAt(a, b, c);
    return degrees === null ? null : formatAngle(degrees);
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
