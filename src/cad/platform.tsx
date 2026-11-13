/** Stand-ins for the kodifly-platform packages the copied CAD viewer imports. */
import type { GlobalToken } from 'antd';
import { X } from 'lucide-react';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import styles from './cadFloorPlan.module.css';

export type ViewerTheme = 'light' | 'dark';
export const ViewerThemeContext = createContext<ViewerTheme>('dark');
export const useViewerTheme = () => useContext(ViewerThemeContext);

type Translate = (id: string, fallback: string, values?: Record<string, string | number | null>) => string;
const translate: Translate = (_id, fallback, values) =>
  fallback.replace(/\{(\w+)\}/g, (match, key: string) => String(values?.[key] ?? match));
export const useViewerTranslate = () => translate;

export const CLIP_SAFE_BOTTOM = 16;

export function getToolbarSubmenuStyle(token: GlobalToken): CSSProperties {
  return {
    background: token.colorBgElevated,
    borderRadius: 12,
    boxShadow: token.boxShadowSecondary,
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 0',
    width: 'max-content',
    color: token.colorText,
    ['--viewer-chrome-bg' as string]: token.colorBgElevated,
    ['--viewer-chrome-color' as string]: token.colorText,
    ['--viewer-chrome-color-secondary' as string]: token.colorTextSecondary,
    ['--viewer-chrome-hover-bg' as string]: token.colorFillSecondary,
    ['--viewer-chrome-active-bg' as string]: token.colorPrimaryBg,
    ['--viewer-chrome-active-color' as string]: token.colorPrimary,
  };
}

type PanelProps = {
  title: ReactNode;
  extra?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  theme: ViewerTheme;
};

/** Right-hand panel on desktop, bottom sheet on phones (see `.sidePanel`). */
export function FloatingSidePanel({ title, extra, onClose, children, theme: mode }: PanelProps) {
  return (
    <div className={styles.sidePanel} data-tone={mode}>
      <div className={styles.sidePanelHeader}>
        <span className={styles.sidePanelTitle}>{title}</span>
        <span className={styles.headerActions}>
          {extra}
          <button type="button" className={styles.headerIcon} onClick={onClose} aria-label="Close panel">
            <X size={16} strokeWidth={1.75} />
          </button>
        </span>
      </div>
      <div className={styles.sidePanelBody}>{children}</div>
    </div>
  );
}
