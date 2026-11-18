import { TEXT_LINE_SPACING } from './cadPick';
import { readableInk, type CadPaper } from './cadPaper';
import { gridStepUnits } from './cadUnits';
import { CAD_SNAP_LABELS, type CadSnapKind } from './cadSnap';
import { toScreen, toWorld, type CadView } from './cadView';
import type { CadScene } from './prepareCadScene';
import { measureAnchor, type CadMeasure, type CadMeasureReadout } from './cadMeasure';
import type { CadColorMode, CadSelection } from './types';

const DASH_PX: [number, number] = [6, 4];
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
  measures: Array<CadMeasure & { label: string | null; readout?: CadMeasureReadout | null }>;
  /**
   * The live viewer paints captions as HTML so they can be copied.
   * Export paints the same caption onto the canvas.
   */
  paintMeasureCallout?: boolean;
  /** Where the next measuring click would land, with its snap and the line leading to it. */
  pointer: CadPointer | null;
};

type CadPointer = {
  point: [number, number];
  snap: CadSnapKind | null;
  /** The previous point of the measurement in progress. */
  from: [number, number] | null;
  /** The first point of an area, so the preview shows the closing edge. */
  close: [number, number] | null;
  /** Degrees the line from `from` is locked to, or 0. */
  lock: number;
};

function inkFor(color: string, state: CadDrawState): string {
  return state.colorMode === 'mono' ? state.paper.ink : readableInk(color, state.paper);
}

function drawGrid(ctx: CanvasRenderingContext2D, scene: CadScene, state: CadDrawState) {
  const metersPerUnit = scene.drawing.meters_per_unit;
  if (!metersPerUnit) return;
  const { view, width, height } = state;
  const step = gridStepUnits(metersPerUnit, view.scale / state.dpr);
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

const MEASURE_FILL = 'rgba(13, 71, 153, 0.42)';
const MEASURE_STROKE = '#7EAEFF';
const MEASURE_TITLE = '#F0F5FF';
const MEASURE_DETAIL = '#D5DCE8';
const MEASURE_FONT = '-apple-system, BlinkMacSystemFont, sans-serif';

function drawMeasure(ctx: CanvasRenderingContext2D, state: CadDrawState) {
  if (state.measures.length === 0) return;
  const { dpr } = state;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const measure of state.measures) {
    const points = measure.points.map(([x, y]) => toScreen(state.view, x, y));
    if (points.length === 0) continue;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (measure.mode === 'area' && points.length > 2) {
      ctx.closePath();
      ctx.fillStyle = MEASURE_FILL;
      ctx.fill();
    }
    ctx.strokeStyle = MEASURE_STROKE;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    if (measure.mode === 'angle') drawAngleArc(ctx, points, dpr);
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#0D4799';
      ctx.stroke();
    }
    if (state.paintMeasureCallout === false || !measure.readout) continue;
    const anchor = measureAnchor(measure);
    if (!anchor) continue;
    const [x, y] = toScreen(state.view, anchor[0], anchor[1]);
    drawMeasureLabel(ctx, measure.readout, x, y, dpr, measure.mode === 'angle');
  }
}

/** Screen pixels (before dpr) of the arc that marks which angle is measured. */
const ANGLE_ARC_PX = 26;

/**
 * Marks the measured angle at the corner (the middle point) with an arc between the two arms,
 * the short way round, so it is clear which of the two angles the value belongs to. The radius
 * is in screen pixels, so it reads the same at every zoom, and shrinks to fit short arms.
 */
function drawAngleArc(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, dpr: number) {
  const [a, b, c] = points;
  if (!a || !b || !c) return;
  const armA = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const armC = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const radius = Math.min(ANGLE_ARC_PX * dpr, armA * 0.45, armC * 0.45);
  if (radius < 3 * dpr) return;
  const start = Math.atan2(a[1] - b[1], a[0] - b[0]);
  let sweep = Math.atan2(c[1] - b[1], c[0] - b[0]) - start;
  // Normalise to (-π, π], so the arc spans the angle that is reported (never the reflex one).
  sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.arc(b[0], b[1], radius, start, start + sweep, sweep < 0);
  ctx.closePath();
  ctx.fillStyle = MEASURE_FILL;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(b[0], b[1], radius, start, start + sweep, sweep < 0);
  ctx.strokeStyle = MEASURE_STROKE;
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();
}

