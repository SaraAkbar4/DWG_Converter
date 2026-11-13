/**
 * The parts of a parsed drawing the converter reads. LibreDWG's database (DWG) and
 * `parseDxf` (DXF) both provide this shape, so one converter serves both formats.
 */
export type SourceEntity = { type: string };
type SourcePoint = { x: number; y: number };

export type DrawingSource = {
  header: { INSUNITS?: number; EXTMIN?: SourcePoint; EXTMAX?: SourcePoint };
  tables: {
    LAYER: {
      entries: Array<{ name: string; colorIndex: number; trueColor?: number; lineType: string; off: boolean; frozen: boolean }>;
    };
    BLOCK_RECORD: { entries: Array<{ name: string; handle: string; basePoint: SourcePoint; entities: SourceEntity[] }> };
  };
  objects: { LAYOUT: Array<{ layoutName: string; paperSpaceTableId: string }> };
};
