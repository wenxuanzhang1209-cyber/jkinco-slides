import type { SeriesData } from './types';

function isFiniteNum(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 10) / 10);
}

function looksLikeProportion(data: Array<number | null>): boolean {
  if (data.length === 0) return false;
  let sum = 0;
  for (const v of data) {
    if (!isFiniteNum(v)) return false;
    if (v < 0 || v > 1) return false;
    sum += v;
  }
  return Math.abs(sum - 1) < 0.01;
}

export function autoChartTitle(
  _categories: string[],
  series: SeriesData[],
  unit?: string,
): string {
  if (series.length === 0) return '';
  const names = series.map((s) => s.name).filter((n) => n.length > 0);

  let title: string;
  if (series.length === 1) {
    const only = series[0]!;
    title = looksLikeProportion(only.data) ? `${only.name}占比` : `${only.name}变化趋势`;
  } else if (names.length === 0) {
    title = '数据对比';
  } else {
    title = `${names.join('、')}对比`;
  }

  return unit ? `${title}（${unit}）` : title;
}

export function autoInsight(
  categories: string[],
  series: SeriesData[],
): { highlight: string; message: string } | null {
  if (categories.length === 0 || series.length === 0) return null;

  const data = series[0]!.data;

  // Gather the finite values (in order) for trend analysis.
  const finite: number[] = [];
  for (const v of data) if (isFiniteNum(v)) finite.push(v);
  if (finite.length === 0) return null;

  // Growth of the latest value vs the previous one (line-like trend data).
  if (finite.length >= 2) {
    const latest = finite[finite.length - 1]!;
    const previous = finite[finite.length - 2]!;
    if (previous > 0 && latest >= previous) {
      const growth = ((latest - previous) / previous) * 100;
      const highlight = categories[categories.length - 1] ?? '';
      return { highlight, message: `同比增长${fmt(growth)}%` };
    }
  }

  // Fall back to "highest value" detection.
  let maxIndex = 0;
  let maxValue = -Infinity;
  data.forEach((v, i) => {
    if (isFiniteNum(v) && v > maxValue) {
      maxValue = v;
      maxIndex = i;
    }
  });
  const highlight = categories[maxIndex] ?? String(maxIndex + 1);
  return { highlight, message: `最高为${highlight}（${fmt(maxValue)}）` };
}
