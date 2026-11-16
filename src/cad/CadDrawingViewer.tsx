import { theme } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CadCommandPalette, type CadCommand } from './CadCommandPalette';
import type { CadFindTarget } from './CadFindList';
import styles from './cadFloorPlan.module.css';
import { CadPanels, DEFAULT_CAD_STYLE } from './CadPanels';
import { CAD_PAPER, PRINT_PAPER } from './cadPaper';
import { selectionGroup, type CadSelectMode } from './cadSelectionGroup';
import { CadSelectionBar } from './CadSelectionBar';
import { CadStatusChip } from './CadStatusChip';
import { CadToolbar } from './CadToolbar';
import { CadViewRail } from './CadViewRail';
import { entityPath } from './drawCadScene';
import { useViewerTheme, useViewerTranslate } from './platform';
import { prepareCadScene } from './prepareCadScene';
import type { CadMeasure, CadPoint } from './cadMeasure';
import { useCadCanvas, type CadMeasureMode, type CadTool } from './useCadCanvas';
import { useCadLayerVisibility } from './useCadLayerVisibility';
import type { CadDrawing, CadPanel, CadSelection, CadStyle } from './types';

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
};

export function CadDrawingViewer({ drawing, extraCommands, tool, measureMode, marks, railOpen, onRailClose, onTool, onToolUsed, onMeasureMode, onMarks, onCalibrate }: Props) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const viewerTheme = useViewerTheme();
  const scene = useMemo(() => prepareCadScene(drawing), [drawing]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectMode, setSelectMode] = useState<CadSelectMode>('object');
  const [style, setStyle] = useState<CadStyle>(DEFAULT_CAD_STYLE);
  const [panel, setPanel] = useState<CadPanel>(null);
  const [selection, setSelection] = useState<CadSelection>(null);
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
  });

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
    { label: 'Measure distance', shortcut: 'M', run: () => (tool === 'measure' ? stopMeasure() : startMeasure('distance')) },
    { label: 'Measure area', shortcut: 'R', run: () => startMeasure('area') },
    { label: 'Measure angle', shortcut: 'G', run: () => startMeasure('angle') },
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
      commandsRef.current.find((command) => command.shortcut === key)?.run();
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
        measure={marks.draft}
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
        onExitMeasure={stopMeasure}
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
      />
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
