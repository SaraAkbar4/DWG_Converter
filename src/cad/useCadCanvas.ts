import { useCallback, useEffect, useRef, useState } from 'react';
import { pickAt, snapToVertex } from './cadPick';
import type { Bounds } from './cadGeometry';
import type { CadPaper } from './cadPaper';
import { centerOn, fitView, toWorld, zoomAt, type CadView } from './cadView';
import { emptyFrameCache, renderCadFrame } from './cadFrameCache';
import type { CadHighlight, CadLineWeight } from './drawCadScene';
import type { CadScene } from './prepareCadScene';
import type { CadColorMode, CadSelection } from './types';
import { measureLabel, type CadMeasure, type CadMeasureMode, type CadPoint } from './cadMeasure';

const PICK_TOLERANCE_PX = 5;
const CLICK_SLOP_PX = 4;
const WHEEL_ZOOM_RATE = 0.0015;
const FLY_TO_SCREEN_FRACTION = 0.25;
const SETTLE_MS = 150;

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
};

export function useCadCanvas(options: Options) {
  const { scene, colorMode, paper, showGrid, lineWeight, minTextPx, english, image } = options;
  const { accent, hiddenLayers, highlight, tool, measureMode, measures, draft, onDraft, onCommit, onStopMeasure, onSelect } = options;
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
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [view, setView] = useState<CadView | null>(null);
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
      ...measures.map((item) => ({ ...item, label: scene ? measureLabel(item, scene.drawing) : null })),
      ...(draft.length
        ? [{ mode: measureMode, points: draft, label: scene ? measureLabel({ mode: measureMode, points: draft }, scene.drawing) : null }]
        : []),
    ],
    measureMode,
    draft,
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
      setCursor([wx, wy]);
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
      const [wx, wy] = worldAt(...local(event));
      if (stateRef.current.tool === 'measure') {
        const { measureMode: mode, onDraft: setDraft, onCommit: commit } = stateRef.current;
        const points = marksRef.current.draft;
        // Measuring snaps to a nearby endpoint or vertex when there is one.
        const point = snapToVertex(scene, wx, wy, tolerance() * 2, stateRef.current.hiddenLayers) ?? ([wx, wy] as CadPoint);
        const [first] = points;
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

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
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
  }, [scene, fit, requestRender]);

  return {
    canvasRef,
    cursor,
    view,
    viewScale: view?.scale ?? 0,
    fit,
    zoomBy,
    flyTo,
    zoomToBounds,
  };
}
