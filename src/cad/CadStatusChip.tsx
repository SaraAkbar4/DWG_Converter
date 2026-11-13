import { useViewerTranslate } from './platform';
import { Button, Tooltip, theme } from 'antd';
import { forwardRef, type CSSProperties } from 'react';
import styles from './cadFloorPlan.module.css';
import { layerLabel } from './CadLayersList';
import type { CadDrawing } from './types';

type Props = {
  drawing: CadDrawing;
  english: boolean;
  isolatedLayer: number | null;
  extraHidden: number[];
  onExitIsolate: () => void;
  onShowLayer: (layer: number) => void;
  onResetLayers: () => void;
};

export const CadStatusChip = forwardRef<HTMLDivElement, Props>(function CadStatusChip(props, ref) {
  const { drawing } = props;
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const chip: CSSProperties = {
    padding: `${token.paddingXXS}px ${token.paddingSM}px`,
    borderRadius: token.borderRadiusLG,
    background: token.colorBgElevated,
    boxShadow: token.boxShadowSecondary,
    color: token.colorTextSecondary,
    fontSize: token.fontSizeSM,
  };
  const isolatedName =
    props.isolatedLayer != null
      ? layerLabel(drawing.layers[props.isolatedLayer], props.english)
      : null;
  const hidden = props.extraHidden.map((layer) => ({
    layer,
    name: layerLabel(drawing.layers[layer], props.english),
  }));
  const [firstHidden] = hidden;
  const unsupported = Object.entries(drawing.unsupported ?? {});
  const unsupportedCount = unsupported.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div
      ref={ref}
      className={styles.statusStack}
      data-status-stack
    >
      {isolatedName || firstHidden ? (
        <div className={styles.statusChip} role="status" data-many={hidden.length > 1 && !isolatedName} style={chip}>
          {isolatedName || hidden.length === 1 ? (
            <>
              <span className={styles.hiddenName} style={{ color: token.colorText }}>
                {isolatedName
                  ? t('viewer3d.cadFloorPlan.isolatedNotice', 'Isolated: {name}', { name: isolatedName })
                  : t('viewer3d.cadFloorPlan.hiddenNotice', 'Hidden: {name}', { name: firstHidden!.name })}
              </span>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 0 }}
                onClick={isolatedName ? props.onExitIsolate : () => props.onShowLayer(firstHidden!.layer)}
              >
                {isolatedName
                  ? t('viewer3d.cadFloorPlan.exitIsolate', 'Exit isolate')
                  : t('viewer3d.cadFloorPlan.showHiddenLayer', 'Show it')}
              </Button>
            </>
          ) : (
            <>
              <ul className={styles.hiddenList}>
                {hidden.map((item) => (
                  <li key={item.layer} className={styles.hiddenRow}>
                    <span className={styles.hiddenName} style={{ color: token.colorText }}>
                      {t('viewer3d.cadFloorPlan.hiddenNotice', 'Hidden: {name}', { name: item.name })}
                    </span>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      aria-label={t('viewer3d.cadFloorPlan.showNamedLayer', 'Show {name}', { name: item.name })}
                      onClick={() => props.onShowLayer(item.layer)}
                    >
                      {t('viewer3d.cadFloorPlan.showOneHidden', 'Show')}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button type="link" size="small" style={{ alignSelf: 'flex-end', paddingInline: 0 }} onClick={props.onResetLayers}>
                {t('viewer3d.cadFloorPlan.showAllHidden', 'Show all')}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {unsupportedCount > 0 ? (
        <Tooltip title={unsupported.map(([kind, count]) => `${kind} × ${count}`).join(', ')}>
          <div className={styles.statusChip} role="status" style={chip}>
            {t(
              'viewer3d.cadFloorPlan.unsupportedNotice',
              '{count} 3D or unsupported objects are not shown',
              { count: unsupportedCount },
            )}
          </div>
        </Tooltip>
      ) : null}
    </div>
  );
});
