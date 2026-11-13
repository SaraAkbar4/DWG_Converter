import { RotateCcw } from 'lucide-react';
import { useViewerTranslate } from './platform';
import { FloatingSidePanel } from './platform';
import { useViewerTheme } from './platform';
import { CadAppearanceBody } from './CadAppearanceBody';
import { CadFindList, type CadFindTarget } from './CadFindList';
import { CadLayersList } from './CadLayersList';
import { CadPropertiesBody } from './CadPropertiesBody';
import styles from './cadFloorPlan.module.css';
import type { CadGroup } from './cadSelectionGroup';
import type { CadDrawing, CadPanel, CadSelection, CadStyle } from './types';

export const DEFAULT_CAD_STYLE: CadStyle = {
  look: 'drawing',
  colorMode: 'layer',
  paper: 'auto',
  grid: true,
  english: true,
};

type Props = {
  panel: CadPanel;
  onClose: () => void;
  drawing: CadDrawing;
  selection: CadSelection;
  group: CadGroup | null;
  hiddenLayers: ReadonlySet<number>;
  onLayersChange: (hidden: Set<number>) => void;
  onSelectLayer: (layer: number) => void;
  onPick: (target: CadFindTarget) => void;
  style: CadStyle;
  imageAvailable: boolean;
  onStyleChange: (style: CadStyle) => void;
};

export function CadPanels(props: Props) {
  const t = useViewerTranslate();
  const viewerTheme = useViewerTheme();
  if (!props.panel) return null;

  const resetLabel = t('viewer3d.cadFloorPlan.resetAppearance', 'Reset appearance');
  const titles: Record<Exclude<CadPanel, null>, string> = {
    layers: t('viewer3d.cadFloorPlan.layers', 'Layers'),
    find: t('viewer3d.cadFloorPlan.find', 'Find rooms and labels'),
    appearance: t('viewer3d.cadFloorPlan.appearance', 'Appearance'),
    properties: t('viewer3d.cadFloorPlan.properties', 'Properties'),
  };

  return (
    <FloatingSidePanel
      title={titles[props.panel]}
      theme={viewerTheme}
      onClose={props.onClose}
      extra={
        props.panel === 'appearance' ? (
          <button
            type="button"
            className={styles.headerIcon}
            aria-label={resetLabel}
            title={resetLabel}
            onClick={() => props.onStyleChange(DEFAULT_CAD_STYLE)}
          >
            <RotateCcw size={15} strokeWidth={1.75} />
          </button>
        ) : undefined
      }
    >
      {props.panel === 'appearance' ? (
        <CadAppearanceBody
          style={props.style}
          imageAvailable={props.imageAvailable}
          translated={[...props.drawing.texts, ...props.drawing.layers].some((item) => item.en)}
          onChange={props.onStyleChange}
        />
      ) : props.panel === 'properties' ? (
        <CadPropertiesBody
          drawing={props.drawing}
          selection={props.selection}
          group={props.group}
          english={props.style.english}
        />
      ) : (
        <div>
          {props.panel === 'layers' ? (
            <CadLayersList
              layers={props.drawing.layers}
              hiddenLayers={props.hiddenLayers}
              selectedLayer={props.group?.mode === 'layer' ? props.group.layer : null}
              onChange={props.onLayersChange}
              onSelectLayer={props.onSelectLayer}
              english={props.style.english}
            />
          ) : (
            <CadFindList
              drawing={props.drawing}
              english={props.style.english}
              onPick={props.onPick}
            />
          )}
        </div>
      )}
    </FloatingSidePanel>
  );
}
