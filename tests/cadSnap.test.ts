import { beforeAll, describe, expect, test } from 'vitest';
import { arcPoints } from '../src/convert/curves';
import { DEFAULT_SNAP_SETTINGS, entityArc, findSnap, lockAngle, type CadSnapKind, type CadSnapSettings } from '../src/cad/cadSnap';
import type { CadScene } from '../src/cad/prepareCadScene';
import type { CadDrawing, CadEntity } from '../src/cad/types';

// prepareCadScene builds Path2D batches for drawing; the snaps never touch them.
beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D ??= class {
    moveTo() {}
    lineTo() {}
    closePath() {}
  };
});

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const flat = (points: Array<[number, number]>) => points.flatMap(([x, y]) => [round3(x), round3(y)]);
const entity = (t: string, p: number[], closed = false): CadEntity => ({ t, p, closed, fill: false, l: 0, c: 0, b: -1 });

async function sceneOf(entities: CadEntity[]): Promise<CadScene> {
  const { prepareCadScene } = await import('../src/cad/prepareCadScene');
  const drawing: CadDrawing = {
    version: 1,
    units: 'mm',
    meters_per_unit: 0.001,
    extents: [-100, -100, 100, 100],
    level: null,
    layers: [{ name: '0', color: '#fff', linetype: 'Continuous', visible: true, count: entities.length }],
    colors: ['#ffffff'],
    block_paths: [],
    entities,
    texts: [],
    rooms: [],
    grids: [],
  };
  return prepareCadScene(drawing);
}

const only = (...kinds: CadSnapKind[]): CadSnapSettings => ({
  enabled: true,
  kinds: Object.fromEntries(Object.keys(DEFAULT_SNAP_SETTINGS.kinds).map((kind) => [kind, kinds.includes(kind as CadSnapKind)])) as CadSnapSettings['kinds'],
});

const options = (settings: CadSnapSettings, from: [number, number] | null = null) => ({
  settings,
  hiddenLayers: new Set<number>(),
  from,
  grid: null,
});

describe('circle and arc recovery', () => {
  test('a circle drawn as segments gives back its centre and radius', () => {
    const arc = entityArc(entity('CIRCLE', flat(arcPoints([10, 20], 15, 0, Math.PI * 2, 0.01)), true));
    expect(arc?.cx).toBeCloseTo(10, 2);
    expect(arc?.cy).toBeCloseTo(20, 2);
    expect(arc?.r).toBeCloseTo(15, 2);
  });

  test('an arc keeps its sweep', () => {
    const arc = entityArc(entity('ARC', flat(arcPoints([0, 0], 10, 0, Math.PI / 2, 0.01))));
    expect(arc?.sweep).toBeCloseTo(Math.PI / 2, 3);
  });

  test('an unevenly scaled circle (an ellipse) is not treated as a circle', () => {
    const points = arcPoints([0, 0], 10, 0, Math.PI * 2, 0.01).map(([x, y]) => [x * 2, y] as [number, number]);
    expect(entityArc(entity('CIRCLE', flat(points), true))).toBeNull();
  });

  test('plain polylines are never fitted', () => {
    expect(entityArc(entity('LWPOLYLINE', [0, 0, 1, 1, 2, 0]))).toBeNull();
  });
});

