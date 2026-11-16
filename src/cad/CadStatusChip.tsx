import { Tooltip } from 'antd';
import { EyeOff, X } from 'lucide-react';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import styles from './cadFloorPlan.module.css';
import { layerLabel } from './CadLayersList';
import { useViewerTranslate } from './platform';
import type { CadDrawing } from './types';

type Props = {
  drawing: CadDrawing;
  english: boolean;
  isolatedLayer: number | null;
  extraHidden: number[];
  onExitIsolate: () => void;
  onShowLayer: (layer: number) => void;
  onResetLayers: () => void;
  /** Shown under the notices, for example the cursor's coordinates. */
  children?: ReactNode;
};

function RevealButton({ label, ariaLabel, onClick }: { label: string; ariaLabel?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.hiddenShow} aria-label={ariaLabel ?? label} onClick={onClick}>
      {label}
    </button>
  );
}

export const CadStatusChip = forwardRef<HTMLDivElement, Props>(function CadStatusChip(props, ref) {
  const { drawing } = props;
  const t = useViewerTranslate();
  const isolatedName =
    props.isolatedLayer != null
      ? layerLabel(drawing.layers[props.isolatedLayer], props.english)
      : null;
  const hidden = props.extraHidden.map((layer) => ({
    layer,
    name: layerLabel(drawing.layers[layer], props.english),
    color: drawing.layers[layer]?.color ?? 'transparent',
  }));
  const [firstHidden] = hidden;
  const many = !isolatedName && hidden.length > 1;
  const signature = hidden.map((item) => item.layer).join(',');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
  }, [signature]);
  const unsupported = Object.entries(drawing.unsupported ?? {});
  const unsupportedCount = unsupported.reduce((sum, [, count]) => sum + count, 0);
  const showLabel = t('viewer3d.cadFloorPlan.showOneHidden', 'Show');
  const closeLabel = t('viewer3d.cadFloorPlan.closeHidden', 'Close');
  const openLabel = t('viewer3d.cadFloorPlan.openHidden', 'Open hidden layers');

  return (
    <div ref={ref} className={styles.statusStack} data-status-stack>
      {collapsed && (isolatedName || firstHidden) ? (
        <button type="button" className={styles.hiddenCollapsed} onClick={() => setCollapsed(false)} aria-label={openLabel}>
          <EyeOff size={14} strokeWidth={1.75} aria-hidden />
          <span>{t('viewer3d.cadFloorPlan.hiddenHeading', 'Hidden')}</span>
          <span className={styles.hiddenCount}>{isolatedName ? 1 : hidden.length}</span>
        </button>
      ) : null}
      {!collapsed && (isolatedName || firstHidden) ? (
        <div className={styles.statusChip} role="status" data-many={many}>
          {many ? (
            <>
              <div className={styles.hiddenCaption}>
                <EyeOff size={13} strokeWidth={1.75} aria-hidden />
                <span>{t('viewer3d.cadFloorPlan.hiddenHeading', 'Hidden')}</span>
                <span className={styles.hiddenCount}>{hidden.length}</span>
                <button type="button" className={styles.hiddenClose} aria-label={closeLabel} onClick={() => setCollapsed(true)}>
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
              <ul className={styles.hiddenList}>
                {hidden.map((item) => (
                  <li key={item.layer} className={styles.hiddenRow}>
                    <span className={styles.swatch} style={{ background: item.color }} aria-hidden />
                    <span className={styles.hiddenName}>{item.name}</span>
                    <RevealButton
                      label={showLabel}
                      ariaLabel={t('viewer3d.cadFloorPlan.showNamedLayer', 'Show {name}', { name: item.name })}
                      onClick={() => props.onShowLayer(item.layer)}
                    />
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.hiddenShowAll} onClick={props.onResetLayers}>
                {t('viewer3d.cadFloorPlan.showAllHidden', 'Show all')}
              </button>
            </>
          ) : (
            <div className={styles.hiddenRow}>
              <EyeOff size={14} strokeWidth={1.75} aria-hidden />
              <span className={styles.hiddenName}>
                {isolatedName
                  ? t('viewer3d.cadFloorPlan.isolatedNotice', 'Isolated: {name}', { name: isolatedName })
                  : t('viewer3d.cadFloorPlan.hiddenNotice', 'Hidden: {name}', { name: firstHidden!.name })}
              </span>
              <RevealButton
                label={
                  isolatedName
                    ? t('viewer3d.cadFloorPlan.exitIsolate', 'Exit isolate')
                    : t('viewer3d.cadFloorPlan.showHiddenLayer', 'Show it')
                }
                onClick={isolatedName ? props.onExitIsolate : () => props.onShowLayer(firstHidden!.layer)}
              />
              <button type="button" className={styles.hiddenClose} aria-label={closeLabel} onClick={() => setCollapsed(true)}>
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      ) : null}
      {unsupportedCount > 0 ? (
        <Tooltip title={unsupported.map(([kind, count]) => `${kind} × ${count}`).join(', ')}>
          <div className={styles.statusChip} role="status">
            {t(
              'viewer3d.cadFloorPlan.unsupportedNotice',
              '{count} 3D or unsupported objects are not shown',
              { count: unsupportedCount },
            )}
          </div>
        </Tooltip>
      ) : null}
      {props.children}
    </div>
  );
});
