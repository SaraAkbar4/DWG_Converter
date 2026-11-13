import { test } from 'vitest';
import { parseDxf } from '../src/convert/dxf';
import { extractDrawings } from '../src/convert/extract';

/** `BENCH_MB=1,10,50 pnpm vitest run tests/bench.test.ts`: parse and convert synthetic DXF files of those sizes. */
const sizes = (process.env.BENCH_MB ?? '').split(',').filter(Boolean).map(Number);

function syntheticDxf(megabytes: number) {
  const head = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n2\nA\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
  const chunks = [head];
  let bytes = head.length;
  let entities = 0;
  for (let i = 0; bytes < megabytes * 1048576; i++) {
    const x = (i % 2000) * 50;
    const y = Math.floor(i / 2000) * 50;
    const part =
      i % 10 === 9
        ? `0\nTEXT\n8\nA\n10\n${x}\n20\n${y}\n40\n12\n1\nR${i}\n`
        : i % 10 === 8
          ? `0\nCIRCLE\n8\nA\n10\n${x}\n20\n${y}\n40\n20\n`
          : `0\nLINE\n8\nA\n10\n${x}\n20\n${y}\n11\n${x + 40}\n21\n${y + 30}\n`;
    chunks.push(part);
    bytes += part.length;
    entities++;
  }
  chunks.push('0\nENDSEC\n0\nEOF\n');
  return { buffer: Buffer.from(chunks.join('')), entities };
}

test.skipIf(!sizes.length)('benchmark', async () => {
  const mb = (bytes: number) => Math.round(bytes / 1048576);
  for (const size of sizes) {
    const { buffer, entities } = syntheticDxf(size);
    const before = process.memoryUsage().rss;
    let at = performance.now();
    const database = parseDxf(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const parse = performance.now() - at;
    at = performance.now();
    const [sheet] = extractDrawings(database);
    const extract = performance.now() - at;
    const points = sheet!.drawing.entities.reduce((total, entity) => total + entity.p.length / 2, 0);
    console.log(
      `BENCH ${size} MB DXF | ${entities.toLocaleString()} objects | parse ${(parse / 1000).toFixed(1)} s | convert ${(extract / 1000).toFixed(1)} s | memory +${mb(process.memoryUsage().rss - before)} MB | ${points.toLocaleString()} points`,
    );
  }
}, 900_000);
