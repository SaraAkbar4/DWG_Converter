import { Button, Input, Select, theme } from 'antd';
import { useState, type ReactNode, type RefObject } from 'react';
import { useViewerTranslate } from './platform';
import { layerLabel } from './CadLayersList';
import type { CadGroup } from './cadSelectionGroup';
import { CadMeasureBar } from './CadMeasureBar';
import { CadSelectionPill, cadPillIcons } from './CadSelectionPill';
import { measureLabel, type CadMeasure, type CadPoint } from './cadMeasure';
import { KNOWN_LENGTH_UNITS, metersPerDrawingUnit, type KnownLengthUnit } from './cadUnits';
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
  /** Present when this sheet's scale can be set from a measured length. */
  onCalibrate?: (metersPerUnit: number) => void;
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
  /** Snap and angle-lock settings, shown while measuring. */
  snapControls?: ReactNode;
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
    const distance =
      measureMode === 'distance' ? pairLength(measure.length >= 2 ? measure : finished?.points) : 0;
    return (
      <CadMeasureBar
        mode={measureMode}
        result={result}
        onClose={props.onExitMeasure}
        avoidRef={props.avoidRef}
        controls={props.snapControls}
        footer={
          props.onCalibrate && distance > 0 ? (
            <ScaleField drawingLength={distance} onCalibrate={props.onCalibrate} />
          ) : undefined
        }
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

function pairLength(points: CadPoint[] | undefined): number {
  const start = points?.[0];
  const end = points?.[1];
  if (!start || !end) return 0;
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function ScaleField({
  drawingLength,
  onCalibrate,
}: {
  drawingLength: number;
  onCalibrate: (metersPerUnit: number) => void;
}) {
  const t = useViewerTranslate();
  const { token } = theme.useToken();
  const [known, setKnown] = useState('');
  const [unit, setUnit] = useState<KnownLengthUnit>('m');
  const metersPerUnit = metersPerDrawingUnit(drawingLength, Number(known), unit);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (metersPerUnit != null) onCalibrate(metersPerUnit);
      }}
      style={{ display: 'flex', alignItems: 'center', gap: token.marginXXS }}
    >
      <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
        {t('viewer3d.cadFloorPlan.scale.thisIs', 'This is')}
      </span>
      <Input
        size="small"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={known}
        aria-label={t('viewer3d.cadFloorPlan.scale.knownLength', 'Real length')}
        onChange={(event) => setKnown(event.target.value)}
        style={{ width: 88 }}
      />
      <Select
        size="small"
        value={unit}
        aria-label={t('viewer3d.cadFloorPlan.scale.unit', 'Length unit')}
        popupMatchSelectWidth={false}
        onChange={setUnit}
        options={KNOWN_LENGTH_UNITS.map((value) => ({ value, label: value }))}
        style={{ width: 72 }}
      />
      <Button htmlType="submit" type="primary" size="small" disabled={metersPerUnit == null}>
        {t('viewer3d.cadFloorPlan.scale.set', 'Set scale')}
      </Button>
    </form>
  );
}
