import { Alert, Button, Dropdown, Tooltip } from 'antd';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Maximize, MessageCircle, Moon, Plus, Sun, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { CadCommand } from '../cad/CadCommandPalette';
import { CadDrawingViewer } from '../cad/CadDrawingViewer';
import type { CadMeasure, CadPoint } from '../cad/cadMeasure';
import type { CadMeasureMode, CadTool } from '../cad/useCadCanvas';
import type { ViewerTheme } from '../cad/platform';
import type { DrawingDoc, DrawingFailure, DrawingLoading } from '../convert/useDrawingFile';
import { TRIAL_URL, WORKSPACE_LOGIN_URL } from './content';
import { exportPng, type PngRegion } from './exportDrawing';
import { PngAreaPick } from './PngAreaPick';
import styles from './site.module.css';
import { openDrawingPicker } from './pickDrawing';
import { track } from './track';

type Props = {
  docs: DrawingDoc[];
  loading: DrawingLoading | null;
  error: DrawingFailure | null;
  onDismissError: () => void;
  onFiles: (files: File[]) => void;
  theme: ViewerTheme;
  onToggleTheme: () => void;
  onClose: () => void;
  onScale: (docIndex: number, sheetIndex: number, metersPerUnit: number) => void;
};

type ExportKind = 'png' | 'pdf';
const EXPORTS: Array<{ key: ExportKind; label: string }> = [
  { key: 'png', label: 'PNG image (choose an area)' },
  { key: 'pdf', label: 'PDF (whole sheet, A3)' },
];
const icon = { size: 16, strokeWidth: 1.75 } as const;
const EMPTY_MARKS = { saved: [] as CadMeasure[], draft: [] as CadPoint[] };
type SheetMarks = { saved: CadMeasure[]; draft: CadPoint[] };
const formatSize = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
/** Five toolbar uses are free. The next one is refused and the signup box stays in the way. */
const TOOL_GATE = 5;
const FREE_PNG_EXPORTS = 3;
const PNG_EXPORT_KEY = 'kodifly-png-exports';
const pngExportsUsed = () => {
  if (typeof window === 'undefined') return 0;
  const value = Number(sessionStorage.getItem(PNG_EXPORT_KEY));
  return Number.isFinite(value) ? value : 0;
};
type SignupReason = 'tools' | 'export';

