import { CLIP_SAFE_BOTTOM, useViewerTranslate } from './platform';
import { Button, Tooltip } from 'antd';

type Props = { onFit: () => void; onZoom: (factor: number) => void };

const ZOOM_STEP = 1.5;
const iconStyle = { width: 16, height: 16 };

export function CadViewRail({ onFit, onZoom }: Props) {
  const t = useViewerTranslate();
  const controls = [
    {
      key: 'fit',
      label: t('viewer3d.toolbar.tool.centerView', 'Center View'),
      src: '/assets/icons/tools/CENTER OBJECT.svg',
      onClick: onFit,
    },
    {
      key: 'zoom-in',
      label: t('viewer3d.toolbar.tool.zoomIn', 'Zoom In'),
      src: '/assets/icons/tools/zoomIn.svg',
      onClick: () => onZoom(ZOOM_STEP),
    },
    {
      key: 'zoom-out',
      label: t('viewer3d.toolbar.tool.zoomOut', 'Zoom Out'),
      src: '/assets/icons/tools/zoomOut.svg',
      onClick: () => onZoom(1 / ZOOM_STEP),
    },
  ];

  return (
    <div
      className="potree-toolbar-right"
      style={{ position: 'absolute', bottom: CLIP_SAFE_BOTTOM, right: 12, zIndex: 1000 }}
    >
      <div className="potree-toolbar-right-stack">
        {controls.map((control) => (
          <Tooltip key={control.key} title={control.label} placement="left">
            <Button
              type="text"
              className="potree-toolbar-view-control"
              aria-label={control.label}
              icon={<img src={control.src} alt="" style={iconStyle} />}
              onClick={control.onClick}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
