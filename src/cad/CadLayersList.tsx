import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useViewerTranslate } from './platform';
import styles from './cadFloorPlan.module.css';
import type { CadLayer } from './types';

const XREF_SEPARATOR = /\$\d+\$/;

function splitLayerName(name: string): { label: string; group: string | null } {
  const parts = name.split(XREF_SEPARATOR).filter(Boolean);
  const label = parts[parts.length - 1] ?? name;
  return { label, group: parts.length > 1 ? (parts[0] ?? null) : null };
}

export function layerLabel(layer: CadLayer | undefined, english: boolean): string {
  return (english && layer?.en) || splitLayerName(layer?.name ?? '').label;
}

type Props = {
  layers: CadLayer[];
  hiddenLayers: ReadonlySet<number>;
  selectedLayer: number | null;
  onChange: (hidden: Set<number>) => void;
  onSelectLayer: (layer: number) => void;
  english: boolean;
};

export function CadLayersList({
  layers,
  hiddenLayers,
  selectedLayer,
  onChange,
  onSelectLayer,
  english,
}: Props) {
  const t = useViewerTranslate();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return layers
      .map((layer, index) => ({
        layer,
        index,
        group: splitLayerName(layer.name).group,
        label: layerLabel(layer, english),
      }))
      .filter(
        (row) =>
          row.layer.count > 0 &&
          (!needle || `${row.layer.name}\n${row.layer.en ?? ''}`.toLowerCase().includes(needle)),
      )
      .sort((a, b) => b.layer.count - a.layer.count);
  }, [layers, query, english]);

  const setVisible = (indices: number[], visible: boolean) => {
    const next = new Set(hiddenLayers);
    for (const index of indices) {
      if (visible) next.delete(index);
      else next.add(index);
    }
    onChange(next);
  };

  return (
    <div>
      <input
        className={styles.search}
        type="search"
        placeholder={t('viewer3d.cadFloorPlan.filterLayers', 'Filter layers')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.actionRow}>
        <button type="button" onClick={() => setVisible(rows.map((r) => r.index), true)}>
          {t('viewer3d.cadFloorPlan.showAll', 'Show all')}
        </button>
        <button type="button" onClick={() => setVisible(rows.map((r) => r.index), false)}>
          {t('viewer3d.cadFloorPlan.hideAll', 'Hide all')}
        </button>
      </div>
      <div className={styles.insetGroup} role="list">
        {rows.map(({ layer, index, label, group }) => {
          const visible = !hiddenLayers.has(index);
          const selected = selectedLayer === index;
          return (
            <div
              role="listitem"
              key={layer.name}
              className={styles.layerRow}
              title={layer.name}
              data-selected={selected}
              data-hidden={!visible}
            >
              <button
                type="button"
                className={styles.eye}
                aria-pressed={visible}
                aria-label={
                  visible
                    ? t('viewer3d.cadFloorPlan.hideLayer', 'Hide layer {name}', { name: label })
                    : t('viewer3d.cadFloorPlan.showLayer', 'Show layer {name}', { name: label })
                }
                onClick={() => setVisible([index], !visible)}
              >
                {visible ? <Eye size={15} strokeWidth={1.75} /> : <EyeOff size={15} strokeWidth={1.75} />}
              </button>
              <span className={styles.swatch} aria-hidden style={{ background: layer.color }} />
              <button type="button" className={styles.layerName} onClick={() => onSelectLayer(index)}>
                {label}
                {group ? <span className={styles.groupTag}>{group}</span> : null}
              </button>
              <span className={styles.count}>{layer.count.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
