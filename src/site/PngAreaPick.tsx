import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PngRegion } from './exportDrawing';
import styles from './site.module.css';

const MIN_EDGE = 8;

type Props = {
  canvas: HTMLCanvasElement;
  /** The chosen rectangle, in CSS pixels on the canvas. */
  onPick: (region: PngRegion) => void;
  onCancel: () => void;
};

type Point = { x: number; y: number };

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

const regionFrom = (start: Point, end: Point, width: number, height: number): PngRegion => {
  const x1 = clamp(Math.min(start.x, end.x), width);
  const y1 = clamp(Math.min(start.y, end.y), height);
  const x2 = clamp(Math.max(start.x, end.x), width);
  const y2 = clamp(Math.max(start.y, end.y), height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/** Asks for a rectangle on the drawing, then hands that area back to the export dialog. */
export function PngAreaPick({ canvas, onPick, onCancel }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<Point | null>(null);
  const [box, setBox] = useState(() => canvas.getBoundingClientRect());
  const [region, setRegion] = useState<PngRegion | null>(null);
  const ready = !!region && region.width >= MIN_EDGE && region.height >= MIN_EDGE;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const update = () => setBox(canvas.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [canvas]);

  useEffect(() => {
    surfaceRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const point = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  return (
    <div
      ref={surfaceRef}
      className={styles.pngPick}
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose an area to export"
      tabIndex={-1}
      data-has-area={(region && region.width > 1 && region.height > 1) || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const origin = point(event);
        startRef.current = origin;
        setRegion({ x: origin.x, y: origin.y, width: 0, height: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = startRef.current;
        if (!start) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        setRegion(regionFrom(start, point(event), bounds.width, bounds.height));
      }}
      onPointerUp={() => {
        startRef.current = null;
      }}
    >
      {region && region.width > 1 && region.height > 1 && (
        <div className={styles.pngFrame} style={{ left: region.x, top: region.y, width: region.width, height: region.height }} />
      )}
      <div className={styles.pngBar} onPointerDown={(event) => event.stopPropagation()}>
        <p>{ready ? 'Use this area, or drag to change it.' : 'Drag to choose the area to export.'}</p>
        <button type="button" className={styles.pillSmall} disabled={!ready} onClick={() => region && onPick(region)}>
          Use this area
        </button>
        <button type="button" className={styles.pngCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
