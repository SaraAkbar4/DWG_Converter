import { describe, expect, test } from 'vitest';
import { arrowPanOffset, panView, type CadView } from '../src/cad/cadView';

const view: CadView = { scale: 2, tx: 10, ty: 20 };

describe('arrow pan', () => {
  test('looks in the direction of the arrow', () => {
    expect(arrowPanOffset('ArrowRight', 200, 100)).toEqual({ dx: -15, dy: 0 });
    expect(arrowPanOffset('ArrowLeft', 200, 100)).toEqual({ dx: 15, dy: 0 });
    expect(arrowPanOffset('ArrowUp', 200, 100)).toEqual({ dx: 0, dy: 15 });
    expect(arrowPanOffset('ArrowDown', 200, 100)).toEqual({ dx: 0, dy: -15 });
  });

  test('shift moves a larger step, and other keys do nothing', () => {
    expect(arrowPanOffset('ArrowRight', 200, 100, true)).toEqual({ dx: -40, dy: 0 });
    expect(arrowPanOffset('f', 200, 100)).toBeNull();
    expect(arrowPanOffset('ArrowLeft', 0, 100)).toBeNull();
  });

  test('pan keeps the zoom and shifts the drawing', () => {
    expect(panView(view, 15, -15)).toEqual({ scale: 2, tx: 25, ty: 5 });
  });
});
