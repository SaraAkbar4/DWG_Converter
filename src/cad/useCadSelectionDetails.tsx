import { useViewerTranslate } from './platform';
import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { polygonArea, polylineLength } from './cadGeometry';
import { layerLabel } from './CadLayersList';
import type { CadGroup } from './cadSelectionGroup';
import { formatArea, formatLength } from './cadUnits';
import type { CadDrawing, CadSelection } from './types';

export type CadDetailRow = { label: string; value: ReactNode };

function useRows(
  drawing: CadDrawing,
  selection: CadSelection,
  group: CadGroup | null,
  english: boolean,
): CadDetailRow[] {
  const t = useViewerTranslate();
  const len = (v: number) => formatLength(v, drawing.meters_per_unit, drawing.units);
  if (!selection || !group) return [];
  const rows: CadDetailRow[] = [
    {
      label: t('viewer3d.cadFloorPlan.layer', 'Layer'),
      value: layerLabel(drawing.layers[group.layer], english) || '—',
    },
    {
      label: t('viewer3d.cadFloorPlan.block', 'Block'),
      value:
        drawing.block_paths[group.block] || t('viewer3d.cadFloorPlan.modelSpace', 'Model space'),
    },
  ];
  if (group.mode !== 'object') {
    const types = new Map<string, number>();
    let total = 0;
    for (const i of group.entities) {
      const entity = drawing.entities[i];
      if (!entity) continue;
      types.set(entity.t, (types.get(entity.t) ?? 0) + 1);
      total += polylineLength(entity.p, entity.closed);
    }
    const breakdown = [...types.entries()].sort((a, b) => b[1] - a[1]);
    rows.push({
      label: t('viewer3d.cadFloorPlan.contains', 'Contains'),
      value: (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {breakdown.map(([type, count]) => (
            <Tag key={type} bordered={false} style={{ marginInlineEnd: 0 }}>
              {type} {count.toLocaleString()}
            </Tag>
          ))}
          {group.texts.length > 0 ? (
            <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
              TEXT {group.texts.length.toLocaleString()}
            </Tag>
          ) : null}
        </span>
      ),
    });
    rows.push({ label: t('viewer3d.cadFloorPlan.totalLength', 'Total length'), value: len(total) });
    return rows;
  }
  if (selection.kind === 'entity') {
    const entity = drawing.entities[selection.index];
    if (!entity) return rows;
    rows.push({
      label: t('viewer3d.cadFloorPlan.length', 'Length'),
      value: len(polylineLength(entity.p, entity.closed)),
    });
    if (entity.closed || entity.fill) {
      rows.push({
        label: t('viewer3d.cadFloorPlan.area', 'Area'),
        value: formatArea(polygonArea(entity.p), drawing.meters_per_unit, drawing.units),
      });
    }
    rows.push({
      label: t('viewer3d.cadFloorPlan.vertices', 'Vertices'),
      value: entity.p.length / 2,
    });
    return rows;
  }
  const text = drawing.texts[selection.index];
  if (!text) return rows;
  const room = drawing.rooms.find((r) => r.text === selection.index);
  rows.unshift({
    label: t('viewer3d.cadFloorPlan.text', 'Text'),
    value: <span style={{ whiteSpace: 'pre-wrap' }}>{text.s}</span>,
  });
  if (text.en) {
    rows.splice(1, 0, {
      label: t('viewer3d.cadFloorPlan.english', 'English'),
      value: <span style={{ whiteSpace: 'pre-wrap' }}>{text.en}</span>,
    });
  }
  if (room) {
    rows.push({
      label: t('viewer3d.cadFloorPlan.room', 'Room'),
      value: `${room.name ?? '—'} (${room.id})`,
    });
    rows.push({
      label: t('viewer3d.cadFloorPlan.department', 'Department'),
      value: room.department,
    });
    if (room.area_m2 != null) {
      rows.push({
        label: t('viewer3d.cadFloorPlan.area', 'Area'),
        value: `${room.area_m2} m² (${room.size})`,
      });
    }
  }
  rows.push({ label: t('viewer3d.cadFloorPlan.textHeight', 'Text height'), value: len(text.h) });
  return rows;
}

function useHeading(
  drawing: CadDrawing,
  selection: CadSelection,
  group: CadGroup | null,
  english: boolean,
) {
  const t = useViewerTranslate();
  if (!selection || !group) return null;
  const count = group.entities.length + group.texts.length;
  if (group.mode === 'layer') {
    return {
      badge: t('viewer3d.cadFloorPlan.modeLayer', 'Layer'),
      title: layerLabel(drawing.layers[group.layer], english),
      count,
    };
  }
  if (group.mode === 'block') {
    const path = drawing.block_paths[group.block] ?? '';
    return {
      badge: t('viewer3d.cadFloorPlan.modeBlock', 'Block'),
      title: path.split(' › ').pop() ?? path,
      count,
    };
  }
  const title =
    selection.kind === 'entity'
      ? (drawing.entities[selection.index]?.t ?? '')
      : t('viewer3d.cadFloorPlan.text', 'Text');
  return { badge: t('viewer3d.cadFloorPlan.modeObject', 'Object'), title, count: null };
}

export function useCadSelectionDetails(
  drawing: CadDrawing,
  selection: CadSelection,
  group: CadGroup | null,
  english: boolean,
) {
  return {
    rows: useRows(drawing, selection, group, english),
    heading: useHeading(drawing, selection, group, english),
  };
}
