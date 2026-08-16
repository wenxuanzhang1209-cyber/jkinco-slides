import { describe, expect, it } from 'vitest';
import { createChart, getTheme, DEFAULT_THEME_ID } from '@jkinco/scene-schema';
import type { ChartElement, ChartSeries, Theme } from '@jkinco/scene-schema';
import {
  buildEChartsOption,
  suggestChartType,
  chartFromDataset,
  autoInsight,
  autoChartTitle,
  validateChart,
} from './index';

const theme: Theme = getTheme(DEFAULT_THEME_ID);

interface MakeOpts {
  story?: ChartElement['story'];
  unit?: string;
  title?: string;
  legend?: ChartElement['legend'];
  axis?: ChartElement['axis'];
}

function make(
  chartType: ChartElement['chartType'],
  categories: string[],
  series: ChartSeries[],
  opts: MakeOpts = {},
): ChartElement {
  return createChart(chartType, 0, 0, 400, 300, categories, series, opts);
}

describe('buildEChartsOption', () => {
  it('builds a column chart with category axis, bar series and hidden legend', () => {
    const chart = make('column', ['A', 'B', 'C'], [{ name: '销量', data: [10, 20, 30] }]);
    const opt = buildEChartsOption(chart, theme) as Record<string, any>;
    expect(opt.xAxis.type).toBe('category');
    expect(opt.xAxis.data).toEqual(['A', 'B', 'C']);
    expect(opt.series[0].type).toBe('bar');
    expect(opt.legend.show).toBe(false);
  });

  it('uses different radii for pie and doughnut', () => {
    const pie = buildEChartsOption(make('pie', ['A', 'B'], [{ name: 'x', data: [1, 2] }]), theme) as Record<string, any>;
    const doughnut = buildEChartsOption(make('doughnut', ['A', 'B'], [{ name: 'x', data: [1, 2] }]), theme) as Record<string, any>;
    expect(pie.series[0].type).toBe('pie');
    expect(pie.series[0].radius).toEqual(['0%', '70%']);
    expect(doughnut.series[0].radius).toEqual(['45%', '70%']);
    expect(pie.series[0].radius).not.toEqual(doughnut.series[0].radius);
  });

  it('renders line without areaStyle and area with areaStyle', () => {
    const line = buildEChartsOption(make('line', ['A', 'B'], [{ name: 'x', data: [1, 2] }]), theme) as Record<string, any>;
    const area = buildEChartsOption(make('area', ['A', 'B'], [{ name: 'x', data: [1, 2] }]), theme) as Record<string, any>;
    expect(line.series[0].type).toBe('line');
    expect(line.series[0].areaStyle).toBeUndefined();
    expect(area.series[0].areaStyle).toBeDefined();
  });

  it('adds a markPoint for a story highlight and emphasis for pie', () => {
    const column = make('column', ['Q1', 'Q2', 'Q3'], [{ name: '销量', data: [10, 20, 30] }], {
      story: { highlight: 'Q2', message: '同比增长100%' },
    });
    const colJson = JSON.stringify(buildEChartsOption(column, theme));
    expect(colJson).toContain('markPoint');
    expect(colJson).toContain('Q2');
    expect(colJson).toContain('同比增长100%');

    const pie = make('pie', ['A', 'B', 'C'], [{ name: 'x', data: [1, 2, 3] }], {
      story: { highlight: 'B', message: '最高' },
    });
    const pieJson = JSON.stringify(buildEChartsOption(pie, theme));
    expect(pieJson).toContain('emphasis');
    expect(pieJson).toContain('B');
  });
});

describe('suggestChartType', () => {
  it('picks pie, line, bar and column deterministically', () => {
    expect(suggestChartType(['A', 'B', 'C'], [{ name: 'x', data: [0.3, 0.4, 0.3] }])).toBe('pie');
    expect(suggestChartType(['2026Q1', '2026Q2'], [{ name: 'x', data: [10, 20] }])).toBe('line');
    const twelve = Array.from({ length: 12 }, (_, i) => `C${i + 1}`);
    expect(suggestChartType(twelve, [{ name: 'x', data: twelve.map(() => 1) }])).toBe('bar');
    expect(suggestChartType(['A', 'B'], [{ name: 'x', data: [1, 2] }])).toBe('column');
  });
});

describe('chartFromDataset', () => {
  it('maps a string column to categories and numeric columns to series', () => {
    const { categories, series } = chartFromDataset({
      id: 'd1',
      name: 'sales',
      columns: ['城市', '销售额', '利润'],
      rows: [
        ['北京', 100, 30],
        ['上海', 200, 50],
      ],
    });
    expect(categories).toEqual(['北京', '上海']);
    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({ name: '销售额', data: [100, 200] });
    expect(series[1]).toEqual({ name: '利润', data: [30, 50] });
  });
});

describe('autoChartTitle / autoInsight', () => {
  it('builds a title from a single series', () => {
    expect(autoChartTitle(['A', 'B'], [{ name: '销量', data: [10, 20] }])).toBe('销量变化趋势');
    expect(autoChartTitle(['A', 'B', 'C'], [{ name: '份额', data: [0.3, 0.4, 0.3] }])).toBe('份额占比');
  });

  it('detects the max category', () => {
    const insight = autoInsight(['A', 'B', 'C'], [{ name: 'x', data: [10, 30, 20] }]);
    expect(insight).not.toBeNull();
    expect(insight!.highlight).toBe('B');
    expect(insight!.message).toContain('最高为B');
  });

  it('reports growth for increasing line data', () => {
    const insight = autoInsight(['2023', '2024'], [{ name: 'x', data: [100, 150] }]);
    expect(insight).not.toBeNull();
    expect(insight!.message).toContain('同比增长50%');
  });

  it('returns null when there is no data', () => {
    expect(autoInsight([], [{ name: 'x', data: [] }])).toBeNull();
  });
});

describe('validateChart', () => {
  it('errors on empty series and mismatched lengths', () => {
    expect(validateChart(make('column', ['A', 'B'], [])).length).toBeGreaterThan(0);
    expect(validateChart(make('line', ['A', 'B', 'C'], [{ name: 'x', data: [1, 2] }])).length).toBeGreaterThan(0);
    expect(validateChart(make('column', ['A', 'B'], [{ name: 'x', data: [1, 2] }]))).toEqual([]);
  });
});

describe('JSON-serializability', () => {
  it('every option survives a JSON round-trip losslessly', () => {
    const samples: ChartElement[] = [
      make('column', ['A', 'B', 'C'], [{ name: '销量', data: [10, 20, 30] }], { story: { highlight: 'B', message: 'msg' }, unit: '亿元', title: '销量' }),
      make('pie', ['A', 'B'], [{ name: 'x', data: [1, 2] }]),
      make('doughnut', ['A', 'B'], [{ name: 'x', data: [3, 4] }]),
      make('area', ['A', 'B'], [{ name: 'x', data: [1, 2] }]),
      make('radar', ['A', 'B', 'C'], [{ name: 'x', data: [1, 2, 3] }]),
      make('scatter', ['A', 'B', 'C'], [{ name: 'x', data: [1, 2, 3] }, { name: 'y', data: [4, 5, 6] }]),
      make('funnel', ['A', 'B', 'C'], [{ name: 'x', data: [1, 2, 3] }]),
    ];
    for (const sample of samples) {
      const opt = buildEChartsOption(sample, theme);
      expect(JSON.parse(JSON.stringify(opt))).toEqual(opt);
    }
  });
});
