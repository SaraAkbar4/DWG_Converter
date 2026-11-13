import { TEXT_LINE_SPACING } from './cadPick';
import { readableInk, type CadPaper } from './cadPaper';
import { niceMetricStep } from './cadUnits';
import { toScreen, toWorld, type CadView } from './cadView';
import type { CadScene } from './prepareCadScene';
import { measureAnchor, type CadMeasure } from './cadMeasure';
import type { CadColorMode, CadSelection } from './types';

const DASH_PX: [number, number] = [6, 4];
const GRID_MIN_PX = 18;
const GRID_MAJOR_EVERY = 5;
const GLOW_PX = 8;

export type CadHighlight = { path: Path2D; texts: ReadonlySet<number> };

export type CadLineWeight = { px: number } | { world: number; minPx: number; maxPx: number };

export type CadDrawState = {
  view: CadView;
  width: number;
  height: number;
  dpr: number;
  colorMode: CadColorMode;
  paper: CadPaper;
  showGrid: boolean;
  lineWeight: CadLineWeight;
  minTextPx: number;
  english: boolean;
  image: HTMLImageElement | null;
  accent: { selection: string; hover: string };
  hiddenLayers: ReadonlySet<number>;
  hover: CadSelection;
  highlight: CadHighlight | null;
  /** Finished measurements, plus the one being drawn (label is null until it can be read). */
  measures: Array<CadMeasure & { label: string | null }>;
};

function inkFor(color: string, state: CadDrawState): string {
  return state.colorMode === 'mono' ? state.paper.ink : readableInk(color, state.paper);
}

function drawGrid(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  const metersPerUnit = scene.drawing.meters_per_unit;
  if (!metersPerUnit) return;
  const { view, width, height } = state;
  const pxPerMeter = view.scale / metersPerUnit / state.dpr;
  const stepMeters = niceMetricStep(pxPerMeter, GRID_MIN_PX);
  const step = stepMeters / metersPerUnit;
  const [originX, originY] = [scene.bounds[0], scene.bounds[1]];
  const [left, top] = toWorld(view, 0, 0);
  const [right, bottom] = toWorld(view, width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;
  const line = (index: number, from: [number, number], to: [number, number]) => {
    ctx.strokeStyle =
      index % GRID_MAJOR_EVERY === 0 ? state.paper.gridMajor : state.paper.gridMinor;
    ctx.beginPath();
    ctx.moveTo(Math.round(from[0]) + 0.5, Math.round(from[1]) + 0.5);
    ctx.lineTo(Math.round(to[0]) + 0.5, Math.round(to[1]) + 0.5);
    ctx.stroke();
  };
  for (let i = Math.ceil((left - originX) / step); originX + i * step <= right; i++) {
    const x = originX + i * step;
    line(i, toScreen(view, x, top), toScreen(view, x, bottom));
  }
  for (let j = Math.ceil((bottom - originY) / step); originY + j * step <= top; j++) {
    const y = originY + j * step;
    line(j, toScreen(view, left, y), toScreen(view, right, y));
  }
}

function drawTexts(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  const { view, width, height } = state;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  scene.drawing.texts.forEach((text, index) => {
    if (state.hiddenLayers.has(text.l)) return;
    const px = text.h * view.scale;
    if (px < state.minTextPx * state.dpr) return;
    const [sx, sy] = toScreen(view, text.x, text.y);
    const label = (state.english && text.en) || text.s;
    const reach = px * label.length;
    if (sx < -reach || sy < -reach || sx > width + reach || sy > height + reach) return;
    const highlighted = state.highlight?.texts.has(index);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((-text.r * Math.PI) / 180);
    ctx.fillStyle = highlighted
      ? state.accent.selection
      : inkFor(scene.drawing.colors[text.c] ?? '', state);
    ctx.font = `${highlighted ? '600 ' : ''}${px}px sans-serif`;
    ctx.textAlign = text.ha;
    ctx.textBaseline = text.va === 'baseline' ? 'alphabetic' : text.va;
    const lines = label.split('\n');
    const shift =
      text.va === 'bottom'
        ? -(lines.length - 1)
        : text.va === 'middle'
          ? -(lines.length - 1) / 2
          : 0;
    lines.forEach((line, i) => ctx.fillText(line, 0, (i + shift) * px * TEXT_LINE_SPACING));
    ctx.restore();
  });
}

function strokeWorld(
  ctx: CanvasRenderingContext2D,
  state: CadDrawState,
  path: Path2D,
  color: string,
  widthPx: number,
) {
  const { view } = state;
  ctx.setTransform(view.scale, 0, 0, -view.scale, view.tx, view.ty);
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / view.scale;
  ctx.shadowColor = color;
  ctx.shadowBlur = GLOW_PX * state.dpr;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
}

export function entityPath(scene: CadScene, indices: number[]): Path2D {
  const path = new Path2D();
  for (const index of indices) {
    const entity = scene.drawing.entities[index];
    if (!entity) continue;
    path.moveTo(entity.p[0] as number, entity.p[1] as number);
    for (let i = 2; i < entity.p.length; i += 2) {
      path.lineTo(entity.p[i] as number, entity.p[i + 1] as number);
    }
    if (entity.closed || entity.fill) path.closePath();
  }
  return path;
}

function drawHover(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  const hover = state.hover;
  if (!hover) return;
  if (hover.kind === 'entity') {
    strokeWorld(ctx, state, entityPath(scene, [hover.index]), state.accent.hover, 2 * state.dpr);
    return;
  }
  const text = scene.drawing.texts[hover.index];
  if (!text) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const [sx, sy] = toScreen(state.view, text.x, text.y);
  ctx.strokeStyle = state.accent.hover;
  ctx.lineWidth = 1.5 * state.dpr;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(6 * state.dpr, text.h * state.view.scale), 0, Math.PI * 2);
  ctx.stroke();
}

