import type { ChartElement, ChartSeries, Theme } from '@jkinco/scene-schema';
import { textToPlain } from '@jkinco/scene-schema';

/**
 * Build a complete, DOM-free ECharts option object (plain JSON) for a chart
 * element. The output never contains `undefined`, `NaN` or functions, so it is
 * safe to `JSON.stringify`/`JSON.parse` losslessly.
 */

function seriesColor(series: ChartSeries, index: number, palette: string[]): string {
  return series.color ?? palette[index % palette.length] ?? '#1E56A0';
}

function isFiniteNum(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface LegendConfig {
  show: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

function legendOption(legend: LegendConfig | undefined): Record<string, unknown> {
  if (!legend?.show) return { show: false };
  const out: Record<string, unknown> = { show: true };
  switch (legend.position ?? 'top') {
    case 'bottom':
      out.bottom = 10;
      break;
    case 'left':
      out.left = 10;
      out.orient = 'vertical';
      break;
    case 'right':
      out.right = 10;
      out.orient = 'vertical';
      break;
    default:
      out.top = 10;
      break;
  }
  return out;
}

/** Index of the highlighted category, or -1 when there is no match. */
function highlightIndex(chart: ChartElement): number {
  const hi = chart.story?.highlight;
  if (hi === undefined || hi === null || hi === '') return -1;
  return chart.categories.indexOf(hi);
}

function buildCartesian(
  chart: ChartElement,
  palette: string[],
  axisShow: boolean,
  unit: string,
  seriesType: 'bar' | 'line',
): Record<string, unknown> {
  const xAxis: Record<string, unknown> = { type: 'category', data: chart.categories, show: axisShow };
  const yAxis: Record<string, unknown> = { type: 'value', show: axisShow };
  if (unit) yAxis.name = unit;

  const hiIdx = highlightIndex(chart);
  const message = chart.story?.message;
  const highlight = chart.story?.highlight;

  const series = chart.series.map((s, i) => {
    const item: Record<string, unknown> = {
      type: seriesType,
      name: s.name,
      data: s.data,
      color: seriesColor(s, i, palette),
    };
    if (seriesType === 'line' && chart.chartType === 'area') {
      item.areaStyle = { opacity: 0.25 };
    }
    if (i === 0 && hiIdx >= 0) {
      const value = s.data[hiIdx] ?? null;
      item.markPoint = {
        symbolSize: 48,
        data: [{ coord: [hiIdx, value], name: highlight, value }],
        label: { formatter: message ?? '{b}', color: '#ffffff' },
      };
    }
    return item;
  });

  return { xAxis, yAxis, series };
}

function buildPie(chart: ChartElement, palette: string[]): Record<string, unknown> {
  const first = chart.series[0];
  const radius = chart.chartType === 'doughnut' ? ['45%', '70%'] : ['0%', '70%'];
  const hi = chart.story?.highlight;

  const data = chart.categories.map((cat, i) => {
    const item: Record<string, unknown> = { name: cat, value: first?.data[i] ?? null };
    if (hi !== undefined && hi !== null && hi !== '' && cat === hi) {
      item.itemStyle = { borderColor: '#0F172A', borderWidth: 4 };
      item.emphasis = { itemStyle: { borderWidth: 4, shadowBlur: 8 } };
    }
    return item;
  });

  return {
    series: [{ type: 'pie', radius, data, color: chart.series.map((s, i) => seriesColor(s, i, palette)) }],
  };
}

function buildRadar(chart: ChartElement, palette: string[]): Record<string, unknown> {
  const allValues = chart.series.flatMap((s) => s.data).filter(isFiniteNum);
  const max = Math.max(...allValues, 1);
  const indicator = chart.categories.map((name) => ({ name, max }));
  const series = chart.series.map((s, i) => ({
    type: 'radar',
    name: s.name,
    color: seriesColor(s, i, palette),
    data: [{ value: s.data, name: s.name }],
  }));
  return { radar: { indicator }, series };
}

function buildScatter(chart: ChartElement, palette: string[], axisShow: boolean): Record<string, unknown> {
  const xs = chart.series[0]?.data ?? [];
  const ys = chart.series[1]?.data ?? xs;
  const data = xs.map((x, i) => [x, ys[i] ?? null]);
  return {
    xAxis: { type: 'value', show: axisShow },
    yAxis: { type: 'value', show: axisShow },
    series: [{ type: 'scatter', data, color: chart.series[0] ? seriesColor(chart.series[0], 0, palette) : palette[0] ?? '#1E56A0' }],
  };
}

function buildFunnel(chart: ChartElement, palette: string[]): Record<string, unknown> {
  const first = chart.series[0];
  const data = chart.categories.map((name, i) => ({ name, value: first?.data[i] ?? null }));
  return {
    series: [{ type: 'funnel', sort: 'descending', data, color: chart.series.map((s, i) => seriesColor(s, i, palette)) }],
  };
}

export function buildEChartsOption(chart: ChartElement, theme: Theme): Record<string, unknown> {
  const palette = theme.chart.palette;
  const textColor = theme.chart.textColor;
  const axisShow = chart.axis?.show !== false;
  const unit = chart.unit ?? '';
  const titleText = textToPlain(chart.title);

  const option: Record<string, unknown> = {};

  if (titleText) {
    option.title = { text: titleText, textStyle: { color: textColor } };
  }

  option.legend = legendOption(chart.legend);

  switch (chart.chartType) {
    case 'column':
    case 'bar':
      Object.assign(option, buildCartesian(chart, palette, axisShow, unit, 'bar'));
      break;
    case 'line':
    case 'area':
      Object.assign(option, buildCartesian(chart, palette, axisShow, unit, 'line'));
      break;
    case 'pie':
    case 'doughnut':
      Object.assign(option, buildPie(chart, palette));
      break;
    case 'radar':
      Object.assign(option, buildRadar(chart, palette));
      break;
    case 'scatter':
      Object.assign(option, buildScatter(chart, palette, axisShow));
      break;
    case 'funnel':
      Object.assign(option, buildFunnel(chart, palette));
      break;
    default:
      Object.assign(option, buildCartesian(chart, palette, axisShow, unit, 'bar'));
      break;
  }

  return option;
}
