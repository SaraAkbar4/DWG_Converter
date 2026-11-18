import { describe, expect, test } from 'vitest';
import { countLayersIn } from '../src/cad/prepareCadScene';
import type { CadDrawing } from '../src/cad/types';

const line = (l: number) => ({ t: 'line', p: [], closed: false, fill: false, l, c: 0, b: 0 });
const text = (l: number, x: number, y: number) => ({ s: 'A', x, y, h: 1, r: 0, ha: 'left', va: 'baseline', l, c: 0, b: 0 }) as const;

const scene = {
  drawing: { entities: [line(0), line(1), line(1)], texts: [text(2, 5, 5), text(3, 50, 50)] } as unknown as CadDrawing,
  entityBounds: [
    [0, 0, 10, 10],
    [8, 8, 20, 20],
    [30, 30, 40, 40],
  ] as [number, number, number, number][],
};

describe('layers in an area', () => {
  test('counts lines that touch the area and texts inside it, per layer', () => {
    expect(Object.fromEntries(countLayersIn(scene, [0, 0, 12, 12]))).toEqual({ 0: 1, 1: 1, 2: 1 });
  });

  test('leaves out layers with nothing in the area', () => {
    expect([...countLayersIn(scene, [100, 100, 200, 200]).keys()]).toEqual([]);
  });
});