export function ViewerScreen(props: Props) {
  const { docs, loading, error, theme, onFiles } = props;
  const [docIndex, setDocIndex] = useState(docs.length - 1);
  const [sheetIndex, setSheetIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = docs[Math.min(docIndex, docs.length - 1)]!;
  const sheet = doc.sheets[Math.min(sheetIndex, doc.sheets.length - 1)]!;
  const stem = doc.info.name.replace(/\.[^.]+$/, '');

  // A newly opened drawing comes to the front.
  useEffect(() => {
    setDocIndex(docs.length - 1);
    setSheetIndex(0);
  }, [docs.length]);
  useEffect(() => {
    const onOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onFiles]);

  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  const closeDoc = () => props.onClose();
  const pickFiles = () => openDrawingPicker(inputRef.current);
  const [glimpse, setGlimpse] = useState(true);
  // Phones start with the drawings sheet closed so the drawing and toolbar are visible first.
  const [leftOpen, setLeftOpen] = useState(() => !window.matchMedia('(max-width: 768px)').matches);
  const leftClosedByUser = useRef(false);
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      if (query.matches) setLeftOpen(false);
      else if (!leftClosedByUser.current) setLeftOpen(true);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    if (railRef.current) railRef.current.inert = !leftOpen;
  }, [leftOpen]);
  const toggleLeftRail = () =>
    setLeftOpen((open) => {
      const next = !open;
      leftClosedByUser.current = !next;
      return next;
    });
  const [signup, setSignup] = useState<SignupReason | null>(null);
  const [pngCanvas, setPngCanvas] = useState<HTMLCanvasElement | null>(null);
  const toolUses = useRef(0);
  const toolsLocked = useRef(false);
  const noteToolUse = () => {
    if (toolsLocked.current) {
      setSignup('tools');
      return false;
    }
    toolUses.current += 1;
    if (toolUses.current >= TOOL_GATE) {
      toolsLocked.current = true;
      setSignup('tools');
    }
    return true;
  };
  const [tool, setTool] = useState<CadTool>('select');
  const [measureMode, setMeasureMode] = useState<CadMeasureMode>('distance');
  const [marksBySheet, setMarksBySheet] = useState<Record<string, SheetMarks>>({});
  const sheetKey = `${doc.info.name}::${sheet.name}`;
  const marks = marksBySheet[sheetKey] ?? EMPTY_MARKS;
  const setMarks = (next: SheetMarks | ((current: SheetMarks) => SheetMarks)) =>
    setMarksBySheet((current) => {
      const prev = current[sheetKey] ?? EMPTY_MARKS;
      return { ...current, [sheetKey]: typeof next === 'function' ? next(prev) : next };
    });
  const runExport = (kind: ExportKind) => {
    track('export_clicked', { kind });
    if (kind === 'pdf') {
      setPngCanvas(null);
      setSignup('export');
      return;
    }
    const canvas = stageRef.current?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (pngExportsUsed() >= FREE_PNG_EXPORTS) {
      setSignup('export');
      return;
    }
    setPngCanvas(canvas);
  };
  const downloadPng = (region: PngRegion) => {
    if (!pngCanvas) return;
    const used = pngExportsUsed();
    if (used >= FREE_PNG_EXPORTS) {
      setPngCanvas(null);
      setSignup('export');
      return;
    }
    sessionStorage.setItem(PNG_EXPORT_KEY, String(used + 1));
    void exportPng(pngCanvas, stem, region);
    setPngCanvas(null);
  };
  useEffect(() => {
    setPngCanvas(null);
  }, [sheetKey]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGlimpse(false);
      return;
    }
    setGlimpse(true);
    const id = window.setTimeout(() => setGlimpse(false), 2200);
    return () => window.clearTimeout(id);
  }, [doc.info.name]);
  const commands: CadCommand[] = [
    ...EXPORTS.map(({ key, label }) => ({ label: `Export ${label}`, run: () => runExport(key) })),
    { label: 'Open another drawing', shortcut: 'O', run: pickFiles },
    { label: 'Back', run: closeDoc },
    { label: 'Full screen', run: toggleFullscreen },
    { label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', run: props.onToggleTheme },
    { label: 'Start free trial', run: () => { track('trial_clicked', { where: 'palette' }); location.assign(TRIAL_URL); } },
  ];

  return (
    <div className={styles.viewerScreen} data-viewer-theme={theme}>
      <input
        ref={inputRef}
        type="file"
        accept=".dwg,.dxf,.zip,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onFiles(files);
          event.target.value = '';
        }}
      />
      <header className={styles.viewerBar} hidden={glimpse}>
        <button type="button" className={styles.backButton} onClick={closeDoc} aria-label="Back">
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <div className={styles.fileMeta}>
          <strong className={styles.fileNameWide} title={doc.info.name}>
            {doc.info.name}
          </strong>
          <strong className={styles.fileNameNarrow} title={doc.info.name}>
            {doc.info.name}
          </strong>
          <span>
            {loading
              ? `Opening ${loading.fileName}…`
              : [doc.info.format, doc.info.version, formatSize(doc.info.size), `${sheet.drawing.entities.length.toLocaleString()} objects`]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>
        <div className={styles.viewerActions}>
          <Dropdown trigger={['click']} menu={{ items: EXPORTS, onClick: ({ key }) => runExport(key as ExportKind) }}>
            <Button icon={<Download {...icon} />}>
              <span className={styles.wideOnly}>Export</span>
            </Button>
          </Dropdown>
          <Tooltip title="Full screen">
            <Button type="text" icon={<Maximize {...icon} />} onClick={toggleFullscreen} aria-label="Full screen" />
          </Tooltip>
          <Tooltip title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            <Button type="text" icon={theme === 'dark' ? <Sun {...icon} /> : <Moon {...icon} />} onClick={props.onToggleTheme} aria-label="Switch theme" />
          </Tooltip>
          <Button type="primary" href={TRIAL_URL} icon={<MessageCircle {...icon} />} onClick={() => track('trial_clicked', { where: 'viewer' })}>
            <span className={styles.wideOnly}>Start free trial</span>
          </Button>
        </div>
      </header>
      {error && (
        <Alert banner closable type="warning" onClose={props.onDismissError} message={`${error.fileName}: ${error.message}`} />
      )}
      <motion.div
        ref={stageRef}
        layoutId="stage"
        className={styles.viewerStage}
        data-glimpse={glimpse}
        data-left-rail={leftOpen ? 'open' : 'closed'}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
      >
        <aside ref={railRef} id="drawings-views" className={styles.leftRail} aria-label="Drawings and views" aria-hidden={!leftOpen}>
          <div className={styles.leftRailHeader}>
            <span>Drawings</span>
            <span className={styles.leftRailActions}>
              <button type="button" className={styles.leftRailAdd} onClick={pickFiles} aria-label="Open another drawing">
                <Plus size={16} strokeWidth={1.75} />
              </button>
              <button type="button" className={styles.leftRailClose} onClick={() => setLeftOpen(false)} aria-label="Close drawings and views">
                <X size={18} strokeWidth={1.75} />
              </button>
            </span>
          </div>
          {docs.length > 1 ? (
            <label className={styles.leftRailSelect}>
              <select
                aria-label="Open drawings"
                value={docIndex}
                onChange={(event) => {
                  setDocIndex(Number(event.target.value));
                  setSheetIndex(0);
                }}
              >
                {docs.map((item, index) => (
                  <option key={`${item.info.name}:${index}`} value={index}>
                    {item.info.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            </label>
          ) : (
            <div className={styles.leftRailGroup}>
              <div className={`${styles.leftRailRow} ${styles.leftRailStatic}`}>
                <span>{doc.info.name}</span>
              </div>
            </div>
          )}
          <p className={styles.leftRailCaption}>Views</p>
          <div className={styles.leftRailGroup} role="listbox" aria-label="Views">
            {doc.sheets.map((item, index) => (
              <button
                key={item.name}
                type="button"
                role="option"
                aria-selected={index === sheetIndex}
                className={styles.leftRailRow}
                onClick={() => setSheetIndex(index)}
              >
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </aside>
        <button
          type="button"
          className={styles.leftRailToggle}
          aria-expanded={leftOpen}
          aria-controls="drawings-views"
          aria-label={leftOpen ? 'Hide drawings and views' : 'Show drawings and views'}
          onClick={toggleLeftRail}
        >
          {leftOpen ? <ChevronLeft size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
        </button>
        <CadDrawingViewer
          key={`${doc.info.name}:${docIndex}:${sheetIndex}`}
          drawing={sheet.drawing}
          extraCommands={commands}
          tool={tool}
          measureMode={measureMode}
          marks={marks}
          railOpen={leftOpen}
          onRailClose={() => setLeftOpen(false)}
          onTool={setTool}
          onToolUsed={noteToolUse}
          onMeasureMode={setMeasureMode}
          onMarks={setMarks}
          onCalibrate={doc.info.format === 'PDF' ? (metersPerUnit) => props.onScale(docIndex, sheetIndex, metersPerUnit) : undefined}
        />
      </motion.div>
      {pngCanvas && <PngAreaPick canvas={pngCanvas} onDownload={downloadPng} onCancel={() => setPngCanvas(null)} />}
      {signup && (
        <div className={styles.gate} role="presentation" onClick={() => setSignup(null)}>
          <div
            className={styles.gateCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className={styles.gateClose} aria-label="Close" onClick={() => setSignup(null)}>
              ×
            </button>
            <h2 id="signup-title">Sign up to SpatialSense</h2>
            <p>
              {signup === 'export'
                ? 'Sign up to SpatialSense to export this drawing.'
                : 'You have used the viewer tools. Sign up to SpatialSense to keep using them.'}
            </p>
            <a className={styles.pill} href={WORKSPACE_LOGIN_URL}>
              Sign up
            </a>
          </div>
        </div>
      )}
      {glimpse && (
        <button type="button" className={styles.glimpse} onClick={() => setGlimpse(false)} aria-label="Show the drawing">
          <p>{loading ? `Opening ${loading.fileName}` : doc.info.name}</p>
          <p>
            {[doc.info.format, doc.info.version, formatSize(doc.info.size), `${sheet.drawing.entities.length.toLocaleString()} objects`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </button>
      )}
    </div>
  );
}
