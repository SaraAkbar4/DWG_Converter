import { CLIP_SAFE_BOTTOM, useViewerTranslate } from './platform';
import { Button, Tooltip, theme } from 'antd';
import { Eye, EyeOff, Focus, Info, ScanEye, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

const LABEL_MAX_WIDTH = 260;
const OBSTACLE_GAP = 8;
const icon = { size: 16, strokeWidth: 1.75 } as const;

export type CadPillAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
};

type Props = {
  title: string;
  detail: string;
  actions: CadPillAction[];
  onClose: () => void;
  avoidRef?: RefObject<HTMLElement | null>;
};

function useBottomAvoiding(
  pillRef: RefObject<HTMLElement | null>,
  avoidRef: RefObject<HTMLElement | null> | undefined,
  baseBottom: number,
): number {
  const [raised, setRaised] = useState<number | null>(null);
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const avoid = avoidRef?.current;
    const host = pill?.offsetParent as HTMLElement | null;
    if (!pill || !avoid || !host) return undefined;
    const update = () => {
      const hostRect = host.getBoundingClientRect();
      const avoidRect = avoid.getBoundingClientRect();
      const pillLeft = hostRect.left + (hostRect.width - pill.offsetWidth) / 2;
      const overlaps = avoidRect.width > 0 && avoidRect.right + OBSTACLE_GAP > pillLeft;
      setRaised(overlaps ? hostRect.bottom - avoidRect.top + OBSTACLE_GAP : null);
    };
    update();
    const observer = new ResizeObserver(update);
    [pill, avoid, host].forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pillRef, avoidRef]);
  return raised != null ? Math.max(baseBottom, raised) : baseBottom;
}

export const cadPillIcons = {
  properties: <Info {...icon} />,
  zoomTo: <Focus {...icon} />,
  isolate: <ScanEye {...icon} />,
  hide: <EyeOff {...icon} />,
  show: <Eye {...icon} />,
};

export function CadSelectionPill({ title, detail, actions, onClose, avoidRef }: Props) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const ref = useRef<HTMLDivElement>(null);
  const bottom = useBottomAvoiding(ref, avoidRef, CLIP_SAFE_BOTTOM);
  const button = (action: CadPillAction) => (
    <Tooltip key={action.key} title={action.label}>
      <Button
        type={action.active ? 'primary' : 'text'}
        shape="circle"
        icon={action.icon}
        aria-label={action.label}
        aria-pressed={action.active}
        onClick={action.onClick}
      />
    </Tooltip>
  );

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('viewer3d.cadFloorPlan.details', 'Details')}
      data-chrome-obstacle
      style={{
        position: 'absolute',
        left: '50%',
        bottom,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: token.marginXXS,
        maxWidth: `calc(100% - ${token.marginLG * 2}px)`,
        padding: `${token.paddingXS}px ${token.paddingXS}px ${token.paddingXS}px ${token.paddingLG}px`,
        borderRadius: token.controlHeightLG,
        background: token.colorBgElevated,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      <Tooltip title={`${title} · ${detail}`}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            maxWidth: LABEL_MAX_WIDTH,
            marginRight: token.marginSM,
            lineHeight: 1.3,
          }}
        >
          <span
            style={{
              fontSize: token.fontSizeSM,
              fontWeight: 600,
              color: token.colorText,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: token.fontSizeSM,
              color: token.colorTextSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {detail}
          </span>
        </div>
      </Tooltip>
      {actions.map(button)}
      {button({
        key: 'close',
        label: t('viewer3d.cadFloorPlan.clearSelection', 'Clear selection'),
        icon: <X {...icon} />,
        onClick: onClose,
      })}
    </div>
  );
}
