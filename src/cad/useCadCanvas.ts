import { useCallback, useEffect, useRef, useState } from 'react';
import { pickAt } from './cadPick';
import { findSnap, lockAngle, type CadAngleLock, type CadSnapKind, type CadSnapSettings } from './cadSnap';
import { gridStepUnits } from './cadUnits';
import type { Bounds } from './cadGeometry';
import { PRINT_PAPER, type CadPaper } from './cadPaper';
import { arrowPanOffset, centerOn, fitView, panView, toWorld, zoomAt, type CadScreenRect, type CadView } from './cadView';
import { emptyFrameCache, renderCadFrame } from './cadFrameCache';
import { drawCadBase, drawCadOverlays, type CadHighlight, type CadLineWeight } from './drawCadScene';
import type { CadScene } from './prepareCadScene';
import type { CadColorMode, CadSelection } from './types';
import { measureLabel, measureReadout, type CadMeasure, type CadMeasureMode, type CadPoint } from './cadMeasure';

const PICK_TOLERANCE_PX = 5;
/** How close the cursor must come to a point, in CSS pixels, for a measurement to snap to it. */
const SNAP_TOLERANCE_PX = 10;
const CLICK_SLOP_PX = 4;
const WHEEL_ZOOM_RATE = 0.0015;
const FLY_TO_SCREEN_FRACTION = 0.25;
const SETTLE_MS = 150;
/** Smallest text, in CSS pixels at the sheet's own scale, still drawn on an export. */
const EXPORT_MIN_TEXT_PX = 1;

export type { CadMeasureMode } from './cadMeasure';
export type CadTool = 'select' | 'measure' | 'pan';
/** Points a measurement takes before the next click starts a new one. */
const MEASURE_POINTS: Record<CadMeasureMode, number> = { distance: 2, angle: 3, area: Infinity };

const sameSelection = (a: CadSelection, b: CadSelection) =>
  a?.kind === b?.kind && a?.index === b?.index;

type Options = {
  scene: CadScene | null;
  colorMode: CadColorMode;
  paper: CadPaper;
  showGrid: boolean;
  lineWeight: CadLineWeight;
  minTextPx: number;
  english: boolean;
  image: HTMLImageElement | null;
  accent: { selection: string; hover: string };
  hiddenLayers: ReadonlySet<number>;
  highlight: CadHighlight | null;
  tool: CadTool;
  measureMode: CadMeasureMode;
  /** Finished measurements for this sheet. They stay until the viewer closes. */
  measures: CadMeasure[];
  /** The measurement currently being clicked out. */
  draft: CadPoint[];
  onDraft: (points: CadPoint[]) => void;
  onCommit: (measure: CadMeasure) => void;
  onStopMeasure: () => void;
  onSelect: (selection: CadSelection) => void;
  snapSettings: CadSnapSettings;
  /** Degrees measuring lines are locked to (90 = horizontal or vertical), or 0. Shift flips it while held. */
  angleLock: CadAngleLock;
};

/** The cursor in drawing units, and where a measuring click would land. */
export type CadCursor = { x: number; y: number; snap: CadSnapKind | null; lock: number };

