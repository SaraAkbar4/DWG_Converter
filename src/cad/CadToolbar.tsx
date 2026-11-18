import { useViewerTranslate } from './platform';
import {
  Boxes,
  DraftingCompass,
  Layers,
  ListTree,
  MousePointer2,
  Palette,
  Ruler,
  Search,
  Square,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { CadSelectMode } from './cadSelectionGroup';
import { CadToolbarItem, type CadMenuOption } from './CadToolbarItem';
import type { CadMeasureMode, CadTool } from './useCadCanvas';
import type { CadPanel } from './types';

const icon = { size: 14, strokeWidth: 1.75 } as const;

type Props = {
  tool: CadTool;
  selectMode: CadSelectMode;
  onSelectMode: (mode: CadSelectMode) => void;
  onDeactivateSelect: () => void;
  measureMode: CadMeasureMode;
  onMeasure: (mode: CadMeasureMode) => void;
  onDeactivateMeasure: () => void;
  panel: CadPanel;
  onTogglePanel: (panel: Exclude<CadPanel, null>) => void;
};

export function CadToolbar(props: Props) {
  const t = useViewerTranslate();
  const [compact, setCompact] = useState(false);
  const [openMenu, setOpenMenu] = useState<'select' | 'measure' | null>(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  const accent = {
    '--tool-active': '#0D4799',
    '--tool-active-hover': '#0A3A7D',
    '--tool-active-color': '#F0F5FF',
  } as CSSProperties;

  const selectModes: CadMenuOption<CadSelectMode>[] = [
    {
      value: 'object',
      label: t('viewer3d.cadFloorPlan.modeObject', 'Object'),
      icon: <MousePointer2 {...icon} />,
    },
    {
      value: 'layer',
      label: t('viewer3d.cadFloorPlan.modeLayer', 'Layer'),
      icon: <Layers {...icon} />,
    },
    {
      value: 'block',
      label: t('viewer3d.cadFloorPlan.modeBlock', 'Block'),
      icon: <Boxes {...icon} />,
    },
  ];
  const measureModes: CadMenuOption<CadMeasureMode>[] = [
    { value: 'distance', label: t('viewer3d.cadFloorPlan.measureDistance', 'Distance'), icon: <Ruler {...icon} /> },
    { value: 'area', label: t('viewer3d.cadFloorPlan.measureArea', 'Area'), icon: <Square {...icon} /> },
    { value: 'angle', label: t('viewer3d.cadFloorPlan.measureAngle', 'Angle'), icon: <DraftingCompass {...icon} /> },
  ];
  const currentMode = selectModes.find((o) => o.value === props.selectMode) ?? selectModes[0]!;

  return (
    <div className={`potree-toolbar-left potree-toolbar-horizontal${compact ? ' potree-toolbar-compact' : ''}`} style={accent}>
      <div
        className="potree-toolbar-horizontal-bar"
        role="toolbar"
        aria-label={t('viewer3d.cadFloorPlan.toolbar', 'Drawing tools')}
      >
        <CadToolbarItem
          label={currentMode.label}
          title={t('viewer3d.cadFloorPlan.selectBy', 'Select by')}
          icon={currentMode.icon}
          active={props.tool === 'select'}
          onDeactivate={props.onDeactivateSelect}
          menu={{ options: selectModes, value: props.selectMode, onSelect: props.onSelectMode }}
          menuOpen={openMenu === 'select'}
          onMenuOpenChange={(open) => setOpenMenu(open ? 'select' : null)}
        />
        <CadToolbarItem
          label={t('viewer3d.cadFloorPlan.measureShort', 'Measure')}
          title={t('viewer3d.cadFloorPlan.measure', 'Measure')}
          icon={<Ruler {...icon} />}
          active={props.tool === 'measure'}
          onDeactivate={props.onDeactivateMeasure}
          menu={{ options: measureModes, value: props.measureMode, onSelect: props.onMeasure }}
          menuOpen={openMenu === 'measure'}
          onMenuOpenChange={(open) => setOpenMenu(open ? 'measure' : null)}
        />
        <span className="potree-toolbar-horizontal-divider" />
        <CadToolbarItem
          label={t('viewer3d.cadFloorPlan.layers', 'Layers')}
          icon={<ListTree {...icon} />}
          active={props.panel === 'layers'}
          onClick={() => props.onTogglePanel('layers')}
        />
        <CadToolbarItem
          label={t('viewer3d.cadFloorPlan.searchTab', 'Search')}
          title={t('viewer3d.cadFloorPlan.find', 'Rooms and text search')}
          icon={<Search {...icon} />}
          active={props.panel === 'find'}
          onClick={() => props.onTogglePanel('find')}
        />
        <CadToolbarItem
          label={t('viewer3d.cadFloorPlan.appearance', 'Appearance')}
          icon={<Palette {...icon} />}
          active={props.panel === 'appearance'}
          onClick={() => props.onTogglePanel('appearance')}
        />
      </div>
    </div>
  );
}
