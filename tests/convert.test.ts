import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { aciHex, rgbHex } from '../src/convert/aci';
import { arcPoints, bulgePoints, splinePoints } from '../src/convert/curves';
import { parseDxf } from '../src/convert/dxf';
import { extractDrawings } from '../src/convert/extract';
import { mtextParagraphAlign, parseRoomTag, plainMText, plainText } from '../src/convert/text';
import { pdfBytes } from './pdfFixture';

const pdfFile = (name: string, payload?: string) => new File([pdfBytes(name, payload)], 'sheet.pdf', { type: 'application/pdf' });

describe('colours', () => {
  test('fixed and computed AutoCAD colour indices', () => {
    expect(aciHex(1)).toBe('#ff0000');
    expect(aciHex(11)).toBe('#ff8080');
    expect(aciHex(14)).toBe('#800000');
    expect(aciHex(150)).toBe('#0080ff');
    expect(aciHex(0)).toBe('#ffffff');
    expect(rgbHex(0xfa0505)).toBe('#fa0505');
  });
});

describe('curves', () => {
  test('a quarter arc starts and ends on its angles', () => {
    const points = arcPoints([0, 0], 10, 0, Math.PI / 2, 0.01);
    expect(points[0]).toEqual([10, 0]);
    expect(points.at(-1)![0]).toBeCloseTo(0);
    expect(points.at(-1)![1]).toBeCloseTo(10);
  });
  test('a bulge of 1 is a half circle between the vertices', () => {
    const middle = bulgePoints([0, 0], [10, 0], 1, 0.01);
    const lowest = Math.min(...middle.map(([, y]) => y));
    expect(lowest).toBeCloseTo(-5, 1);
  });
  test('a clamped spline passes through its end control points', () => {
    const control: Array<[number, number]> = [[0, 0], [1, 2], [3, 2], [4, 0]];
    const points = splinePoints(control, 3, [0, 0, 0, 0, 1, 1, 1, 1]);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([4, 0]);
  });
});

describe('text', () => {
  test('decodes control codes and unicode escapes', () => {
    expect(plainText('%%c50 45%%d \\U+00B1')).toBe('Ø50 45° ±');
  });
  test('strips MTEXT formatting', () => {
    expect(plainMText('{\\fArial|b0;\\H2.5;ROOM}\\P\\pxqc;101')).toBe('ROOM\n101');
    expect(mtextParagraphAlign('\\pxqc;101')).toBe('center');
  });
  test('reads a room tag', () => {
    expect(parseRoomTag('EXAM 1F-OP4-01 15\'-3"x10\'-3"')).toEqual({
      id: '1F-OP4-01',
      name: 'EXAM',
      department: 'OP4',
      size: '15\'-3"x10\'-3"',
      area_m2: 14.52,
    });
    expect(parseRoomTag('LIVING ROOM')).toBeNull();
  });
});

describe('sample drawing', () => {
  test('converts to the viewer format', async () => {
    const file = fs.readFileSync('public/samples/studio-apartment.dxf');
    const [model] = extractDrawings(parseDxf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer));
    const { drawing } = model!;
    expect(model!.name).toBe('Model');
    expect(drawing.units).toBe('mm');
    expect(drawing.meters_per_unit).toBe(0.001);
    expect(drawing.layers.map((layer) => layer.name).sort()).toEqual(['DIMENSIONS', 'DOORS', 'FURNITURE', 'GRID', 'TEXT', 'WALLS', 'WINDOWS']);
    expect(drawing.layers.find((layer) => layer.name === 'DOORS')!.color).toBe('#ff0000');
    expect(drawing.layers.find((layer) => layer.name === 'WINDOWS')!.color).toBe('#0000ff');
    expect(drawing.texts.some((text) => text.s === 'LIVING ROOM' && text.ha === 'center')).toBe(true);
    expect(drawing.grids.map((grid) => grid.label).sort()).toEqual(['1', '2', '3', 'A', 'B', 'C']);
    expect(drawing.entities.filter((entity) => entity.t === 'ARC')).toHaveLength(3);
    const [minX, minY, maxX, maxY] = drawing.extents;
    expect(minX).toBeLessThan(0);
    expect(minY).toBeLessThan(0);
    expect(maxX).toBeGreaterThan(9000);
    expect(maxY).toBeGreaterThan(6000);
  });
});

