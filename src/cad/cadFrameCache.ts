import { drawCadBase, drawCadOverlays, type CadDrawState } from './drawCadScene';
import type { CadView } from './cadView';
import type { CadScene } from './prepareCadScene';

const SLOW_BASE_MS = 25;

export type CadFrameCache = {
  canvas: HTMLCanvasElement | null;
  key: readonly unknown[];
  view: CadView | null;
  slow: boolean;
};

export const emptyFrameCache = (): CadFrameCache => ({
  canvas: null,
  key: [],
  view: null,
  slow: false,
});

const baseKey = (scene: CadScene, state: CadDrawState) => [
  scene,
  state.width,
  state.height,
  state.colorMode,
  state.paper,
  state.showGrid,
  JSON.stringify(state.lineWeight),
  state.minTextPx,
  state.english,
  state.image,
  state.hiddenLayers,
];

const sameKey = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

const sameView = (a: CadView, b: CadView) => a.scale === b.scale && a.tx === b.tx && a.ty === b.ty;

function blit(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  k: number,
  tx: number,
  ty: number,
) {
  // A cached frame can be empty while the viewer is collapsed (for example mid-transition).
  if (!source.width || !source.height) return;
  ctx.setTransform(k, 0, 0, k, tx, ty);
  ctx.drawImage(source, 0, 0);
}

export function renderCadFrame(
  ctx: CanvasRenderingContext2D,
  scene: CadScene,
  state: CadDrawState,
  cache: CadFrameCache,
  interacting: boolean,
): { stale: boolean } {
  const key = baseKey(scene, state);
  const { canvas, view } = cache;
  const reusable = canvas && view && sameKey(cache.key, key);
  let stale = false;

  if (reusable && sameView(view, state.view)) {
    blit(ctx, canvas, 1, 0, 0);
  } else if (reusable && cache.slow && interacting) {
    const k = state.view.scale / view.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = state.paper.background;
    ctx.fillRect(0, 0, state.width, state.height);
    blit(ctx, canvas, k, state.view.tx - view.tx * k, state.view.ty - view.ty * k);
    stale = true;
  } else {
    const target = canvas ?? document.createElement('canvas');
    if (target.width !== state.width || target.height !== state.height) {
      target.width = state.width;
      target.height = state.height;
    }
    const baseCtx = target.getContext('2d') ?? ctx;
    const started = performance.now();
    drawCadBase(baseCtx, scene, state);
    Object.assign(cache, {
      canvas: target,
      key,
      view: state.view,
      slow: performance.now() - started > SLOW_BASE_MS,
    });
    if (baseCtx !== ctx) blit(ctx, target, 1, 0, 0);
  }
  drawCadOverlays(ctx, scene, state);
  return { stale };
}