export function useCadCanvas(options: Options) {
  const { scene, colorMode, paper, showGrid, lineWeight, minTextPx, english, image } = options;
  const { accent, hiddenLayers, highlight, tool, measureMode, measures, draft, onDraft, onCommit, onStopMeasure, onSelect } = options;
  const { snapSettings, angleLock } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<CadView | null>(null);
  const fitScaleRef = useRef(1);
  const fittedViewRef = useRef<CadView | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const frameRef = useRef(0);
  const cacheRef = useRef(emptyFrameCache());
  const interactionAtRef = useRef(0);
  const settleRef = useRef(0);
  const [hover, setHover] = useState<CadSelection>(null);
  const [cursor, setCursor] = useState<CadCursor | null>(null);
  const [view, setView] = useState<CadView | null>(null);
  // While the last arm of an angle is being placed, the cursor stands in for the third point,
  // so its arc and value follow the pointer instead of appearing only after the click.
  const livePoints: CadPoint[] =
    tool === 'measure' && measureMode === 'angle' && draft.length === 2 && cursor ? [...draft, [cursor.x, cursor.y]] : draft;
  const draw = {
    colorMode,
    paper,
    showGrid,
    lineWeight,
    minTextPx,
    english,
    image,
    accent,
    hiddenLayers,
    highlight,
    hover,
    measures: [
      ...measures.map((item) => ({
        ...item,
        label: scene ? measureLabel(item, scene.drawing) : null,
        readout: scene ? measureReadout(item, scene.drawing) : null,
      })),
      ...(draft.length
        ? [{
            mode: measureMode,
            points: livePoints,
            label: scene ? measureLabel({ mode: measureMode, points: livePoints }, scene.drawing) : null,
            readout: scene ? measureReadout({ mode: measureMode, points: livePoints }, scene.drawing) : null,
          }]
        : []),
    ],
    measureMode,
    draft,
    pointer:
      tool === 'measure' && cursor
        ? {
            point: [cursor.x, cursor.y] as [number, number],
            snap: cursor.snap,
            from: draft.at(-1) ?? null,
            close: measureMode === 'area' && draft.length >= 2 ? (draft[0] ?? null) : null,
            lock: draft.length ? cursor.lock : 0,
          }
        : null,
    snapSettings,
    angleLock,
    onDraft,
    onCommit,
    onStopMeasure,
    tool,
    onSelect,
  };
  const stateRef = useRef(draw);
  stateRef.current = draw;
  // Clicks can land before React re-renders, so the points in progress live here too.
  const marksRef = useRef({ measures, draft });
  useEffect(() => {
    marksRef.current = { measures, draft };
  }, [measures, draft]);

  const requestRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const view = viewRef.current;
      if (!canvas || !ctx || !view || !scene) return;
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = sizeRef.current;
      const state = {
        ...stateRef.current,
        view: { scale: view.scale * dpr, tx: view.tx * dpr, ty: view.ty * dpr },
        width: width * dpr,
        height: height * dpr,
        dpr,
      };
      const interacting = performance.now() - interactionAtRef.current < SETTLE_MS;
      if (renderCadFrame(ctx, scene, state, cacheRef.current, interacting).stale) {
        window.clearTimeout(settleRef.current);
        settleRef.current = window.setTimeout(requestRender, SETTLE_MS);
      }
      setView(view);
    });
  }, [scene]);

  const fit = useCallback(() => {
    if (!scene) return;
    const { width, height } = sizeRef.current;
    viewRef.current = fitView(scene.bounds, width, height);
    fitScaleRef.current = viewRef.current.scale;
    fittedViewRef.current = viewRef.current;
    requestRender();
  }, [scene, requestRender]);

  const zoomBy = useCallback(
    (factor: number) => {
      const view = viewRef.current;
      if (!view) return;
      const { width, height } = sizeRef.current;
      viewRef.current = zoomAt(view, fitScaleRef.current, width / 2, height / 2, factor);
      requestRender();
    },
    [requestRender],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const view = viewRef.current;
      if (!view) return;
      interactionAtRef.current = performance.now();
      viewRef.current = panView(view, dx, dy);
      requestRender();
    },
    [requestRender],
  );

  /** Pan one arrow-key step. `key` is a KeyboardEvent key such as "ArrowLeft". Shift moves farther. */
  const panArrow = useCallback(
    (key: string, fast = false) => {
      const { width, height } = sizeRef.current;
      const offset = arrowPanOffset(key, width, height, fast);
      if (!offset) return;
      panBy(offset.dx, offset.dy);
    },
    [panBy],
  );

  /**
   * Draws the drawing through `view` onto a new canvas, on white paper like a plot: no grid,
   * selection, hover or measuring cursor, but finished measurements stay. `dpr` sets how thick
   * lines and labels are (2 draws them twice their on-screen width). Null before there is a scene.
   */
  const renderSheet = useCallback(
    (view: CadView, width: number, height: number, dpr: number, hiddenLayers?: ReadonlySet<number>): HTMLCanvasElement | null => {
      if (!scene || width < 1 || height < 1) return null;
      const out = document.createElement('canvas');
      out.width = Math.round(width);
      out.height = Math.round(height);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const current = stateRef.current;
      const state = {
        ...current,
        view,
        width: out.width,
        height: out.height,
        dpr,
        paper: PRINT_PAPER,
        showGrid: false,
        // Export can leave out layers that are on screen, or bring back ones that are off.
        hiddenLayers: hiddenLayers ?? current.hiddenLayers,
        // Text the screen hides as too small to read can still be read on paper.
        minTextPx: Math.min(current.minTextPx, EXPORT_MIN_TEXT_PX),
        hover: null,
        highlight: null,
        pointer: null,
        // Finished measurements only; the one still being clicked out is not part of the drawing.
        measures: marksRef.current.measures.map((item) => ({
          ...item,
          label: measureLabel(item, scene.drawing),
          readout: measureReadout(item, scene.drawing),
        })),
      };
      drawCadBase(ctx, scene, state);
      drawCadOverlays(ctx, scene, state);
      return out;
    },
    [scene],
  );

  /** The part of the drawing a screen rectangle (CSS pixels on the canvas) covers. */
  const screenRectBounds = useCallback((rect: CadScreenRect): Bounds | null => {
    const view = viewRef.current;
    if (!view || rect.width <= 0 || rect.height <= 0) return null;
    const [x1, y1] = toWorld(view, rect.x, rect.y);
    const [x2, y2] = toWorld(view, rect.x + rect.width, rect.y + rect.height);
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  }, []);

  /** The part of the drawing on screen now. */
  const visibleBounds = useCallback(() => {
    const { width, height } = sizeRef.current;
    return screenRectBounds({ x: 0, y: 0, width, height });
  }, [screenRectBounds]);

  const flyTo = useCallback(
    (x: number, y: number, worldSize: number) => {
      const { width, height } = sizeRef.current;
      const scale = (Math.min(width, height) * FLY_TO_SCREEN_FRACTION) / Math.max(worldSize, 1e-6);
      viewRef.current = centerOn({ scale, tx: 0, ty: 0 }, width, height, x, y);
      requestRender();
    },
    [requestRender],
  );

  const zoomToBounds = useCallback(
    (bounds: Bounds) => {
      const { width, height } = sizeRef.current;
      const [minX, minY, maxX, maxY] = bounds;
      const pad = Math.max(maxX - minX, maxY - minY) * 0.15 || 1;
      viewRef.current = fitView([minX - pad, minY - pad, maxX + pad, maxY + pad], width, height);
      requestRender();
    },
    [requestRender],
  );

  useEffect(requestRender, [
    requestRender,
    colorMode,
    paper,
    showGrid,
    lineWeight,
    minTextPx,
    english,
    image,
    accent,
    hiddenLayers,
    highlight,
    hover,
    measures,
    draft,
    measureMode,
    cursor,
    tool,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return undefined;
    const container = canvas.parentElement ?? canvas;
    const observer = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = container;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const previous = sizeRef.current;
      sizeRef.current = { width, height };
      const view = viewRef.current;
      if (!view || previous.width === 0 || view === fittedViewRef.current) {
        fit();
        return;
      }
      viewRef.current = {
        ...view,
        tx: view.tx + (width - previous.width) / 2,
        ty: view.ty + (height - previous.height) / 2,
      };
      requestRender();
    });
    observer.observe(container);

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top] as [number, number];
    };
    const worldAt = (sx: number, sy: number) => toWorld(viewRef.current as CadView, sx, sy);
    const tolerance = () => PICK_TOLERANCE_PX / (viewRef.current?.scale ?? 1);
    /** Where a measuring click at (sx, sy) lands: snapped to the drawing, then held to the locked angle. */
    const resolve = (sx: number, sy: number, shift: boolean): CadCursor => {
      const [wx, wy] = worldAt(sx, sy);
      const state = stateRef.current;
      if (state.tool !== 'measure') return { x: wx, y: wy, snap: null, lock: 0 };
      const points = marksRef.current.draft;
      const from = points.length < MEASURE_POINTS[state.measureMode] ? (points.at(-1) ?? null) : null;
      const view = viewRef.current as CadView;
      const metersPerUnit = scene.drawing.meters_per_unit;
      const grid =
        state.showGrid && metersPerUnit
          ? { step: gridStepUnits(metersPerUnit, view.scale), origin: [scene.bounds[0], scene.bounds[1]] as CadPoint }
          : null;
      const snap = findSnap(scene, wx, wy, SNAP_TOLERANCE_PX / view.scale, {
        settings: state.snapSettings,
        hiddenLayers: state.hiddenLayers,
        from,
        grid,
      });
      const lock = shift ? (state.angleLock ? 0 : 90) : state.angleLock;
      let point: CadPoint = snap?.point ?? [wx, wy];
      if (from && lock) point = lockAngle(from, point, lock);
      return { x: point[0], y: point[1], snap: snap?.kind ?? null, lock };
    };
    let last: { sx: number; sy: number } | null = null;
    const onShift = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || !last || !viewRef.current) return;
      setCursor(resolve(last.sx, last.sy, event.type === 'keydown'));
    };
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const touches = new Map<number, [number, number]>();
    const pinchSpan = () => {
      const [a, b] = [...touches.values()] as [[number, number], [number, number]];
      return { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = viewRef.current;
      if (!view) return;
      const [sx, sy] = local(event);
      interactionAtRef.current = performance.now();
      viewRef.current = zoomAt(
        view,
        fitScaleRef.current,
        sx,
        sy,
        Math.exp(-event.deltaY * WHEEL_ZOOM_RATE),
      );
      requestRender();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, local(event));
      drag = touches.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : null;
    };
    const onPointerMove = (event: PointerEvent) => {
      const [sx, sy] = local(event);
      if (!viewRef.current) return;
      if (touches.size === 2 && touches.has(event.pointerId)) {
        const before = pinchSpan();
        touches.set(event.pointerId, [sx, sy]);
        const after = pinchSpan();
        interactionAtRef.current = performance.now();
        const zoomed = zoomAt(
          viewRef.current,
          fitScaleRef.current,
          after.x,
          after.y,
          after.distance / Math.max(before.distance, 1),
        );
        viewRef.current = { ...zoomed, tx: zoomed.tx + after.x - before.x, ty: zoomed.ty + after.y - before.y };
        requestRender();
        return;
      }
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
        drag = { x: event.clientX, y: event.clientY, moved: true };
        interactionAtRef.current = performance.now();
        viewRef.current = {
          ...viewRef.current,
          tx: viewRef.current.tx + dx,
          ty: viewRef.current.ty + dy,
        };
        requestRender();
        return;
      }
      const [wx, wy] = worldAt(sx, sy);
      last = { sx, sy };
      setCursor(resolve(sx, sy, event.shiftKey));
      if (stateRef.current.tool === 'select') {
        const next = pickAt(scene, wx, wy, tolerance(), stateRef.current.hiddenLayers);
        setHover((current) => (sameSelection(current, next) ? current : next));
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (event.button !== 0) {
        drag = null;
        return;
      }
      const clicked = drag && !drag.moved;
      drag = null;
      if (!clicked || !viewRef.current) return;
      const [sx, sy] = local(event);
      const [wx, wy] = worldAt(sx, sy);
      if (stateRef.current.tool === 'measure') {
        const { measureMode: mode, onDraft: setDraft, onCommit: commit } = stateRef.current;
        const points = marksRef.current.draft;
        const landed = resolve(sx, sy, event.shiftKey);
        const point: CadPoint = [landed.x, landed.y];
        const [first] = points;
        const previous = points.at(-1);
        // A second click on the point just placed (easy to do with snapping on) would make an arm
        // with no length, which has no angle; it is ignored rather than measured.
        if (previous && points.length < MEASURE_POINTS[mode] && Math.hypot(point[0] - previous[0], point[1] - previous[1]) <= tolerance() * 0.2) return;
        if (mode === 'area' && first && points.length >= 3 && Math.hypot(point[0] - first[0], point[1] - first[1]) <= tolerance() * 2) {
          marksRef.current = { measures: [...marksRef.current.measures, { mode, points }], draft: [] };
          commit({ mode, points });
          return;
        }
        const limit = MEASURE_POINTS[mode];
        const next = points.length >= limit ? [point] : [...points, point];
        if (next.length >= limit) {
          const measure = { mode, points: next };
          marksRef.current = { measures: [...marksRef.current.measures, measure], draft: [] };
          commit(measure);
        } else {
          marksRef.current = { ...marksRef.current, draft: next };
          setDraft(next);
        }
      } else if (stateRef.current.tool === 'select') {
        stateRef.current.onSelect(
          pickAt(scene, wx, wy, tolerance(), stateRef.current.hiddenLayers),
        );
      }
    };
    const onPointerLeave = () => {
      last = null;
      setHover(null);
      setCursor(null);
    };
    const keepArea = () => {
      const { measureMode: mode, onDraft: setDraft, onCommit: commit } = stateRef.current;
      const points = marksRef.current.draft;
      if (mode === 'area' && points.length >= 3) {
        const measure = { mode, points };
        marksRef.current = { measures: [...marksRef.current.measures, measure], draft: [] };
        commit(measure);
        return;
      }
      marksRef.current = { ...marksRef.current, draft: [] };
      setDraft([]);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (stateRef.current.tool !== 'measure') return;
      event.preventDefault();
      keepArea();
      stateRef.current.onStopMeasure();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const { onCommit: commit } = stateRef.current;
      const points = marksRef.current.draft;
      if (event.key === 'Enter' && stateRef.current.measureMode === 'area' && points.length >= 3) {
        const measure = { mode: stateRef.current.measureMode, points };
        marksRef.current = { measures: [...marksRef.current.measures, measure], draft: [] };
        commit(measure);
        return;
      }
      if (event.key !== 'Escape') return;
      stateRef.current.onSelect(null);
      keepArea();
    };
    const onArrowPan = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || !viewRef.current) return;
      if (!arrowPanOffset(event.key, sizeRef.current.width, sizeRef.current.height, event.shiftKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      }
      event.preventDefault();
      panArrow(event.key, event.shiftKey);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onShift);
    window.addEventListener('keyup', onShift);
    window.addEventListener('keydown', onArrowPan);
    return () => {
      window.removeEventListener('keydown', onArrowPan);
      window.removeEventListener('keydown', onShift);
      window.removeEventListener('keyup', onShift);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(settleRef.current);
      frameRef.current = 0;
      cacheRef.current = emptyFrameCache();
      sizeRef.current = { width: 0, height: 0 };
    };
  }, [scene, fit, panArrow, requestRender]);

  return {
    canvasRef,
    cursor,
    view,
    viewScale: view?.scale ?? 0,
    fit,
    zoomBy,
    panArrow,
    flyTo,
    zoomToBounds,
    renderSheet,
    screenRectBounds,
    visibleBounds,
  };
}
