import { deepClone, type Theme } from '@jkinco/scene-schema';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Multiply each channel by (1 - amount) to darken. */
function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = 1 - amount;
  return toHex(rgb.r * f, rgb.g * f, rgb.b * f);
}

/** Mix the color toward white by `amount` (0..1). */
function tint(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (c: number) => c * (1 - amount) + 255 * amount;
  return toHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
}

export type ThemeVariant = 'executive' | 'visual' | 'technical';

/**
 * §28 A/B/C variants — deterministic, pure functions returning NEW theme
 * objects (deep clone + patch); mutating the result never affects the base.
 */
export function variantTheme(base: Theme, kind: ThemeVariant): Theme {
  const t = deepClone(base);

  switch (kind) {
    case 'executive': {
      t.id = `${base.id}--executive`;
      t.name = `${base.name} · Executive`;
      t.kind = 'executive';
      t.colors.primary = darken(base.colors.primary, 0.12);
      t.colors.accent = '#B98A2F';
      t.cover.titleFontSize = base.cover.titleFontSize + 8;
      break;
    }
    case 'visual': {
      t.id = `${base.id}--visual`;
      t.name = `${base.name} · Visual`;
      t.colors.accent = base.colors.chartPalette[2] ?? base.colors.accent;
      t.colors.background = tint(base.colors.primary, 0.9);
      t.radius = base.radius + 4;
      break;
    }
    case 'technical': {
      t.id = `${base.id}--technical`;
      t.name = `${base.name} · Technical`;
      t.kind = 'technical';
      t.colors.secondary = '#334155';
      t.radius = base.radius - 4;
      t.borderWidth = base.borderWidth + 0.5;
      break;
    }
  }

  return t;
}
