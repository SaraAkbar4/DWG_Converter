/** AutoCAD Color Index → hex. Indices 10–249 follow a hue/shade formula; the rest are fixed. */
const FIXED: Record<number, [number, number, number]> = {
  1: [255, 0, 0],
  2: [255, 255, 0],
  3: [0, 255, 0],
  4: [0, 255, 255],
  5: [0, 0, 255],
  6: [255, 0, 255],
  7: [255, 255, 255],
  8: [65, 65, 65],
  9: [128, 128, 128],
  250: [51, 51, 51],
  251: [80, 80, 80],
  252: [105, 105, 105],
  253: [130, 130, 130],
  254: [190, 190, 190],
  255: [255, 255, 255],
};
const SHADES = [1, 0.65, 0.5, 0.3, 0.15];

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export const rgbHex = (rgb: number) => hex((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);

export function aciHex(index: number): string {
  const aci = index > 0 && index < 256 ? index : 7;
  const fixed = FIXED[aci];
  if (fixed) return hex(...fixed);
  const hue = Math.floor((aci - 10) / 10) * 15;
  const shade = SHADES[Math.floor((aci % 10) / 2)]!;
  const tint = aci % 2 ? 0.5 : 0;
  const channel = (offset: number) => {
    const k = (offset + hue / 60) % 6;
    const pure = 1 - Math.max(0, Math.min(k, 4 - k, 1));
    return 255 * shade * (pure + (1 - pure) * tint);
  };
  return hex(channel(5), channel(3), channel(1));
}
