export const LAYOUT_PATTERNS = [
  'hero',
  'title-visual',
  '3-column',
  '2x2',
  'process',
  'architecture',
  'timeline',
  'comparison',
  'chart-insight',
  'kpi-grid',
] as const;

export type LayoutPattern = (typeof LAYOUT_PATTERNS)[number];
