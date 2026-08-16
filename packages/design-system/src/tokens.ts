/**
 * Design tokens — colors, typography, spacing, radii and the §8.1 motion
 * system ("安静、快、精确": quiet, fast, precise).
 */

export const colors = {
  primary: '#1E56A0',
  primaryDark: '#163E75',
  primaryLight: '#E8F0FA',
  accent: '#E8A33D',
  canvas: '#F1F5F9',
  canvasDark: '#E2E8F0',
  slide: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#CBD5E1',
  borderLight: '#E2E8F0',
  danger: '#C0392B',
  success: '#1F9D55',
  warning: '#B98A2F',
  overlay: 'rgba(15, 23, 42, 0.45)',
  selection: 'rgba(30, 86, 160, 0.9)',
  guide: '#F43F5E',
} as const;

export const fonts = {
  ui: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", -apple-system, sans-serif',
  mono: '"SF Mono", "JetBrains Mono", Consolas, monospace',
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

/** §8.1 motion timing — every duration in ms. */
export const motion = {
  hover: 100, // 80–120
  popover: 140, // 120–160
  inspector: 180, // 160–200
  thumbnail: 210, // 180–240
  modal: 200, // 180–220
  morph: 280, // 220–350 (AI layout morph)
  instant: 0, // drag is zero-latency, no easing
} as const;

export const easing = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  spring: { type: 'spring', stiffness: 500, damping: 32 } as const,
};

export const zIndex = {
  canvas: 1,
  overlay: 10,
  guide: 20,
  inspector: 30,
  modal: 40,
  palette: 45,
  toast: 50,
  presenter: 100,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(15,23,42,0.06)',
  md: '0 4px 16px rgba(15,23,42,0.08)',
  lg: '0 12px 32px rgba(15,23,42,0.14)',
  slide: '0 8px 32px rgba(15,23,42,0.16)',
} as const;

/** Tailwind-v4 style theme object for programmatic use. */
export const tokens = { colors, fonts, radius, motion, easing, zIndex, shadows };
