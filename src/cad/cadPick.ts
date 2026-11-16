import { pointInPolygon, polylineDistance } from './cadGeometry';
import { GRID_CELLS, cellsOverlapping, type CadScene } from './prepareCadScene';
import type { CadSelection, CadText } from './types';

const TEXT_WIDTH_PER_CHAR = 0.6;
export const TEXT_LINE_SPACING = 1.4;

function textBox(text: CadText): [number, number, number, number] {
  const lines = text.s.split('\n');
  const width = Math.max(...lines.map((line) => line.length)) * text.h * TEXT_WIDTH_PER_CHAR;
  const height = text.h * (1 + (lines.length - 1) * TEXT_LINE_SPACING);
  const left = text.ha === 'left' ? 0 : text.ha === 'center' ? -width / 2 : -width;
  const top =
    text.va === 'top'
      ? 0
      : text.va === 'middle'
        ? height / 2
        : text.va === 'bottom'
          ? height
          : text.h;
  return [left, top - height, left + width, top];
}

function hitText(text: CadText, x: number, y: number): boolean {
  const angle = (-text.r * Math.PI) / 180;
  const dx = x - text.x;
  const dy = y - text.y;
  const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
  const [minX, minY, maxX, maxY] = textBox(text);
  return lx >= minX && lx <= maxX && ly >= minY && ly <= maxY;
}

export function pickAt(
  scene: CadScene,
  x: number,
  y: number,
  tolerance: number,
  hiddenLayers: ReadonlySet<number>,
): CadSelection {
  const { texts, entities } = scene.drawing;
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i] as CadText;
    if (!hiddenLayers.has(text.l) && hitText(text, x, y)) return { kind: 'text', index: i };
  }

  let best: CadSelection = null;
  let bestDistance = tolerance;
  const seen = new Set<number>();
  for (const [cx, cy] of cellsOverlapping(scene, [
    x - tolerance,
    y - tolerance,
    x + tolerance,
    y + tolerance,
  ])) {
    for (const index of scene.cells[cx * GRID_CELLS + cy] ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const entity = entities[index];
      if (!entity || hiddenLayers.has(entity.l)) continue;
      const box = scene.entityBounds[index];
      if (
        box &&
        (x < box[0] - tolerance ||
          x > box[2] + tolerance ||
          y < box[1] - tolerance ||
          y > box[3] + tolerance)
      ) {
        continue;
      }
      const inside = entity.fill && pointInPolygon(x, y, entity.p);
      const distance = inside ? tolerance * 0.5 : polylineDistance(x, y, entity.p, entity.closed);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { kind: 'entity', index };
      }
    }
  }
  return best;
}