describe('snaps', () => {
  const lineA = entity('LINE', [-50, 0, 50, 0]);
  const lineB = entity('LINE', [10, -30, 10, 50]);
  const circle = entity('CIRCLE', flat(arcPoints([40, 40], 20, 0, Math.PI * 2, 0.01)), true);

  test('endpoint wins over nearest', async () => {
    const scene = await sceneOf([lineA]);
    expect(findSnap(scene, 49, 1, 3, options(DEFAULT_SNAP_SETTINGS))).toEqual({ point: [50, 0], kind: 'endpoint' });
  });

  test('midpoint of a line', async () => {
    const scene = await sceneOf([lineA]);
    expect(findSnap(scene, 1, 1, 3, options(only('midpoint')))).toEqual({ point: [0, 0], kind: 'midpoint' });
  });

  test('intersection of two lines', async () => {
    const scene = await sceneOf([lineA, lineB]);
    const snap = findSnap(scene, 11, 1, 3, options(DEFAULT_SNAP_SETTINGS));
    expect(snap?.kind).toBe('intersection');
    expect(snap?.point[0]).toBeCloseTo(10);
    expect(snap?.point[1]).toBeCloseTo(0);
  });

  test('centre of a circle', async () => {
    const scene = await sceneOf([circle]);
    const snap = findSnap(scene, 41, 39, 3, options(DEFAULT_SNAP_SETTINGS));
    expect(snap?.kind).toBe('center');
    expect(snap?.point[0]).toBeCloseTo(40, 2);
    expect(snap?.point[1]).toBeCloseTo(40, 2);
  });

  test('nearest lands on the true circle, not a segment chord', async () => {
    const scene = await sceneOf([circle]);
    const angle = 0.123;
    const snap = findSnap(scene, 40 + 20.5 * Math.cos(angle), 40 + 20.5 * Math.sin(angle), 3, options(only('nearest')));
    expect(snap).not.toBeNull();
    expect(Math.hypot(snap!.point[0] - 40, snap!.point[1] - 40)).toBeCloseTo(20, 2);
  });

  test('perpendicular foot from the previous point', async () => {
    const scene = await sceneOf([lineA]);
    const snap = findSnap(scene, 21, 1, 3, options(only('perpendicular'), [20, 30]));
    expect(snap?.kind).toBe('perpendicular');
    expect(snap?.point[0]).toBeCloseTo(20);
    expect(snap?.point[1]).toBeCloseTo(0);
  });

  test('tangent point on a circle from the previous point', async () => {
    const scene = await sceneOf([circle]);
    // From (40, 0) the tangents touch the circle (centre 40,40; r 20) where the angle at the centre is ±60° from straight down.
    const expected: [number, number] = [40 + 20 * Math.cos(-Math.PI / 2 + Math.PI / 3), 40 + 20 * Math.sin(-Math.PI / 2 + Math.PI / 3)];
    const snap = findSnap(scene, expected[0] + 1, expected[1], 3, options(only('tangent'), [40, 0]));
    expect(snap?.kind).toBe('tangent');
    expect(snap?.point[0]).toBeCloseTo(expected[0], 2);
    expect(snap?.point[1]).toBeCloseTo(expected[1], 2);
  });

  test('grid point when nothing else is near', async () => {
    const scene = await sceneOf([]);
    const snap = findSnap(scene, 9, 21, 3, { ...options(only('grid')), grid: { step: 10, origin: [0, 0] } });
    expect(snap).toEqual({ point: [10, 20], kind: 'grid' });
  });

  test('turning snapping off returns nothing', async () => {
    const scene = await sceneOf([lineA]);
    expect(findSnap(scene, 50, 0, 3, options({ ...DEFAULT_SNAP_SETTINGS, enabled: false }))).toBeNull();
  });

  test('hidden layers do not snap', async () => {
    const scene = await sceneOf([lineA]);
    expect(findSnap(scene, 50, 0, 3, { ...options(DEFAULT_SNAP_SETTINGS), hiddenLayers: new Set([0]) })).toBeNull();
  });
});

describe('angle lock', () => {
  test('ortho keeps the line horizontal or vertical', () => {
    expect(lockAngle([0, 0], [10, 2], 90)).toEqual([10, 0]);
    const vertical = lockAngle([0, 0], [1, -10], 90);
    expect(vertical[0]).toBeCloseTo(0);
    expect(vertical[1]).toBeCloseTo(-10);
  });

  test('45° lock slides the point onto the diagonal', () => {
    const [x, y] = lockAngle([0, 0], [10, 8], 45);
    expect(x).toBeCloseTo(9);
    expect(y).toBeCloseTo(9);
  });

  test('no lock leaves the point alone', () => {
    expect(lockAngle([0, 0], [3, 4], 0)).toEqual([3, 4]);
  });
});
