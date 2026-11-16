const METERS_PER_FOOT = 0.3048;

export const KNOWN_LENGTH_UNITS = ['m', 'mm', 'ft'] as const;
export type KnownLengthUnit = (typeof KNOWN_LENGTH_UNITS)[number];

const METERS_PER_KNOWN: Record<KnownLengthUnit, number> = {
  m: 1,
  mm: 0.001,
  ft: METERS_PER_FOOT,
};

/** Metres of the real world represented by one drawing unit, from a measured segment and its known length. */
export function metersPerDrawingUnit(
  drawingLength: number,
  knownLength: number,
  unit: KnownLengthUnit,
): number | null {
  if (!(drawingLength > 0) || !(knownLength > 0)) return null;
  return (knownLength * METERS_PER_KNOWN[unit]) / drawingLength;
}

function formatFeetInches(meters: number): string {
  const totalInches = Math.round((meters / METERS_PER_FOOT) * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return `${feet}'-${inches}"`;
}

export function formatLength(
  drawingUnits: number,
  metersPerUnit: number | null,
  units: string,
): string {
  if (!metersPerUnit) return `${drawingUnits.toFixed(2)} ${units}`;
  const meters = drawingUnits * metersPerUnit;
  return `${meters.toFixed(2)} m · ${formatFeetInches(meters)}`;
}

export function formatArea(
  squareUnits: number,
  metersPerUnit: number | null,
  units: string,
): string {
  if (!metersPerUnit) return `${squareUnits.toFixed(2)} ${units}²`;
  const squareMeters = squareUnits * metersPerUnit * metersPerUnit;
  return `${squareMeters.toFixed(2)} m² · ${(squareMeters / METERS_PER_FOOT ** 2).toFixed(1)} ft²`;
}

const NICE_METRIC_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function niceMetricStep(pxPerMeter: number, minPx: number): number {
  return (
    NICE_METRIC_STEPS.find((step) => step * pxPerMeter >= minPx) ??
    (NICE_METRIC_STEPS[NICE_METRIC_STEPS.length - 1] as number)
  );
}

/** The metric grid never draws lines closer than this many CSS pixels apart. */
const GRID_MIN_PX = 18;

/** Grid spacing in drawing units at a zoom of `pxPerUnit` CSS pixels per drawing unit. */
export function gridStepUnits(metersPerUnit: number, pxPerUnit: number): number {
  return niceMetricStep(pxPerUnit / metersPerUnit, GRID_MIN_PX) / metersPerUnit;
}

/** A cursor coordinate in metres when the drawing's scale is known, else in drawing units. */
export function formatCoordinate(drawingUnits: number, metersPerUnit: number | null): string {
  if (!metersPerUnit) return drawingUnits.toFixed(2);
  return `${(drawingUnits * metersPerUnit).toFixed(3)} m`;
}
