import { useViewerTranslate } from './platform';
import { Descriptions, Empty, Space, Tag, Typography } from 'antd';
import type { CadGroup } from './cadSelectionGroup';
import type { CadDrawing, CadSelection } from './types';
import { useCadSelectionDetails } from './useCadSelectionDetails';

type Props = {
  drawing: CadDrawing;
  selection: CadSelection;
  group: CadGroup | null;
  english: boolean;
};

export function CadPropertiesBody({ drawing, selection, group, english }: Props) {
  const t = useViewerTranslate();
  const { heading, rows } = useCadSelectionDetails(drawing, selection, group, english);
  if (!heading) {
    return (
      <Empty
        style={{ padding: 8 }}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t(
          'viewer3d.cadFloorPlan.propertiesEmpty',
          'Click a line, door, wall or label to see its properties.',
        )}
      />
    );
  }
  return (
    <div>
      <Space size={8} style={{ marginBottom: 12 }}>
        <Tag color="processing" bordered={false} style={{ marginInlineEnd: 0 }}>
          {heading.badge}
        </Tag>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {heading.title}
        </Typography.Title>
      </Space>
      <Descriptions
        size="small"
        column={1}
        colon={false}
        items={rows.map((row, i) => ({ key: i, label: row.label, children: row.value }))}
      />
    </div>
  );
}
