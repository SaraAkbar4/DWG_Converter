import type { Bounds } from './cadGeometry';

export type CadView = { scale: number; tx: number; ty: number };

const FIT_MARGIN = 0.95;
const MIN_SCALE_FACTOR = 0.2;
const MAX_SCALE_FACTOR = 400;

export function toScreen(view: CadView, x: number, y: number): [number, number] {
  return [x * view.scale + view.tx, -y * view.scale + view.ty];
}

export function toWorld(view: CadView, sx: number, sy: number): [number, number] {
  return [(sx - view.tx) / view.scale, -(sy - view.ty) / view.scale];
}

export function fitView(bounds: Bounds, width: number, height: number): CadView {
  const [minX, minY, maxX, maxY] = bounds;
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY)) * FIT_MARGIN;
  return {
    scale,
    tx: width / 2 - ((minX + maxX) / 2) * scale,
    ty: height / 2 + ((minY + maxY) / 2) * scale,
  };
}

export function zoomAt(
  view: CadView,
  fitScale: number,
  sx: number,
  sy: number,
  factor: number,
): CadView {
  const scale = Math.min(
    fitScale * MAX_SCALE_FACTOR,
    Math.max(fitScale * MIN_SCALE_FACTOR, view.scale * factor),
  );
  const [wx, wy] = toWorld(view, sx, sy);
  return { scale, tx: sx - wx * scale, ty: sy + wy * scale };
}

export function centerOn(
  view: CadView,
  width: number,
  height: number,
  x: number,
  y: number,
): CadView {
  return { scale: view.scale, tx: width / 2 - x * view.scale, ty: height / 2 + y * view.scale };
}

/** Share of the shorter screen edge moved by one arrow press. Shift uses the larger step. */
const ARROW_PAN_FRACTION = 0.15;
const ARROW_PAN_FRACTION_FAST = 0.4;

/** Screen shift for an arrow key. Positive x moves the drawing right, so the view looks left. */
const ARROW_SIGN: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export function arrowPanOffset(
  key: string,
  width: number,
  height: number,
  fast = false,
): { dx: number; dy: number } | null {
  const sign = ARROW_SIGN[key];
  if (!sign || width <= 0 || height <= 0) return null;
  const step = Math.min(width, height) * (fast ? ARROW_PAN_FRACTION_FAST : ARROW_PAN_FRACTION);
  return { dx: sign[0] * step, dy: sign[1] * step };
}

export function panView(view: CadView, dx: number, dy: number): CadView {
  return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy };
}

/** A screen rectangle, in the view's own (CSS) pixels. */
export type CadScreenRect = { x: number; y: number; width: number; height: number };
