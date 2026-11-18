import { pointsBounds, type Bounds } from './cadGeometry';
import type { CadDrawing } from './types';

export const GRID_CELLS = 128;
const MAX_BATCH_POINTS = 20000;
const CONTINUOUS_LINETYPES = new Set(['', 'continuous', 'bylayer', 'byblock']);

type CadBatch = {
  layer: number;
  color: string;
  dashed: boolean;
  stroke: Path2D | null;
  fill: Path2D | null;
};

export type CadScene = {
  drawing: CadDrawing;
  bounds: Bounds;
  entityBounds: Bounds[];
  batches: CadBatch[];
  cellSize: [number, number];
  cells: number[][];
};

function cellRange(scene: Pick<CadScene, 'bounds' | 'cellSize'>, value: number, axis: 0 | 1) {
  const cell = Math.floor((value - scene.bounds[axis]) / scene.cellSize[axis]);
  return Math.max(0, Math.min(GRID_CELLS - 1, cell));
}

export function cellsOverlapping(
  scene: Pick<CadScene, 'bounds' | 'cellSize'>,
  box: Bounds,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let cx = cellRange(scene, box[0], 0); cx <= cellRange(scene, box[2], 0); cx++) {
    for (let cy = cellRange(scene, box[1], 1); cy <= cellRange(scene, box[3], 1); cy++) {
      out.push([cx, cy]);
    }
  }
  return out;
}

function appendPolyline(path: Path2D, p: number[], closed: boolean) {
  path.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) path.lineTo(p[i] as number, p[i + 1] as number);
  if (closed) path.closePath();
}

export function prepareCadScene(drawing: CadDrawing): CadScene {
  const [minX, minY, maxX, maxY] = drawing.extents;
  const base = {
    bounds: drawing.extents as Bounds,
    cellSize: [(maxX - minX) / GRID_CELLS, (maxY - minY) / GRID_CELLS] as [number, number],
  };
  const cells: number[][] = Array.from({ length: GRID_CELLS * GRID_CELLS }, () => []);
  const batchByKey = new Map<string, CadBatch>();
  const batches: CadBatch[] = [];
  const pointsInBatch = new Map<CadBatch, number>();
  const entityBounds = drawing.entities.map((entity, index) => {
    const box = pointsBounds(entity.p);
    for (const [cx, cy] of cellsOverlapping(base, box)) cells[cx * GRID_CELLS + cy]?.push(index);

    const key = `${entity.l}:${entity.c}`;
    let batch = batchByKey.get(key);
    // Chrome slows sharply when one Path2D holds very many points, so a batch is closed when full.
    if (!batch || (pointsInBatch.get(batch) ?? 0) > MAX_BATCH_POINTS) {
      const layer = drawing.layers[entity.l];
      batch = {
        layer: entity.l,
        color: drawing.colors[entity.c] ?? '#000000',
        dashed: !CONTINUOUS_LINETYPES.has((layer?.linetype ?? '').toLowerCase()),
        stroke: null,
        fill: null,
      };
      batchByKey.set(key, batch);
      batches.push(batch);
    }
    pointsInBatch.set(batch, (pointsInBatch.get(batch) ?? 0) + entity.p.length / 2);
    if (entity.fill) {
      batch.fill ??= new Path2D();
      appendPolyline(batch.fill, entity.p, true);
    } else {
      batch.stroke ??= new Path2D();
      appendPolyline(batch.stroke, entity.p, entity.closed);
    }
    return box;
  });

  return { ...base, drawing, entityBounds, batches, cells };
}

/** How many lines and texts of each layer lie at least partly in `area`, for layers with any. */
export function countLayersIn(scene: Pick<CadScene, 'drawing' | 'entityBounds'>, area: Bounds): Map<number, number> {
  const [minX, minY, maxX, maxY] = area;
  const counts = new Map<number, number>();
  const add = (layer: number) => counts.set(layer, (counts.get(layer) ?? 0) + 1);
  scene.drawing.entities.forEach((entity, index) => {
    const box = scene.entityBounds[index];
    if (box && box[0] <= maxX && box[2] >= minX && box[1] <= maxY && box[3] >= minY) add(entity.l);
  });
  for (const text of scene.drawing.texts) {
    if (text.x >= minX && text.x <= maxX && text.y >= minY && text.y <= maxY) add(text.l);
  }
  return counts;
}
