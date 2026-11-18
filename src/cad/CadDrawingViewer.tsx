import { theme } from 'antd';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { CadCommandPalette, type CadCommand } from './CadCommandPalette';
import type { CadFindTarget } from './CadFindList';
import styles from './cadFloorPlan.module.css';
import { CadPanels, DEFAULT_CAD_STYLE } from './CadPanels';
import { CAD_PAPER, PRINT_PAPER } from './cadPaper';
import { selectionGroup, type CadSelectMode } from './cadSelectionGroup';
import { CadSelectionBar } from './CadSelectionBar';
import { CadStatusChip } from './CadStatusChip';
import { CadCursorReadout } from './CadCursorReadout';
import { CadSnapControls } from './CadSnapControls';
import { DEFAULT_SNAP_SETTINGS, type CadAngleLock, type CadSnapSettings } from './cadSnap';
import { CadToolbar } from './CadToolbar';
import { CadViewRail } from './CadViewRail';
import type { CadScreenRect, CadView } from './cadView';
import type { Bounds } from './cadGeometry';
import { entityPath } from './drawCadScene';
import { useViewerTheme, useViewerTranslate } from './platform';
import { countLayersIn, prepareCadScene } from './prepareCadScene';
import type { CadMeasure, CadPoint } from './cadMeasure';
import { useCadCanvas, type CadMeasureMode, type CadTool } from './useCadCanvas';
import { useCadLayerVisibility } from './useCadLayerVisibility';
import type { CadDrawing, CadLayer, CadPanel, CadSelection, CadStyle } from './types';

const PRINT_WEIGHT_PER_EXTENT = 0.0004;
const PRINT_MIN_LINE_PX = 0.6;
const PRINT_MAX_LINE_PX = 2.4;
const PRINT_MIN_TEXT_PX = 1;
const DRAWING_MIN_TEXT_PX = 3;
const ZOOM_STEP = 1.5;

type SheetMarks = { saved: CadMeasure[]; draft: CadPoint[] };

const SINGLE_SIDEBAR = '(max-width: 1024px)';

type Props = {
  drawing: CadDrawing;
  extraCommands: CadCommand[];
  tool: CadTool;
  measureMode: CadMeasureMode;
  marks: SheetMarks;
  railOpen: boolean;
  onRailClose: () => void;
  onTool: (tool: CadTool) => void;
  /** Returns false once the free tool uses are spent, and the action must not run. */
  onToolUsed: () => boolean;
  onMeasureMode: (mode: CadMeasureMode) => void;
  onMarks: (marks: SheetMarks | ((current: SheetMarks) => SheetMarks)) => void;
  /** Present when the sheet's real-world scale can be set from a measured length (PDF plots). */
  onCalibrate?: (metersPerUnit: number) => void;
  /** Filled with what an export needs to draw the drawing onto a sheet of paper. */
  exporterRef?: MutableRefObject<CadExporter | null>;
};

/** Draws the open drawing for export, and reads which part of it an area covers. */
export type CadExporter = {
  /** The whole drawing's extent, in drawing units. */
  bounds: Bounds;
  metersPerUnit: number | null;
  /** The drawing through `view`, on white paper, `width` × `height` pixels, without `hiddenLayers` (default: those hidden on screen). */
  render: (view: CadView, width: number, height: number, dpr: number, hiddenLayers?: ReadonlySet<number>) => HTMLCanvasElement | null;
  layers: CadLayer[];
  /** Layers turned off on screen now. */
  hiddenLayers: ReadonlySet<number>;
  /** How many lines and texts of each layer lie in `area`, for layers with any. */
  layersIn: (area: Bounds) => Map<number, number>;
  /** The part of the drawing on screen now. */
  visibleBounds: () => Bounds | null;
  /** The part of the drawing under a rectangle of the canvas, in CSS pixels. */
  screenRectBounds: (rect: CadScreenRect) => Bounds | null;
};

