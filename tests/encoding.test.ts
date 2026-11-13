import { expect, test } from 'vitest';
import { parseDxf } from '../src/convert/dxf';
import { extractDrawings } from '../src/convert/extract';

/** A minimal DXF holding one TEXT whose content is given as raw bytes in the file's code page. */
const dxfWithText = (codePage: string, text: Buffer) =>
  Buffer.concat([
    Buffer.from(
      `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$DWGCODEPAGE\n3\n${codePage}\n0\nENDSEC\n` +
        '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n' +
        '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nTEXT\n8\n0\n10\n1\n20\n1\n40\n1\n1\n',
    ),
    text,
    Buffer.from('\n0\nENDSEC\n0\nEOF\n'),
  ]);

test.each([
  ['Simplified Chinese (GBK)', 'ANSI_936', Buffer.from([0xbb, 0xe1, 0xd2, 0xe9, 0xca, 0xd2]), '会议室'],
  ['Traditional Chinese (Big5)', 'ANSI_950', Buffer.from([0xb7, 0x7c, 0xc4, 0xb3, 0xab, 0xc7]), '會議室'],
  ['Western (Latin-1)', 'ANSI_1252', Buffer.from([0xe9, 0x74, 0xe9]), 'été'],
  ['Unicode escapes', 'ANSI_1252', Buffer.from('\\U+4F1A\\U+8BAE'), '会议'],
])('decodes %s text', (_name, codePage, bytes, expected) => {
  const file = dxfWithText(codePage, bytes);
  const source = parseDxf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  expect(extractDrawings(source)[0]!.drawing.texts[0]!.s).toBe(expected);
});
