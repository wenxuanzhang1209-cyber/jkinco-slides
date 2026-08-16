import type { ChartElement } from '@jkinco/scene-schema';

const THREE_D_TYPES = new Set([
  'bar3d',
  'line3d',
  'pie3d',
  'scatter3d',
  'surface',
  'bar3D',
  'line3D',
  'pie3D',
  'scatter3D',
]);

function isFiniteNum(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate a chart element and return a list of human-readable problem strings
 * (errors and warnings). An empty array means the chart is valid.
 */
export function validateChart(chart: ChartElement): string[] {
  const problems: string[] = [];
  const type = chart.chartType;

  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    problems.push('图表至少需要一个数据系列');
  }

  if (THREE_D_TYPES.has(type)) {
    problems.push(`不支持 3D 图表类型: ${type}`);
  }

  const categoryLength = chart.categories.length;

  for (const s of chart.series) {
    const isPieLike = type === 'pie' || type === 'doughnut';

    if (!isPieLike && s.data.length !== categoryLength) {
      problems.push(`系列 "${s.name}" 数据长度 (${s.data.length}) 与 categories 长度 (${categoryLength}) 不一致`);
    }

    let hasInvalid = false;
    for (const v of s.data) {
      if (v !== null && !isFiniteNum(v)) hasInvalid = true;
    }
    if (hasInvalid) {
      problems.push(`系列 "${s.name}" 包含非法数值（仅允许有限数字或 null）`);
    }

    const nonNull = s.data.filter(isFiniteNum);
    if (nonNull.length > 0 && nonNull.every((v) => v === 0)) {
      problems.push(`警告: 系列 "${s.name}" 全部为零`);
    }
  }

  if (isPieLikeCheck(type) && categoryLength > 8) {
    problems.push(`警告: 饼图切片超过 8 个（${categoryLength}），建议合并`);
  }

  return problems;
}

function isPieLikeCheck(type: string): boolean {
  return type === 'pie' || type === 'doughnut';
}
