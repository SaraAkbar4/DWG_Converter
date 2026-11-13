export type CadLayer = {
  name: string;
  en?: string;
  color: string;
  linetype: string;
  visible: boolean;
  count: number;
};

export type CadEntity = {
  t: string;
  p: number[];
  closed: boolean;
  fill: boolean;
  l: number;
  c: number;
  b: number;
};

export type CadText = {
  s: string;
  en?: string;
  x: number;
  y: number;
  h: number;
  r: number;
  ha: 'left' | 'center' | 'right';
  va: 'top' | 'middle' | 'bottom' | 'baseline';
  l: number;
  c: number;
  b: number;
};

export type CadRoom = {
  id: string;
  name: string | null;
  department: string;
  size: string | null;
  area_m2: number | null;
  x: number;
  y: number;
  text: number;
};

export type CadGridLabel = { label: string; x: number; y: number };

export type CadDrawing = {
  version: number;
  units: string;
  meters_per_unit: number | null;
  extents: [number, number, number, number];
  level: string | null;
  layers: CadLayer[];
  colors: string[];
  block_paths: string[];
  entities: CadEntity[];
  texts: CadText[];
  rooms: CadRoom[];
  grids: CadGridLabel[];
  unsupported?: Record<string, number>;
};

export type CadSelection =
  | { kind: 'entity'; index: number }
  | { kind: 'text'; index: number }
  | null;

export type CadColorMode = 'mono' | 'layer';

export type CadLook = 'drawing' | 'print' | 'image';

export type CadStyle = {
  look: CadLook;
  colorMode: CadColorMode;
  paper: 'auto' | 'light' | 'dark';
  grid: boolean;
  english: boolean;
};

export type CadPanel = 'layers' | 'find' | 'appearance' | 'properties' | null;
