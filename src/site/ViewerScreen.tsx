import { Alert, Button, Dropdown, Tooltip } from 'antd';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Maximize, MessageCircle, Moon, Plus, Sun, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CadCommand } from '../cad/CadCommandPalette';
import { CadDrawingViewer, type CadExporter } from '../cad/CadDrawingViewer';
import type { Bounds } from '../cad/cadGeometry';
import type { CadMeasure, CadPoint } from '../cad/cadMeasure';
import type { CadMeasureMode, CadTool } from '../cad/useCadCanvas';
import type { ViewerTheme } from '../cad/platform';
import type { DrawingDoc, DrawingFailure, DrawingLoading } from '../convert/useDrawingFile';
import { TRIAL_URL, WORKSPACE_SIGNUP_URL } from './content';
import { exportSheetPng, type PngRegion } from './exportDrawing';
import { ExportDialog, type ExportArea } from './ExportDialog';
import type { SheetLayout } from './exportSheet';
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
  onCancel: () => void;
  onScale: (docIndex: number, sheetIndex: number, metersPerUnit: number) => void;
};

type ExportKind = 'png' | 'pdf';
const EXPORTS: Array<{ key: ExportKind; label: string }> = [
  { key: 'png', label: 'PNG image (paper and scale)' },
  { key: 'pdf', label: 'PDF (whole sheet, A3)' },
];
const icon = { size: 16, strokeWidth: 1.75 } as const;
const EMPTY_MARKS = { saved: [] as CadMeasure[], draft: [] as CadPoint[] };
type SheetMarks = { saved: CadMeasure[]; draft: CadPoint[] };
const formatSize = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
const OPENING_STAGE: Record<DrawingLoading['stage'], string> = {
  reading: 'Reading the file',
  parsing: 'Reading the drawing',
  building: 'Building the drawing',
  rendering: 'Drawing',
};
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
  useEffect(() => {
    if (!signup) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSignup(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signup]);
  const exporterRef = useRef<CadExporter | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportArea, setExportArea] = useState<ExportArea>('view');
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const [pickedBounds, setPickedBounds] = useState<Bounds | null>(null);
  /** The drawing canvas while an area is being dragged out on it. */
  const [picking, setPicking] = useState<HTMLCanvasElement | null>(null);
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
  const closeExport = () => {
    setExportOpen(false);
    setPicking(null);
  };
  const runExport = (kind: ExportKind) => {
    track('export_clicked', { kind });
    if (kind === 'pdf') {
      closeExport();
      setSignup('export');
      return;
    }
    if (pngExportsUsed() >= FREE_PNG_EXPORTS) {
      setSignup('export');
      return;
    }
    setViewBounds(exporterRef.current?.visibleBounds() ?? null);
    setExportOpen(true);
  };
  const chooseArea = () => {
    const canvas = stageRef.current?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    setExportOpen(false);
    setPicking(canvas);
  };
  const usePickedArea = (region: PngRegion) => {
    const bounds = exporterRef.current?.screenRectBounds(region) ?? null;
    if (bounds) {
      setPickedBounds(bounds);
      setExportArea('picked');
    }
    setPicking(null);
    setExportOpen(true);
  };
  const downloadPng = (layout: SheetLayout) => {
    const exporter = exporterRef.current;
    if (!exporter) return;
    const used = pngExportsUsed();
    if (used >= FREE_PNG_EXPORTS) {
      closeExport();
      setSignup('export');
      return;
    }
    sessionStorage.setItem(PNG_EXPORT_KEY, String(used + 1));
    track('export_png', { orientation: layout.width > layout.height ? 'landscape' : 'portrait', dpi: Math.round(layout.dpi), area: exportArea });
    void exportSheetPng(exporter, layout, stem);
    closeExport();
  };
  useEffect(() => {
    closeExport();
    setPickedBounds(null);
    setExportArea('view');
  }, [sheetKey]);
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
      <header className={styles.viewerBar}>
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
        data-opening={loading ? 'true' : undefined}
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
          exporterRef={exporterRef}
          onCalibrate={doc.info.format === 'PDF' ? (metersPerUnit) => props.onScale(docIndex, sheetIndex, metersPerUnit) : undefined}
        />
        {loading && (
          <div className={styles.viewerLoading} role="status" aria-live="polite">
            <span className={styles.viewerSpinner} aria-hidden />
            <strong>Opening {loading.fileName}</strong>
            <span>{OPENING_STAGE[loading.stage]}</span>
            <button type="button" className={styles.pillGhost} onClick={props.onCancel}>
              Cancel
            </button>
          </div>
        )}
      </motion.div>
      <ExportDialog
        open={exportOpen}
        exporter={exporterRef.current}
        stem={stem}
        viewBounds={viewBounds}
        picked={pickedBounds}
        area={exportArea}
        onArea={setExportArea}
        onChooseArea={chooseArea}
        onCancel={closeExport}
        onDownload={downloadPng}
      />
      {picking && (
        <PngAreaPick
          canvas={picking}
          onPick={usePickedArea}
          onCancel={() => {
            setPicking(null);
            setExportOpen(true);
          }}
        />
      )}
      {signup && (
        <div className={styles.gate} role="presentation" onClick={() => setSignup(null)}>
          <div
            className={styles.gateCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.gateHero}>
              <img src="/signup-cranes.jpg" alt="" />
              <button type="button" className={styles.gateClose} aria-label="Close" onClick={() => setSignup(null)}>
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>
            <form
              className={styles.gateBody}
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                track('trial_clicked', { where: signup === 'export' ? 'signup_export' : 'signup_tools' });
                location.assign(WORKSPACE_SIGNUP_URL);
              }}
            >
              <h2 id="signup-title">You've only seen part of it</h2>
              <p>Try free for 30 days. Compare drawings with BIM, track progress and share with your team.</p>
              <label htmlFor="signup-email">Work email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="name@company.com"
              />
              <button type="submit" className={styles.gateSubmit}>
                Sign up
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
