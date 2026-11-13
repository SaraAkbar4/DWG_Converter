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
  const [firstHidden] = props.extraHidden;
  const hiddenName =
    firstHidden != null ? layerLabel(drawing.layers[firstHidden], props.english) : null;
  const moreHidden = props.extraHidden.length - 1;
  const unsupported = Object.entries(drawing.unsupported ?? {});
  const unsupportedCount = unsupported.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div
      ref={ref}
      className={styles.statusStack}
      data-status-stack
    >
      {isolatedName || hiddenName ? (
        <div className={styles.statusChip} role="status" style={chip}>
          <span style={{ color: token.colorText }}>
            {isolatedName
              ? t('viewer3d.cadFloorPlan.isolatedNotice', 'Isolated: {name}', {
                  name: isolatedName,
                })
              : moreHidden > 0
                ? t('viewer3d.cadFloorPlan.hiddenNoticeMany', 'Hidden: {name} and {count} more', {
                    name: hiddenName,
                    count: moreHidden,
                  })
                : t('viewer3d.cadFloorPlan.hiddenNotice', 'Hidden: {name}', { name: hiddenName })}
          </span>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0 }}
            onClick={isolatedName ? props.onExitIsolate : props.onResetLayers}
          >
            {isolatedName
              ? t('viewer3d.cadFloorPlan.exitIsolate', 'Exit isolate')
              : moreHidden > 0
                ? t('viewer3d.cadFloorPlan.showAllHidden', 'Show all')
                : t('viewer3d.cadFloorPlan.showHiddenLayer', 'Show it')}
          </Button>
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
