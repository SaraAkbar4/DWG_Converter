export type CadPaperTone = 'light' | 'dark';

export type CadPaper = {
  tone: CadPaperTone;
  background: string;
  ink: string;
  gridMinor: string;
  gridMajor: string;
};

export const CAD_PAPER: Record<CadPaperTone, CadPaper> = {
  light: {
    tone: 'light',
    background: '#f5f7fa',
    ink: '#1c2330',
    gridMinor: 'rgba(52, 84, 132, 0.07)',
    gridMajor: 'rgba(52, 84, 132, 0.14)',
  },
  dark: {
    tone: 'dark',
    background: '#0f141b',
    ink: '#dde4ee',
    gridMinor: 'rgba(150, 180, 220, 0.06)',
    gridMajor: 'rgba(150, 180, 220, 0.13)',
  },
};

export const PRINT_PAPER: CadPaper = {
  tone: 'light',
  background: '#ffffff',
  ink: '#000000',
  gridMinor: 'transparent',
  gridMajor: 'transparent',
};

const LIGHT_PAPER_MAX_LUMINANCE = 0.55;
const DARK_PAPER_MIN_LUMINANCE = 0.18;
const MIX = 0.5;
const cache = new Map<string, string>();

function channels(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function readableInk(color: string, paper: CadPaper): string {
  const key = `${paper.tone}:${color}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const rgb = channels(color);
  let ink = color;
  if (!rgb || color === '#ffffff' || color === '#000000') {
    ink = paper.ink;
  } else {
    const l = luminance(rgb);
    const target = paper.tone === 'light' ? 0 : 255;
    const needsShift =
      paper.tone === 'light' ? l > LIGHT_PAPER_MAX_LUMINANCE : l < DARK_PAPER_MIN_LUMINANCE;
    if (needsShift) {
      const [r, g, b] = rgb.map((c) => Math.round(c + (target - c) * MIX));
      ink = `rgb(${r}, ${g}, ${b})`;
    }
  }
  cache.set(key, ink);
  return ink;
}
