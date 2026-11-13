const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const DRAWING_RE = /\.(dwg|dxf)$/i;

/** The DWG and DXF files inside a zip archive (stored or deflated entries). */
export async function unzipDrawings(archive: File): Promise<File[]> {
  const buffer = await archive.arrayBuffer();
  const view = new DataView(buffer);
  let end = buffer.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
  if (end < 0) return [];

  const files: File[] = [];
  let entry = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0 && view.getUint32(entry, true) === DIRECTORY_ENTRY; i--) {
    const method = view.getUint16(entry + 10, true);
    const size = view.getUint32(entry + 20, true);
    const nameLength = view.getUint16(entry + 28, true);
    const local = view.getUint32(entry + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, entry + 46, nameLength));
    entry += 46 + nameLength + view.getUint16(entry + 30, true) + view.getUint16(entry + 32, true);
    if (!DRAWING_RE.test(name) || name.startsWith('__MACOSX/') || (method !== 0 && method !== 8)) continue;

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const packed = new Blob([buffer.slice(start, start + size)]);
    const data = method === 0 ? packed : await new Response(packed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    files.push(new File([data], name.split('/').pop()!));
  }
  return files;
}
