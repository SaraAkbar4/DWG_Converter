'use client';

import { useEffect, useRef, useState } from 'react';
import { CAD_PAPER } from '../cad/cadPaper';
import { fitView } from '../cad/cadView';
import { drawCadBase } from '../cad/drawCadScene';
import { prepareCadScene } from '../cad/prepareCadScene';
import type { CadDrawing } from '../cad/types';
import type { FileInfo, WorkerMessage, WorkerRequest } from '../convert/protocol';
import styles from './site.module.css';
import { track } from './track';

/** Drawings shipped with the site: real files the viewer opens like any other. */
const SAMPLES = [
  { file: 'house-ground-floor.dxf', size: '116 KB', title: 'Ground floor plan', kind: 'Architectural · 1:50', wide: true },
  { file: 'steel-moment-connection.dxf', size: '99 KB', title: 'Moment connection MC-2', kind: 'Structural · 1:10' },
  { file: 'coupling-assembly.dxf', size: '104 KB', title: 'Flexible coupling FC-180', kind: 'Mechanical · 1:1' },
  { file: 'site-layout.dxf', size: '148 KB', title: 'Orchard Close site layout', kind: 'Civil · 1:500', wide: true },
] as const;

type Sample = (typeof SAMPLES)[number];
type Loaded = { drawing: CadDrawing; info: FileInfo; blob: Blob };

const cache = new Map<string, Promise<Loaded>>();
let queue: Promise<unknown> = Promise.resolve();

/** Parses in the viewer's worker, one file at a time so several cards never compete for memory. */
function load(file: string): Promise<Loaded> {
  let pending = cache.get(file);
  if (!pending) {
    pending = queue.then(async () => {
      const blob = await (await fetch(`/samples/${file}`)).blob();
      const worker = new Worker(new URL('../convert/worker.ts', import.meta.url), { type: 'module' });
      try {
        return await new Promise<Loaded>((resolve, reject) => {
          worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
            if (data.type === 'done') resolve({ blob, info: data.info, drawing: data.sheets[0]!.drawing });
            else if (data.type === 'error') reject(new Error(data.message));
          };
          worker.onerror = () => reject(new Error('crashed'));
          void blob.arrayBuffer().then((buffer) => worker.postMessage({ name: file, buffer } satisfies WorkerRequest, [buffer]));
        });
      } finally {
        worker.terminate();
      }
    });
    queue = pending.catch(() => undefined);
    cache.set(file, pending);
  }
  return pending;
}

const FILL = 1.18;
function fillView(bounds: CadDrawing['extents'], width: number, height: number) {
  const fit = fitView(bounds, width, height);
  const scale = fit.scale * FILL;
  const [cx, cy] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 + cy * scale };
}

function Card({ sample, onOpen }: { sample: Sample; onOpen: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  // Parsing starts only once the card comes near the screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let live = true;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      load(sample.file).then(
        (result) => live && setLoaded(result),
        () => live && setFailed(true),
      );
    }, { rootMargin: '300px' });
    seen.observe(canvas);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [sample.file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const scene = prepareCadScene(loaded.drawing);
    const draw = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawCadBase(ctx, scene, {
        // Fill the card like a photograph: slightly closer than a full fit, so edges run off.
        view: fillView(scene.bounds, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height,
        dpr,
        colorMode: 'layer',
        paper: { ...CAD_PAPER.dark, background: '#000000' },
        showGrid: false,
        lineWeight: { px: 1 },
        minTextPx: 3,
        english: true,
        image: null,
        accent: { selection: '#6b9aff', hover: '#6b9aff' },
        hiddenLayers: new Set(),
        hover: null,
        highlight: null,
        measures: [],
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [loaded]);

  const format = sample.file.replace(/.*\./, '').toUpperCase();
  const meta = loaded
    ? [`${loaded.drawing.entities.length.toLocaleString()} objects`, `${loaded.drawing.layers.length} layers`, loaded.info.version]
        .filter(Boolean)
        .join(' · ')
    : failed
      ? 'Could not open'
      : `Opening ${sample.size}…`;
  return (
    <button
      type="button"
      className={styles.showcaseCard}
      data-wide={'wide' in sample && sample.wide}
      data-ready={loaded !== null}
      disabled={!loaded}
      onClick={() => {
        if (!loaded) return;
        track('sample_opened', { file: sample.file });
        onOpen(new File([loaded.blob], sample.file));
      }}
      aria-label={`Open ${sample.title} in the viewer`}
    >
      <canvas ref={canvasRef} className={`${styles.scene} ph-no-capture`} aria-hidden />
      <span className={styles.badge}>{format}</span>
      <span className={styles.showcaseCaption}>
        <span>{sample.kind}</span>
        <strong>{sample.title}</strong>
        <small>{meta}</small>
      </span>
      <span className={styles.showcaseOpen} aria-hidden>
        →
      </span>
    </button>
  );
}

export function Showcase({ onOpen }: { onOpen: (file: File) => void }) {
  return (
    <div className={styles.showcase}>
      {SAMPLES.map((sample) => (
        <Card key={sample.file} sample={sample} onOpen={onOpen} />
      ))}
    </div>
  );
}
