import { Button, Checkbox, Popover, Segmented, Switch, theme } from 'antd';
import { ChevronDown, Magnet } from 'lucide-react';
import { useViewerTranslate } from './platform';
import {
  CAD_ANGLE_LOCKS,
  CAD_SNAP_KINDS,
  CAD_SNAP_LABELS,
  type CadAngleLock,
  type CadSnapSettings,
} from './cadSnap';

type Props = {
  settings: CadSnapSettings;
  onSettings: (settings: CadSnapSettings) => void;
  angleLock: CadAngleLock;
  onAngleLock: (lock: CadAngleLock) => void;
  gridShown: boolean;
};

const LOCK_TITLES: Record<CadAngleLock, string> = {
  0: 'Any angle. Hold Shift for horizontal or vertical.',
  90: 'Horizontal or vertical (F8). Hold Shift for any angle.',
  45: 'Multiples of 45°. Hold Shift for any angle.',
  15: 'Multiples of 15°. Hold Shift for any angle.',
};

/** Which points a measurement snaps to, and the angle its lines are held to. Shown while measuring. */
export function CadSnapControls({ settings, onSettings, angleLock, onAngleLock, gridShown }: Props) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const active = CAD_SNAP_KINDS.filter((kind) => settings.kinds[kind]).length;
  const on = settings.enabled && active > 0;

  const menu = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.marginXS, minWidth: 220 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: token.marginSM }}>
        <span style={{ fontWeight: 600 }}>{t('viewer3d.cadFloorPlan.snap.enabled', 'Snapping')}</span>
        <Switch
          size="small"
          checked={settings.enabled}
          onChange={(enabled) => onSettings({ ...settings, enabled })}
          aria-label={t('viewer3d.cadFloorPlan.snap.enabled', 'Snapping')}
        />
      </label>
      <div style={{ height: 1, background: token.colorBorderSecondary }} />
      {CAD_SNAP_KINDS.map((kind) => (
        <Checkbox
          key={kind}
          disabled={!settings.enabled}
          checked={settings.kinds[kind]}
          onChange={(event) => onSettings({ ...settings, kinds: { ...settings.kinds, [kind]: event.target.checked } })}
        >
          {CAD_SNAP_LABELS[kind]}
          {kind === 'grid' && !gridShown ? (
            <span style={{ color: token.colorTextTertiary }}>
              {' '}
              {t('viewer3d.cadFloorPlan.snap.gridOff', '(turn on the grid in Appearance)')}
            </span>
          ) : null}
        </Checkbox>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${token.marginXS}px ${token.marginSM}px` }}>
      <Popover content={menu} trigger="click" placement="top">
        <Button
          size="small"
          type="text"
          aria-label={t('viewer3d.cadFloorPlan.snap.settings', 'Snap settings')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            paddingInline: 8,
            borderRadius: 8,
            border: `1px solid ${on ? token.colorPrimaryBorder : token.colorBorder}`,
            background: on ? token.colorPrimaryBg : 'transparent',
            color: on ? token.colorPrimary : token.colorTextSecondary,
          }}
        >
          <Magnet size={14} strokeWidth={1.75} />
          <span style={{ fontWeight: 600 }}>
            {settings.enabled ? t('viewer3d.cadFloorPlan.snap.label', 'Snaps') : t('viewer3d.cadFloorPlan.snap.off', 'Snaps off')}
          </span>
          {settings.enabled ? (
            <span
              style={{
                minWidth: 18,
                padding: '0 5px',
                borderRadius: 9,
                background: on ? token.colorPrimary : token.colorFill,
                color: on ? token.colorTextLightSolid : token.colorTextSecondary,
                fontSize: 11,
                lineHeight: '18px',
                textAlign: 'center',
              }}
            >
              {active}
            </span>
          ) : null}
          <ChevronDown size={14} strokeWidth={1.75} style={{ opacity: 0.7 }} />
        </Button>
      </Popover>
      <span aria-hidden style={{ width: 1, height: 18, background: token.colorBorderSecondary }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: token.marginXS }}>
        <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
          {t('viewer3d.cadFloorPlan.snap.lock', 'Angle')}
        </span>
        <Segmented<CadAngleLock>
          size="small"
          value={angleLock}
          onChange={onAngleLock}
          aria-label={t('viewer3d.cadFloorPlan.snap.lockLabel', 'Lock angle')}
          options={CAD_ANGLE_LOCKS.map((lock) => ({
            value: lock,
            label: lock === 0 ? t('viewer3d.cadFloorPlan.snap.free', 'Free') : lock === 90 ? t('viewer3d.cadFloorPlan.snap.ortho', 'Ortho') : `${lock}°`,
            title: LOCK_TITLES[lock],
          }))}
        />
      </span>
    </div>
  );
}
