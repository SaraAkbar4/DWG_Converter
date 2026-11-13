import { useViewerTranslate } from './platform';
import type { RefObject } from 'react';
import { layerLabel } from './CadLayersList';
import type { CadGroup } from './cadSelectionGroup';
import { CadSelectionPill, cadPillIcons } from './CadSelectionPill';
import { measureLabel, type CadMeasure } from './cadMeasure';
import type { CadMeasureMode, CadTool } from './useCadCanvas';
import type { CadDrawing, CadSelection } from './types';
import { useCadSelectionDetails } from './useCadSelectionDetails';

type Props = {
  drawing: CadDrawing;
  selection: CadSelection;
  group: CadGroup | null;
  english: boolean;
  tool: CadTool;
  measure: Array<[number, number]>;
  saved: CadMeasure[];
  measureMode: CadMeasureMode;
  propertiesOpen: boolean;
  onToggleProperties: () => void;
  onZoomTo: () => void;
  isolatedLayer: number | null;
  onToggleIsolate: (layer: number) => void;
  layerHidden: boolean;
  onToggleHidden: (layer: number) => void;
  avoidRef: RefObject<HTMLElement | null>;
  onClearSelection: () => void;
  onExitMeasure: () => void;
};

export function CadSelectionBar(props: Props) {
  const { drawing, group } = props;
  const t = useViewerTranslate();
  const { heading } = useCadSelectionDetails(drawing, props.selection, group, props.english);

  if (props.tool === 'measure') {
    const { measure, measureMode, saved } = props;
    const finished = [...saved].reverse().find((item) => item.mode === measureMode);
    const result =
      measureLabel({ mode: measureMode, points: measure }, drawing) ??
      (finished ? measureLabel(finished, drawing) : null);
    const titles = { distance: 'Measure distance', area: 'Measure area', angle: 'Measure angle' };
    const hints = {
      distance: 'Click two points. Right-click to stop. It stays on this sheet until you close the viewer.',
      area: 'Click the corners, then the first point again. Right-click to stop. It stays on this sheet until you close the viewer.',
      angle: 'Click three points. Right-click to stop. The angle stays until you close the viewer.',
    };
    return (
      <CadSelectionPill
        title={t(`viewer3d.cadFloorPlan.measure.${measureMode}`, titles[measureMode])}
        detail={result ?? t(`viewer3d.cadFloorPlan.measureHint.${measureMode}`, hints[measureMode])}
        actions={[]}
        onClose={props.onExitMeasure}
        avoidRef={props.avoidRef}
      />
    );
  }
  if (!heading || !group) return null;

  const isolated = props.isolatedLayer === group.layer;
  const layerName = layerLabel(drawing.layers[group.layer], props.english);
  const detail =
    heading.count != null
      ? `${heading.badge} · ${t('viewer3d.cadFloorPlan.selectedCount', '{count} selected', {
          count: heading.count.toLocaleString(),
        })}`
      : `${heading.badge} · ${layerName}`;

  return (
    <CadSelectionPill
      title={heading.title}
      detail={detail}
      onClose={props.onClearSelection}
      avoidRef={props.avoidRef}
      actions={[
        {
          key: 'properties',
          label: t('viewer3d.cadFloorPlan.properties', 'Properties'),
          icon: cadPillIcons.properties,
          active: props.propertiesOpen,
          onClick: props.onToggleProperties,
        },
        {
          key: 'zoom',
          label: t('viewer3d.cadFloorPlan.zoomTo', 'Zoom to'),
          icon: cadPillIcons.zoomTo,
          onClick: props.onZoomTo,
        },
        {
          key: 'isolate',
          label: isolated
            ? t('viewer3d.cadFloorPlan.exitIsolate', 'Exit isolate')
            : t('viewer3d.cadFloorPlan.isolateLayer', 'Isolate layer'),
          icon: cadPillIcons.isolate,
          active: isolated,
          onClick: () => props.onToggleIsolate(group.layer),
        },
        {
          key: 'hide',
          label: props.layerHidden
            ? t('viewer3d.cadFloorPlan.showThisLayer', 'Show layer')
            : t('viewer3d.cadFloorPlan.hideThisLayer', 'Hide layer'),
          icon: props.layerHidden ? cadPillIcons.show : cadPillIcons.hide,
          onClick: () => props.onToggleHidden(group.layer),
        },
      ]}
    />
  );
}