export function CadDrawingViewer({ drawing, extraCommands, tool, measureMode, marks, railOpen, onRailClose, onTool, onToolUsed, onMeasureMode, onMarks, onCalibrate, exporterRef }: Props) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const viewerTheme = useViewerTheme();
  const scene = useMemo(() => prepareCadScene(drawing), [drawing]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectMode, setSelectMode] = useState<CadSelectMode>('object');
  const [style, setStyle] = useState<CadStyle>(DEFAULT_CAD_STYLE);
  const [panel, setPanel] = useState<CadPanel>(null);
  const [selection, setSelection] = useState<CadSelection>(null);
  const [snapSettings, setSnapSettings] = useStoredState<CadSnapSettings>('kodifly-viewer-snaps', DEFAULT_SNAP_SETTINGS);
  const [angleLock, setAngleLock] = useStoredState<CadAngleLock>('kodifly-viewer-angle-lock', 0);
  const drawingLook = style.look === 'drawing';
  const paperTone = style.paper === 'auto' ? viewerTheme : style.paper;
  const paper = drawingLook ? CAD_PAPER[paperTone] : PRINT_PAPER;
  const extentSize = Math.max(scene.bounds[2] - scene.bounds[0], scene.bounds[3] - scene.bounds[1]);

  const layers = useCadLayerVisibility(scene);
  const { hiddenLayers } = layers;
  const statusRef = useRef<HTMLDivElement>(null);
  const accent = useMemo(
    () => ({ selection: token.colorPrimary, hover: token.colorWarning }),
    [token.colorPrimary, token.colorWarning],
  );
  const group = useMemo(
    () => selectionGroup(scene.drawing, scene.entityBounds, selection, selectMode),
    [scene, selection, selectMode],
  );
  const highlight = useMemo(
    () => (group ? { path: entityPath(scene, group.entities), texts: new Set(group.texts) } : null),
    [scene, group],
  );
  const canvas = useCadCanvas({
    scene,
    colorMode: drawingLook ? style.colorMode : 'mono',
    paper,
    showGrid: drawingLook && style.grid,
    lineWeight: drawingLook
      ? { px: 1 }
      : {
          world: extentSize * PRINT_WEIGHT_PER_EXTENT,
          minPx: PRINT_MIN_LINE_PX,
          maxPx: PRINT_MAX_LINE_PX,
        },
    minTextPx: drawingLook ? DRAWING_MIN_TEXT_PX : PRINT_MIN_TEXT_PX,
    english: style.english,
    image: null,
    accent,
    hiddenLayers,
    highlight,
    tool,
    measureMode,
    measures: marks.saved,
    draft: marks.draft,
    onDraft: (draft) => onMarks((current) => ({ saved: current.saved, draft })),
    onCommit: (measure) => {
      onMarks((current) => ({ saved: [...current.saved, measure], draft: [] }));
    },
    onStopMeasure: () => {
      onMarks((current) => ({ saved: current.saved, draft: [] }));
      onTool('select');
    },
    onSelect: setSelection,
    snapSettings,
    angleLock,
  });

  const { renderSheet, visibleBounds, screenRectBounds } = canvas;
  useEffect(() => {
    if (!exporterRef) return;
    const exporter: CadExporter = {
      bounds: scene.bounds,
      metersPerUnit: drawing.meters_per_unit,
      render: renderSheet,
      layers: drawing.layers,
      hiddenLayers,
      layersIn: (area) => countLayersIn(scene, area),
      visibleBounds,
      screenRectBounds,
    };
    exporterRef.current = exporter;
    return () => {
      if (exporterRef.current === exporter) exporterRef.current = null;
    };
  }, [exporterRef, scene, drawing.meters_per_unit, drawing.layers, hiddenLayers, renderSheet, visibleBounds, screenRectBounds]);

  const togglePanel = (next: Exclude<CadPanel, null>) =>
    setPanel((current) => {
      if (current === next) return null;
      if (!onToolUsed()) return current;
      if (window.matchMedia(SINGLE_SIDEBAR).matches) onRailClose();
      return next;
    });
  // On a tablet, the drawings rail and a tool panel cannot both stay open.
  useEffect(() => {
    if (railOpen && window.matchMedia(SINGLE_SIDEBAR).matches) setPanel(null);
  }, [railOpen]);
  const keepDraft = (mode: CadMeasureMode): SheetMarks =>
    mode === 'area' && marks.draft.length >= 3
      ? { saved: [...marks.saved, { mode: 'area', points: marks.draft }], draft: [] }
      : { saved: marks.saved, draft: [] };
  const startMeasure = (mode: CadMeasureMode) => {
    if (!onToolUsed()) return;
    onMarks(keepDraft(measureMode));
    onMeasureMode(mode);
    onTool('measure');
  };
  const stopMeasure = () => {
    onMarks(keepDraft(measureMode));
    onTool('select');
  };

  const commands: CadCommand[] = [
    { label: 'Fit drawing to screen', shortcut: 'F', run: canvas.fit },
    { label: 'Zoom in', shortcut: '+', run: () => canvas.zoomBy(ZOOM_STEP) },
    { label: 'Zoom out', shortcut: '-', run: () => canvas.zoomBy(1 / ZOOM_STEP) },
    { label: 'Pan left', shortcut: '←', run: () => canvas.panArrow('ArrowLeft') },
    { label: 'Pan right', shortcut: '→', run: () => canvas.panArrow('ArrowRight') },
    { label: 'Pan up', shortcut: '↑', run: () => canvas.panArrow('ArrowUp') },
    { label: 'Pan down', shortcut: '↓', run: () => canvas.panArrow('ArrowDown') },
    { label: 'Measure distance', shortcut: 'M', run: () => (tool === 'measure' ? stopMeasure() : startMeasure('distance')) },
    { label: 'Measure area', shortcut: 'R', run: () => startMeasure('area') },
    { label: 'Measure angle', shortcut: 'G', run: () => startMeasure('angle') },
    {
      label: snapSettings.enabled ? 'Turn snapping off' : 'Turn snapping on',
      shortcut: 'F3',
      run: () => setSnapSettings({ ...snapSettings, enabled: !snapSettings.enabled }),
    },
    {
      label: angleLock === 90 ? 'Turn ortho lock off' : 'Lock measuring to horizontal or vertical (ortho)',
      shortcut: 'F8',
      run: () => setAngleLock(angleLock === 90 ? 0 : 90),
    },
    { label: 'Layers', shortcut: 'L', run: () => togglePanel('layers') },
    { label: 'Search rooms and labels', shortcut: 'S', run: () => togglePanel('find') },
    { label: 'Appearance', shortcut: 'A', run: () => togglePanel('appearance') },
    ...extraCommands,
    { label: 'Show commands and shortcuts', shortcut: '?', run: () => setPaletteOpen(true) },
  ];
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key === '=' ? '+' : event.key.toUpperCase();
      const command = commandsRef.current.find((item) => item.shortcut === key);
      if (!command) return;
      // F3 and F8 would otherwise open the browser's find bar or similar.
      if (/^F\d+$/.test(key)) event.preventDefault();
      command.run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onPick = (target: CadFindTarget) => {
    canvas.flyTo(target.x, target.y, target.size);
    setSelection({ kind: 'text', index: target.textIndex });
    onTool('select');
  };
  const selectLayer = (layer: number) => {
    const first = drawing.entities.findIndex((entity) => entity.l === layer);
    const textIndex = first < 0 ? drawing.texts.findIndex((text) => text.l === layer) : -1;
    if (first < 0 && textIndex < 0) return;
    setSelectMode('layer');
    onTool('select');
    setSelection(
      first >= 0 ? { kind: 'entity', index: first } : { kind: 'text', index: textIndex },
    );
  };

  return (
    <div
      className={styles.root}
      data-viewer-side-panel={panel ? 'right' : undefined}
      data-rail-open={railOpen ? 'true' : undefined}
      style={{
        background: paper.background,
        ['--viewer-side-panel-width' as string]: panel ? '340px' : '0px',
      }}
    >
      <div
        className={styles.canvasHost}
        style={{ cursor: tool === 'measure' ? 'crosshair' : 'default' }}
      >
        <canvas
          ref={canvas.canvasRef}
          tabIndex={0}
          role="img"
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
          aria-label={t('viewer3d.cadFloorPlan.canvasLabel', 'Vector drawing')}
          style={{ display: 'block', touchAction: 'none' }}
        />
      </div>
      <CadToolbar
        tool={tool}
        selectMode={selectMode}
        onSelectMode={(mode) => {
          if (!onToolUsed()) return;
          setSelectMode(mode);
          onTool('select');
          onMarks(keepDraft(measureMode));
        }}
        onDeactivateSelect={() => {
          setSelection(null);
          onTool('pan');
        }}
        measureMode={measureMode}
        onMeasure={startMeasure}
        onDeactivateMeasure={stopMeasure}
        panel={panel}
        onTogglePanel={togglePanel}
      />
      <CadSelectionBar
        drawing={drawing}
        english={style.english}
        selection={selection}
        group={group}
        tool={tool}
        measure={
          tool === 'measure' && measureMode === 'angle' && marks.draft.length === 2 && canvas.cursor
            ? [...marks.draft, [canvas.cursor.x, canvas.cursor.y]]
            : marks.draft
        }
        saved={marks.saved}
        measureMode={measureMode}
        onCalibrate={onCalibrate}
        propertiesOpen={panel === 'properties'}
        onToggleProperties={() => togglePanel('properties')}
        onZoomTo={() => group?.bounds && canvas.zoomToBounds(group.bounds)}
        isolatedLayer={layers.isolatedLayer}
        onToggleIsolate={layers.toggleIsolate}
        layerHidden={group ? hiddenLayers.has(group.layer) : false}
        onToggleHidden={(layer) => {
          if (!hiddenLayers.has(layer)) setSelection(null);
          layers.toggleHidden(layer);
        }}
        avoidRef={statusRef}
        onClearSelection={() => setSelection(null)}
        snapControls={
          <CadSnapControls
            settings={snapSettings}
            onSettings={setSnapSettings}
            angleLock={angleLock}
            onAngleLock={setAngleLock}
            gridShown={drawingLook && style.grid}
          />
        }
      />
      <CadStatusChip
        ref={statusRef}
        drawing={drawing}
        english={style.english}
        isolatedLayer={layers.isolatedLayer}
        extraHidden={layers.extraHidden}
        onExitIsolate={() =>
          layers.isolatedLayer != null && layers.toggleIsolate(layers.isolatedLayer)
        }
        onShowLayer={layers.toggleHidden}
        onResetLayers={layers.reset}
      >
        <CadCursorReadout cursor={canvas.cursor} metersPerUnit={drawing.meters_per_unit} units={drawing.units} measuring={tool === 'measure'} />
      </CadStatusChip>
      <CadViewRail onFit={canvas.fit} onZoom={canvas.zoomBy} />
      <CadCommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <CadPanels
        panel={panel}
        onClose={() => setPanel(null)}
        drawing={drawing}
        selection={selection}
        group={group}
        hiddenLayers={hiddenLayers}
        onLayersChange={layers.setLayers}
        onSelectLayer={selectLayer}
        onPick={onPick}
        style={style}
        imageAvailable={false}
        onStyleChange={setStyle}
      />
    </div>
  );
}

/** State kept in this browser between visits. Falls back to `initial` when storage is unavailable. */
function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored == null) return;
      const parsed = JSON.parse(stored) as T;
      setValue(typeof initial === 'object' && initial ? { ...initial, ...parsed } : parsed);
    } catch {
      // Private windows and blocked storage keep the default.
    }
    // `initial` is a constant for each key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const store = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Not saved; the setting still applies for this visit.
    }
  };
  return [value, store];
}
