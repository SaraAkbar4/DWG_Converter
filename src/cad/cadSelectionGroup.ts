import type { Bounds } from './cadGeometry';
import type { CadDrawing, CadSelection } from './types';

export type CadSelectMode = 'object' | 'layer' | 'block';

export type CadGroup = {
  mode: CadSelectMode;
  layer: number;
  block: number;
  entities: number[];
  texts: number[];
  bounds: Bounds | null;
};

function anchorOf(drawing: CadDrawing, selection: CadSelection) {
  if (!selection) return null;
  const source =
    selection.kind === 'entity'
      ? drawing.entities[selection.index]
      : drawing.texts[selection.index];
  return source ? { layer: source.l, block: source.b } : null;
}

function unionBounds(
  drawing: CadDrawing,
  entityBounds: Bounds[],
  entities: number[],
  texts: number[],
): Bounds | null {
  let box: Bounds | null = null;
  const grow = (b: Bounds) => {
    box = box
      ? [
          Math.min(box[0], b[0]),
          Math.min(box[1], b[1]),
          Math.max(box[2], b[2]),
          Math.max(box[3], b[3]),
        ]
      : [...b];
  };
  for (const i of entities) {
    const b = entityBounds[i];
    if (b) grow(b);
  }
  for (const i of texts) {
    const t = drawing.texts[i];
    if (t) grow([t.x - t.h, t.y - t.h, t.x + t.h, t.y + t.h]);
  }
  return box;
}

export function selectionGroup(
  drawing: CadDrawing,
  entityBounds: Bounds[],
  selection: CadSelection,
  requestedMode: CadSelectMode,
): CadGroup | null {
  const anchor = anchorOf(drawing, selection);
  if (!selection || !anchor) return null;
  const mode = requestedMode === 'block' && anchor.block === 0 ? 'object' : requestedMode;
  let entities: number[];
  let texts: number[];
  if (mode === 'object') {
    entities = selection.kind === 'entity' ? [selection.index] : [];
    texts = selection.kind === 'text' ? [selection.index] : [];
  } else {
    const matches = (item: { l: number; b: number }) =>
      mode === 'layer' ? item.l === anchor.layer : item.b === anchor.block;
    entities = drawing.entities.flatMap((e, i) => (matches(e) ? [i] : []));
    texts = drawing.texts.flatMap((t, i) => (matches(t) ? [i] : []));
  }
  return {
    mode,
    layer: anchor.layer,
    block: anchor.block,
    entities,
    texts,
    bounds: unionBounds(drawing, entityBounds, entities, texts),
  };
}
