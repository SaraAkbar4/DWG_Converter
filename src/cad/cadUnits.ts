const METERS_PER_FOOT = 0.3048;

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

export function niceMetricStep(pxPerMeter: number, minPx: number): number {
  return (
    NICE_METRIC_STEPS.find((step) => step * pxPerMeter >= minPx) ??
    (NICE_METRIC_STEPS[NICE_METRIC_STEPS.length - 1] as number)
  );
}
