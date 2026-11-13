import type { CadRoom } from '../cad/types';

const ROOM_ID_RE = /\b\d?[A-Z]{1,3}-[A-Z0-9]{1,6}-\d{1,3}\b/;
const FEET_INCHES = String.raw`\d+'(?:-?\s?\d+(?:\.\d+)?")?`;
const ROOM_SIZE_RE = new RegExp(`(${FEET_INCHES})\\s*[xX×]\\s*(${FEET_INCHES})`);
const PARAGRAPH_ALIGN_RE = /\\p[^;]*?q([lcr])/;
const SQUARE_FEET_TO_M2 = 0.09290304;
const SPECIAL: Record<string, string> = { c: 'Ø', d: '°', p: '±', u: '', o: '', k: '', '%': '%' };

const decodeUnicode = (text: string) =>
  text.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));

/** TEXT / ATTRIB content with `%%c`-style control codes decoded. */
export const plainText = (text: string) =>
  decodeUnicode(text)
    .replace(/%%(\d{3})/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/%%([cdpuok%])/gi, (_, code: string) => SPECIAL[code.toLowerCase()] ?? '');

/** MTEXT content with inline formatting codes removed. */
export const plainMText = (text: string) =>
  plainText(text)
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\S([^;]*);/g, (_, stack: string) => stack.replace(/[#^]/g, '/'))
    .replace(/\\[ACcFfHhQTWp][^;\\]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/(?<!\\)[{}]/g, '')
    .replace(/\\([\\{}])/g, '$1');

export function mtextParagraphAlign(text: string): 'left' | 'center' | 'right' | null {
  const match = PARAGRAPH_ALIGN_RE.exec(text);
  return match ? ({ l: 'left', c: 'center', r: 'right' } as const)[match[1] as 'l' | 'c' | 'r'] : null;
}

function feet(value: string) {
  const [whole, inches = ''] = value.split("'");
  return Number(whole) + (Number(inches.replace(/[-" ]/g, '')) || 0) / 12;
}

/** `EXAM 1F-OP4-01 15'-3"x10'-3"` → name, id, size and area in m². */
export function parseRoomTag(text: string): Omit<CadRoom, 'x' | 'y' | 'text'> | null {
  const flat = text.split(/\s+/).join(' ');
  const match = ROOM_ID_RE.exec(flat);
  if (!match) return null;
  const id = match[0];
  const size = ROOM_SIZE_RE.exec(flat.slice(match.index + id.length));
  return {
    id,
    name: flat.slice(0, match.index).replace(/^[ .:-]+|[ .:-]+$/g, '') || null,
    department: id.split('-')[1]!,
    size: size ? size[0] : null,
    area_m2: size ? Math.round(feet(size[1]!) * feet(size[2]!) * SQUARE_FEET_TO_M2 * 100) / 100 : null,
  };
}
