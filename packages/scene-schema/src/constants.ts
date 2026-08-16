/**
 * Slide logical size (§2.4): 960 × 540 pt — standard 16:9 PowerPoint,
 * maps directly onto OOXML (13.333in × 7.5in at 72dpi).
 */
export const SLIDE_W = 960;
export const SLIDE_H = 540;
export const SLIDE_RATIO = SLIDE_W / SLIDE_H; // 16/9

/** 1 pt = 1/72 inch */
export const PT_PER_INCH = 72;
export const SLIDE_W_IN = SLIDE_W / PT_PER_INCH;
export const SLIDE_H_IN = SLIDE_H / PT_PER_INCH;

/** Default safe margins for content areas (pt). */
export const DEFAULT_MARGIN = 40;
export const SAFE_AREA = {
  left: DEFAULT_MARGIN,
  top: DEFAULT_MARGIN,
  right: SLIDE_W - DEFAULT_MARGIN,
  bottom: SLIDE_H - DEFAULT_MARGIN,
  width: SLIDE_W - DEFAULT_MARGIN * 2,
  height: SLIDE_H - DEFAULT_MARGIN * 2,
} as const;

/** Default snapping grid (pt). */
export const GRID_SIZE = 8;

/** Default content budget — hard constraints from §5.1 (Chinese business mode). */
export const DEFAULT_CONTENT_BUDGET = {
  titleMax: 18,
  subtitleMax: 30,
  bodyTarget: 80,
  bodyHard: 120,
  bulletsDefault: 3,
  bulletsMax: 5,
  bulletChars: 22,
  modulesMax: 4,
  chartsMax: 2,
  emphasisColorsMax: 2,
  bodyMinFont: 18,
  bodyFontRange: [22, 26] as [number, number],
  keyNumberRange: [32, 64] as [number, number],
  titleFontRange: [28, 40] as [number, number],
} as const;

/** Density score bands from §5.2. */
export const DENSITY_BANDS = {
  good: 60,
  warn: 75,
  autoSuggest: 85,
} as const;

/** QA status per slide (§15). */
export const QA_STATUS = ['pending', 'ready', 'issues'] as const;
