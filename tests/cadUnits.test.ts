import { describe, expect, test } from 'vitest';
import { metersPerDrawingUnit } from '../src/cad/cadUnits';

describe('scale from a known length', () => {
  test('a segment the visitor calls 5 m sets metres per drawing unit', () => {
    expect(metersPerDrawingUnit(100, 5, 'm')).toBeCloseTo(0.05);
  });

  test('millimetres and feet convert before dividing by the drawing length', () => {
    expect(metersPerDrawingUnit(1000, 1000, 'mm')).toBeCloseTo(0.001);
    expect(metersPerDrawingUnit(72, 1, 'ft')).toBeCloseTo(0.3048 / 72);
  });

  test('a zero or blank length cannot set a scale', () => {
    expect(metersPerDrawingUnit(0, 5, 'm')).toBeNull();
    expect(metersPerDrawingUnit(100, 0, 'm')).toBeNull();
    expect(metersPerDrawingUnit(100, Number(''), 'm')).toBeNull();
  });
});