function drawMeasure(ctx: CanvasRenderingContext2D, state: CadDrawState) {
  if (state.measures.length === 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = state.accent.selection;
  ctx.fillStyle = state.accent.selection;
  ctx.lineWidth = 2 * state.dpr;
  ctx.setLineDash([]);
  ctx.font = `600 ${13 * state.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const measure of state.measures) {
    const points = measure.points.map(([x, y]) => toScreen(state.view, x, y));
    if (points.length === 0) continue;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (measure.mode === 'area' && points.length > 2) {
      ctx.closePath();
      ctx.globalAlpha = 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x, y, 4 * state.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    const anchor = measure.label ? measureAnchor(measure) : null;
    if (!measure.label || !anchor) continue;
    const [x, y] = toScreen(state.view, anchor[0], anchor[1]);
    ctx.lineWidth = 4 * state.dpr;
    ctx.strokeStyle = state.paper.background;
    ctx.strokeText(measure.label, x, y - 8 * state.dpr);
    ctx.fillStyle = state.accent.selection;
    ctx.fillText(measure.label, x, y - 8 * state.dpr);
    ctx.lineWidth = 2 * state.dpr;
    ctx.strokeStyle = state.accent.selection;
  }
}

export function drawCadBase(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = state.paper.background;
  ctx.fillRect(0, 0, state.width, state.height);
  if (state.showGrid) drawGrid(ctx, scene, state);

  if (state.image) {
    drawImage(ctx, scene, state, state.image);
  } else {
    drawVectors(ctx, scene, state);
    drawTexts(ctx, scene, state);
  }
}

export function drawCadOverlays(
  ctx: CanvasRenderingContext2D,
  scene: CadScene,
  state: CadDrawState,
) {
  if (state.highlight) {
    strokeWorld(ctx, state, state.highlight.path, state.accent.selection, 2 * state.dpr);
  }
  drawHover(ctx, scene, state);
  drawMeasure(ctx, state);
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  scene: CadScene,
  state: CadDrawState,
  image: HTMLImageElement,
) {
  const [minX, minY, maxX, maxY] = scene.bounds;
  const [left, top] = toScreen(state.view, minX, maxY);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    left,
    top,
    (maxX - minX) * state.view.scale,
    (maxY - minY) * state.view.scale,
  );
}

function drawVectors(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  const { view } = state;
  ctx.setTransform(view.scale, 0, 0, -view.scale, view.tx, view.ty);
  const weight = state.lineWeight;
  const cssPx =
    'px' in weight
      ? weight.px
      : Math.min(weight.maxPx, Math.max(weight.minPx, (weight.world * view.scale) / state.dpr));
  ctx.lineWidth = (cssPx * state.dpr) / view.scale;
  const dash = DASH_PX.map((v) => (v * state.dpr) / view.scale);
  for (const batch of scene.batches) {
    if (state.hiddenLayers.has(batch.layer)) continue;
    const ink = inkFor(batch.color, state);
    if (batch.stroke) {
      ctx.setLineDash(batch.dashed ? dash : []);
      ctx.strokeStyle = ink;
      ctx.stroke(batch.stroke);
    }
    if (batch.fill) {
      ctx.fillStyle = ink;
      ctx.fill(batch.fill);
    }
  }
  ctx.setLineDash([]);
}
