import { ArrowLeft, ArrowRight, Check, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CadExporter } from '../cad/CadDrawingViewer';
import type { Bounds } from '../cad/cadGeometry';
import { layerLabel } from '../cad/CadLayersList';
import styles from './site.module.css';

const PREVIEW_PAD = 32;
const PREVIEW_DELAY_MS = 90;

type Props = {
  exporter: CadExporter;
  /** The chosen area, in drawing units. */
  area: Bounds;
  /** Layers left out of the export. */
  hidden: ReadonlySet<number>;
  onHidden: (hidden: Set<number>) => void;
  /** Back to the export dialog. */
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => void;
};

/** The layers that have something in the chosen area, to tick the ones that go into the image. */
export function LayerPickScreen({ exporter, area, hidden, onHidden, onBack, onCancel, onContinue }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  const [query, setQuery] = useState('');

  const counts = useMemo(() => exporter.layersIn(area), [exporter, area]);
  const rows = useMemo(
    () =>
      [...counts]
        .map(([index, count]) => ({ index, count, layer: exporter.layers[index], label: layerLabel(exporter.layers[index], false) }))
        .sort((a, b) => b.count - a.count),
    [counts, exporter.layers],
  );
  const needle = query.trim().toLowerCase();
  const shownRows = needle ? rows.filter((row) => `${row.label}\n${row.layer?.name ?? ''}`.toLowerCase().includes(needle)) : rows;
  const chosen = rows.filter((row) => !hidden.has(row.index)).length;

  const setIncluded = (indices: number[], included: boolean) => {
    const next = new Set(hidden);
    for (const index of indices) {
      if (included) next.delete(index);
      else next.add(index);
    }
    onHidden(next);
  };
  /** Only `layer` from this area goes in. */
  const only = (layer: number) => {
    const next = new Set(hidden);
    for (const row of rows) {
      if (row.index === layer) next.delete(row.index);
      else next.add(row.index);
    }
    onHidden(next);
  };

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const update = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [minX, minY, maxX, maxY] = area;
  const fit = stage ? Math.min((stage.width - PREVIEW_PAD * 2) / (maxX - minX), (stage.height - PREVIEW_PAD * 2) / (maxY - minY)) : 0;
  const sheet = fit > 0 ? { width: Math.round((maxX - minX) * fit), height: Math.round((maxY - minY) * fit) } : null;

  // The preview follows the ticks, redrawn a moment after the last change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sheet) return undefined;
    const timer = window.setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(sheet.width * dpr);
      canvas.height = Math.round(sheet.height * dpr);
      const image = exporter.render({ scale: fit * dpr, tx: -minX * fit * dpr, ty: maxY * fit * dpr }, canvas.width, canvas.height, dpr, hidden);
      const context = canvas.getContext('2d');
      if (context && image) context.drawImage(image, 0, 0);
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [exporter, hidden, fit, minX, maxY, sheet?.width, sheet?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef(onCancel);
  latest.current = onCancel;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onScreen = (index: number) => !exporter.hiddenLayers.has(index);

  return (
    <div className={styles.layerPick} role="dialog" aria-modal="true" aria-labelledby="layer-pick-title">
      <div className={styles.layerPanel}>
        <div ref={stageRef} className={styles.layerStage}>
          {sheet && (
            <div className={styles.layerSheet} style={{ width: sheet.width, height: sheet.height }}>
              <canvas ref={canvasRef} style={{ width: sheet.width, height: sheet.height }} />
            </div>
          )}
          <span className={styles.layerLive}>
            <i aria-hidden /> Live preview
          </span>
          {chosen === 0 && <p className={styles.layerEmpty}>Tick at least one layer to see it here.</p>}
        </div>

        <aside className={styles.layerSide}>
          <header className={styles.layerHead}>
            <div>
              <h2 id="layer-pick-title">Choose layers</h2>
              <p>
                {rows.length} {rows.length === 1 ? 'layer has' : 'layers have'} something in your current view. Ticked layers go into the image.
              </p>
            </div>
            <button type="button" className={styles.layerClose} aria-label="Close" onClick={onCancel}>
              <X size={18} strokeWidth={1.75} />
            </button>
          </header>

          <label className={styles.layerSearch}>
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <input type="search" placeholder="Filter layers" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>

          <div className={styles.layerQuick}>
            <button type="button" onClick={() => setIncluded(shownRows.map((row) => row.index), true)}>
              {needle ? 'Tick shown' : 'All'}
            </button>
            <button type="button" onClick={() => setIncluded(shownRows.map((row) => row.index), false)}>
              {needle ? 'Untick shown' : 'None'}
            </button>
            <button
              type="button"
              title="The layers turned on in the viewer"
              onClick={() => {
                const next = new Set(hidden);
                for (const row of rows) {
                  if (onScreen(row.index)) next.delete(row.index);
                  else next.add(row.index);
                }
                onHidden(next);
              }}
            >
              As on screen
            </button>
          </div>

          <ul className={styles.layerList} role="listbox" aria-multiselectable="true" aria-label="Layers">
            {shownRows.map(({ index, count, layer, label }) => {
              const included = !hidden.has(index);
              return (
                <li key={index} role="option" aria-selected={included} className={styles.layerRow} data-included={included || undefined}>
                  <button type="button" className={styles.layerToggle} onClick={() => setIncluded([index], !included)}>
                    <span className={styles.layerCheck} aria-hidden>
                      {included && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className={styles.layerChip} style={{ background: layer?.color ?? '#888' }} aria-hidden />
                    <span className={styles.layerName} title={layer?.name}>
                      {label}
                      {!onScreen(index) && <em>off on screen</em>}
                    </span>
                    <span className={styles.layerCount}>{count.toLocaleString('en-US')}</span>
                  </button>
                  <button type="button" className={styles.layerOnly} onClick={() => only(index)} aria-label={`Only ${label}`}>
                    Only
                  </button>
                </li>
              );
            })}
            {!shownRows.length && <li className={styles.layerNone}>{rows.length ? 'No layer matches that filter.' : 'Nothing is drawn in this area.'}</li>}
          </ul>

          <footer className={styles.layerFoot}>
            <button type="button" className={styles.layerBack} onClick={onBack}>
              <ArrowLeft size={15} strokeWidth={1.75} /> Back
            </button>
            <span className={styles.layerTally}>
              {chosen} of {rows.length}
            </span>
            <button type="button" className={styles.layerNext} disabled={chosen === 0} onClick={onContinue}>
              Continue <ArrowRight size={15} strokeWidth={2} />
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
