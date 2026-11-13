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