describe('embedded drawings in a PDF', () => {
  test('returns a DWG stored inside the PDF', async () => {
    const { extractEmbeddedDwgs } = await import('../src/convert/pdfEmbed');
    const [drawing, ...rest] = await extractEmbeddedDwgs(pdfFile('plan.dwg', 'AC1032-drawing'));
    expect(rest).toHaveLength(0);
    expect(drawing!.name).toBe('plan.dwg');
    expect(await drawing!.text()).toBe('AC1032-drawing');
  });
  test('ignores an attachment that is not a DWG', async () => {
    const { extractEmbeddedDwgs } = await import('../src/convert/pdfEmbed');
    expect(await extractEmbeddedDwgs(pdfFile('notes.txt', 'hello'))).toEqual([]);
  });
  test('returns nothing when the PDF has no attachments', async () => {
    const { extractEmbeddedDwgs } = await import('../src/convert/pdfEmbed');
    expect(await extractEmbeddedDwgs(pdfFile('unused'))).toEqual([]);
  });
});

describe('zip archives', () => {
  test('finds and inflates the drawings inside', async () => {
    const { unzipDrawings } = await import('../src/convert/unzip');
    const [drawing, ...rest] = await unzipDrawings(new File([fs.readFileSync('tests/fixtures/drawings.zip')], 'drawings.zip'));
    expect(rest).toHaveLength(0);
    expect(drawing!.name).toBe('studio-apartment.dxf');
    expect(await drawing!.text()).toBe(fs.readFileSync('public/samples/studio-apartment.dxf', 'utf8'));
  });
  test('returns nothing for a file that is not a zip', async () => {
    const { unzipDrawings } = await import('../src/convert/unzip');
    expect(await unzipDrawings(new File(['not a zip archive at all, just text'], 'x.zip'))).toEqual([]);
  });
});

describe('clipping', () => {
  test('a line crossing a window keeps only the part inside', async () => {
    const { clipPolyline } = await import('../src/convert/clip');
    expect(clipPolyline([-5, 5, 15, 5], false, [0, 0, 10, 10])).toEqual([[0, 5, 10, 5]]);
    expect(clipPolyline([-5, 20, 15, 20], false, [0, 0, 10, 10])).toEqual([]);
    expect(clipPolyline([1, 1, 9, 1, 9, 9], false, [0, 0, 10, 10])).toEqual([[1, 1, 9, 1, 9, 9]]);
  });
  test('a polygon is cut to the window', async () => {
    const { clipPolygon } = await import('../src/convert/clip');
    expect(clipPolygon([-5, -5, 5, -5, 5, 5, -5, 5], [0, 0, 10, 10])).toEqual([5, 0, 5, 5, 0, 5, 0, 0]);
    expect(clipPolygon([20, 20, 30, 20, 30, 30], [0, 0, 10, 10])).toEqual([]);
  });
});

const localDwg = 'tests/fixtures/_local-L1.dwg';
describe.skipIf(!fs.existsSync(localDwg))('local real drawing (not in the repository)', () => {
  test('layout tabs show the model through their viewports', async () => {
    const engine = await LibreDwg.create('./node_modules/@mlightcad/libredwg-web/wasm/');
    const file = fs.readFileSync(localDwg);
    const pointer = engine.dwg_read_data(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, Dwg_File_Type.DWG);
    const sheets = extractDrawings(engine.convert(pointer!));
    console.log(sheets.map(({ name, drawing }) => [name, drawing.entities.length, drawing.texts.length, drawing.extents.join(' '), JSON.stringify(drawing.unsupported)]));
    expect(sheets[0]!.name).toBe('Model');
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets[1]!.drawing.entities.length).toBeGreaterThan(1000);
  }, 60000);
});
