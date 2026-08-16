import type { ChartType } from '@jkinco/scene-schema';
import type { SeriesData } from './types';

/**
 * Deterministic chart-type suggestion (§12).
 *
 * Priority order (with one deliberate deviation): time-like categories are
 * tested *before* the "single series with ≤8 categories → column" heuristic, so
 * that a one-series time series (e.g. ["2026Q1","2026Q2"]) resolves to 'line'
 * rather than 'column'.
 */

const TIME_HINT = /[年月季周Qq]/;
const YEAR_MONTH = /^\d{4}-\d{1,2}$/;
const YEAR_QUARTER = /^\d{4}-Q[1-4]$/i;

function looksLikeTime(category: string): boolean {
  return TIME_HINT.test(category) || YEAR_MONTH.test(category) || YEAR_QUARTER.test(category);
}

function isProportion(series: SeriesData): boolean {
  const values = series.data;
  if (values.length === 0) return false;
  let sum = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (v < 0 || v > 1) return false;
    sum += v;
  }
  return Math.abs(sum - 1) < 0.01;
}

export function suggestChartType(categories: string[], series: SeriesData[]): ChartType {
  const only = series[0];

  if (series.length === 1 && only !== undefined && isProportion(only)) return 'pie';
  if (categories.some(looksLikeTime)) return 'line';
  if (series.length === 1 && categories.length <= 8) return 'column';
  if (series.length >= 2 && categories.length <= 10) return 'line';
  if (categories.length >= 10) return 'bar';
  return 'column';
}
