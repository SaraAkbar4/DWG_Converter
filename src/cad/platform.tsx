/** Stand-ins for the kodifly-platform packages the copied CAD viewer imports. */
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

/** High-contrast menu: dark surface, deep blue selection, light text and icons. */
export function getToolbarSubmenuStyle(): CSSProperties {
  return {
    background: '#171717',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.38)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 6,
    width: 'max-content',
    minWidth: 156,
    color: '#F0F5FF',
    ['--viewer-chrome-bg' as string]: '#171717',
    ['--viewer-chrome-color' as string]: '#F0F5FF',
    ['--viewer-chrome-color-secondary' as string]: 'rgba(240, 245, 255, 0.72)',
    ['--viewer-chrome-hover-bg' as string]: 'rgba(240, 245, 255, 0.08)',
    ['--viewer-chrome-active-bg' as string]: '#0D4799',
    ['--viewer-chrome-active-color' as string]: '#F0F5FF',
  };
}

type PanelProps = {
  title: ReactNode;
  extra?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  theme: ViewerTheme;
};

/** Right-hand panel. On a phone it stays on the right and starts below the toolbar. */
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
