import { Button, Tooltip, theme } from 'antd';
import { DraftingCompass, Ruler, Square, X } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';
import type { CadMeasureMode } from './cadMeasure';
import { useBottomAvoiding } from './CadSelectionPill';
import { CLIP_SAFE_BOTTOM, useViewerTranslate } from './platform';

const MODE_ICONS: Record<CadMeasureMode, ReactNode> = {
  distance: <Ruler size={16} strokeWidth={1.75} />,
  area: <Square size={16} strokeWidth={1.75} />,
  angle: <DraftingCompass size={16} strokeWidth={1.75} />,
};

const TITLES: Record<CadMeasureMode, string> = {
  distance: 'Measure distance',
  area: 'Measure area',
  angle: 'Measure angle',
};

const HINTS: Record<CadMeasureMode, string> = {
  distance: 'Click two points.',
  area: 'Click each corner, then the first point to close.',
  angle: 'Click three points. The middle one is the corner.',
};

type Props = {
  mode: CadMeasureMode;
  /** The measured value, once there is one. */
  result: string | null;
  onClose: () => void;
  avoidRef?: RefObject<HTMLElement | null>;
  /** Snap and angle-lock controls. */
  controls: ReactNode;
  /** Shown under the controls, for example the field that sets the drawing's scale. */
  footer?: ReactNode;
};

function Kbd({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <kbd
      style={{
        padding: '0 5px',
        borderRadius: 4,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillTertiary,
        fontFamily: 'inherit',
        fontSize: 11,
        lineHeight: '16px',
        color: token.colorTextSecondary,
      }}
    >
      {children}
    </kbd>
  );
}

/** The bar at the bottom of the drawing while measuring: what to do, the result, and snap settings. */
export function CadMeasureBar({ mode, result, onClose, avoidRef, controls, footer }: Props) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const ref = useRef<HTMLDivElement>(null);
  const bottom = useBottomAvoiding(ref, avoidRef, CLIP_SAFE_BOTTOM);
  const divider = `1px solid ${token.colorBorderSecondary}`;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t(`viewer3d.cadFloorPlan.measure.${mode}`, TITLES[mode])}
      data-chrome-obstacle
      style={{
        position: 'absolute',
        left: '50%',
        bottom,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: 'max-content',
        maxWidth: `calc(100% - ${token.marginLG * 2}px)`,
        borderRadius: 16,
        background: token.colorBgElevated,
        boxShadow: token.boxShadowSecondary,
        border: divider,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: token.marginSM, padding: '10px 8px 10px 12px' }}>
        <span
          aria-hidden
          style={{
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            width: 32,
            height: 32,
            borderRadius: 10,
            background: token.colorPrimaryBg,
            color: token.colorPrimary,
          }}
        >
          {MODE_ICONS[mode]}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.35 }}>
          <span style={{ fontSize: token.fontSizeSM, fontWeight: 600, color: token.colorText }}>
            {t(`viewer3d.cadFloorPlan.measure.${mode}`, TITLES[mode])}
          </span>
          {result ? (
            <span
              aria-live="polite"
              style={{ fontSize: token.fontSize, fontWeight: 600, color: token.colorPrimary, fontVariantNumeric: 'tabular-nums' }}
            >
              {result}
            </span>
          ) : (
            <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
              {t(`viewer3d.cadFloorPlan.measureHint.${mode}`, HINTS[mode])}
            </span>
          )}
        </div>
        <Tooltip title={t('viewer3d.cadFloorPlan.stopMeasuring', 'Stop measuring')}>
          <Button
            type="text"
            shape="circle"
            size="small"
            icon={<X size={16} strokeWidth={1.75} />}
            aria-label={t('viewer3d.cadFloorPlan.stopMeasuring', 'Stop measuring')}
            onClick={onClose}
            style={{ alignSelf: 'flex-start' }}
          />
        </Tooltip>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: token.marginXS,
          padding: '8px 12px',
          borderTop: divider,
          background: token.colorFillQuaternary,
        }}
      >
        {controls}
      </div>
      {footer ? <div style={{ padding: '8px 12px', borderTop: divider }}>{footer}</div> : null}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `2px ${token.marginSM}px`,
          padding: '6px 12px 8px',
          borderTop: divider,
          fontSize: 11,
          color: token.colorTextTertiary,
        }}
      >
        <span>
          <Kbd>Shift</Kbd> {t('viewer3d.cadFloorPlan.measureKey.shift', 'straight line')}
        </span>
        <span>
          <Kbd>F3</Kbd> {t('viewer3d.cadFloorPlan.measureKey.snaps', 'snaps on/off')}
        </span>
        <span>
          <Kbd>Right-click</Kbd> {t('viewer3d.cadFloorPlan.measureKey.stop', 'finish')}
        </span>
      </div>
    </div>
  );
}