/** The value sits on the geometry. Lines are stacked with a gap so they do not run together. */
function drawMeasureLabel(
  ctx: CanvasRenderingContext2D,
  readout: CadMeasureReadout,
  x: number,
  y: number,
  dpr: number,
  above: boolean,
) {
  const titleSize = 13 * dpr;
  const detailSize = 11 * dpr;
  const gap = 8 * dpr;
  const block = titleSize + (readout.detail ? gap + detailSize : 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  const top = above ? y - 14 * dpr - block : y - block / 2;
  ctx.font = `650 ${titleSize}px ${MEASURE_FONT}`;
  paintOutlinedText(ctx, readout.title, x, top, MEASURE_TITLE, dpr);
  if (!readout.detail) return;
  ctx.font = `550 ${detailSize}px ${MEASURE_FONT}`;
  paintOutlinedText(ctx, readout.detail, x, top + titleSize + gap, MEASURE_DETAIL, dpr);
}

function paintOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  dpr: number,
) {
  ctx.lineWidth = 1.75 * dpr;
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawSnapMarker(ctx: CanvasRenderingContext2D, kind: CadSnapKind, x: number, y: number, size: number) {
  ctx.beginPath();
  switch (kind) {
    case 'endpoint':
      ctx.rect(x - size, y - size, size * 2, size * 2);
      break;
    case 'midpoint':
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y + size * 0.8);
      ctx.lineTo(x - size, y + size * 0.8);
      ctx.closePath();
      break;
    case 'center':
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.moveTo(x - size * 0.4, y);
      ctx.lineTo(x + size * 0.4, y);
      ctx.moveTo(x, y - size * 0.4);
      ctx.lineTo(x, y + size * 0.4);
      break;
    case 'intersection':
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      break;
    case 'perpendicular':
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x - size, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + size);
      break;
    case 'tangent':
      ctx.arc(x, y + size * 0.2, size * 0.75, 0, Math.PI * 2);
      ctx.moveTo(x - size, y - size * 0.55);
      ctx.lineTo(x + size, y - size * 0.55);
      break;
    case 'nearest':
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.lineTo(x + size, y + size);
      ctx.closePath();
      break;
    case 'grid':
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      break;
  }
  ctx.stroke();
}

function drawPointer(ctx: CanvasRenderingContext2D, state: CadDrawState) {
  const pointer = state.pointer;
  if (!pointer) return;
  const { dpr, view } = state;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const [px, py] = toScreen(view, pointer.point[0], pointer.point[1]);
  if (pointer.from) {
    const [fx, fy] = toScreen(view, pointer.from[0], pointer.from[1]);
    if (pointer.lock) {
      // A faint guide along the locked direction, across the whole view.
      const angle = Math.atan2(py - fy, px - fx);
      const reach = state.width + state.height;
      ctx.strokeStyle = state.accent.hover;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([2 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(fx - Math.cos(angle) * reach, fy - Math.sin(angle) * reach);
      ctx.lineTo(fx + Math.cos(angle) * reach, fy + Math.sin(angle) * reach);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = state.accent.selection;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(px, py);
    if (pointer.close) {
      const [cx, cy] = toScreen(view, pointer.close[0], pointer.close[1]);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!pointer.snap) return;
  ctx.strokeStyle = state.accent.hover;
  ctx.lineWidth = 2 * dpr;
  drawSnapMarker(ctx, pointer.snap, px, py, 6 * dpr);
  const label = CAD_SNAP_LABELS[pointer.snap];
  ctx.font = `600 ${11 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = state.paper.background;
  ctx.strokeText(label, px + 10 * dpr, py + 10 * dpr);
  ctx.fillStyle = state.accent.hover;
  ctx.fillText(label, px + 10 * dpr, py + 10 * dpr);
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
  drawPointer(ctx, state);
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
