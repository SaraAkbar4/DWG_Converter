import { describe, expect, test } from 'vitest';
import { angleAt, formatAngle, measureLabel, measureReadout, type CadPoint } from '../src/cad/cadMeasure';

const mm = { meters_per_unit: 0.001, units: 'mm' };

/** The point `length` away from `from` at `degrees` (counter-clockwise from +x). */
const polar = (from: CadPoint, degrees: number, length: number): CadPoint => [
  from[0] + Math.cos((degrees * Math.PI) / 180) * length,
  from[1] + Math.sin((degrees * Math.PI) / 180) * length,
];

describe('angle measurement', () => {
  test('a square corner is 90° whichever way it faces', () => {
    const b: CadPoint = [0, 0];
    expect(angleAt([10, 0], b, [0, 10])).toBeCloseTo(90, 10);
    expect(angleAt([0, 10], b, [-10, 0])).toBeCloseTo(90, 10);
    expect(angleAt([-10, 0], b, [0, -10])).toBeCloseTo(90, 10);
    expect(angleAt([0, -10], b, [10, 0])).toBeCloseTo(90, 10);
  });

  test('is the same whichever arm is clicked first', () => {
    const b: CadPoint = [3, 4];
    const a = polar(b, 20, 50);
    const c = polar(b, 135, 7);
    expect(angleAt(a, b, c)).toBeCloseTo(115, 9);
    expect(angleAt(c, b, a)).toBeCloseTo(115, 9);
  });

  test('reports the angle between the arms, never the reflex one', () => {
    const b: CadPoint = [0, 0];
    // Arms at 350° and 10° meet at 20°, not 340°.
    expect(angleAt(polar(b, 350, 5), b, polar(b, 10, 5))).toBeCloseTo(20, 9);
    // Arms at 100° and 300° span 160° the short way.
    expect(angleAt(polar(b, 100, 5), b, polar(b, 300, 5))).toBeCloseTo(160, 9);
  });

  test.each([1e-6, 1, 1000, 1e6])('does not depend on the drawing scale (arms of %d units)', (size) => {
    const b: CadPoint = [size * 3, -size * 2];
    expect(angleAt(polar(b, 15, size), b, polar(b, 75, size * 4))).toBeCloseTo(60, 7);
  });

  test('stays exact far from the origin, as in site plans in map coordinates', () => {
    const b: CadPoint = [512_345.678, 6_789_012.345];
    expect(angleAt(polar(b, 0, 2), b, polar(b, 45, 3))).toBeCloseTo(45, 5);
  });

  test('keeps its precision near 0° and 180°', () => {
    const b: CadPoint = [0, 0];
    expect(angleAt(polar(b, 0, 1000), b, polar(b, 0.001, 1000))).toBeCloseTo(0.001, 9);
    expect(angleAt(polar(b, 0, 1000), b, polar(b, 179.999, 1000))).toBeCloseTo(179.999, 9);
    expect(angleAt([5, 0], b, [-5, 0])).toBe(180);
    expect(angleAt([5, 0], b, [9, 0])).toBe(0);
  });

  test('has no angle when an arm has no length', () => {
    expect(angleAt([0, 0], [0, 0], [5, 5])).toBeNull();
    expect(angleAt([5, 5], [0, 0], [0, 0])).toBeNull();
    expect(measureLabel({ mode: 'angle', points: [[1, 1], [1, 1], [4, 9]] }, mm)).toBeNull();
    expect(measureReadout({ mode: 'angle', points: [[1, 1], [1, 1], [4, 9]] }, mm)).toBeNull();
  });

  test('needs all three points', () => {
    expect(measureLabel({ mode: 'angle', points: [[0, 0], [1, 0]] }, mm)).toBeNull();
  });

  test('labels round to one decimal without -0.0 or 179.99…', () => {
    expect(formatAngle(89.96)).toBe('90.0°');
    expect(formatAngle(179.9999)).toBe('180.0°');
    expect(formatAngle(-0.00001)).toBe('0.0°');
    expect(measureLabel({ mode: 'angle', points: [[10, 0], [0, 0], [0, 10]] }, mm)).toBe('90.0°');
    expect(measureReadout({ mode: 'angle', points: [[10, 0], [0, 0], polar([0, 0], 30, 4)] }, mm)?.title).toBe('Angle 30.0°');
  });
});
