import type { Slide, ContentBudget } from '@jkinco/scene-schema';
import { DENSITY_BANDS, SLIDE_H, SLIDE_W, defaultBudget, textLength, textToPlain } from '@jkinco/scene-schema';
import type { ContentBlocks } from './content';

export interface DensityComponents {
  textLoad: number;
  elementCount: number;
  areaFill: number;
  readingTime: number;
  hierarchyDepth: number;
}

export interface DensityReport {
  score: number;
  band: 'good' | 'warn' | 'auto_suggest' | 'blocked';
  components: DensityComponents;
}

type AnyElement = Slide['elements'][number];

/** Plain text carried by an element (text, shape label, chart title, connector label, table cells). */
function elementPlain(el: AnyElement): string {
  switch (el.type) {
    case 'text':
      return textToPlain(el.text);
    case 'shape':
      return el.text ? textToPlain(el.text) : '';
    case 'chart':
      return el.title ? textToPlain(el.title) : '';
    case 'connector':
      return el.label ? textToPlain(el.label) : '';
    case 'table':
      return el.cells.map((row) => row.map((c) => textToPlain(c.text)).join(' ')).join(' ');
    default:
      return '';
  }
}

/** Titles are weighted down because they carry a lot of width for few content units. */
function textWeight(el: AnyElement): number {
  if (el.role === 'title' || el.role === 'chart_title') return 0.5;
  return 1;
}

/**
 * §5.2 Content Density Score (0–100).
 * Lower is better (sparser). Components sum to at most 100:
 *   textLoad 50 + elementCount 20 + areaFill 20 + readingTime 10 + hierarchyDepth 10.
 */
export function computeDensity(slide: Slide): DensityReport {
  const n = slide.elements.length;
  let totalTextLen = 0;
  let areaSum = 0;
  const roles = new Set<string>();
  for (const el of slide.elements) {
    totalTextLen += textLength(elementPlain(el)) * textWeight(el);
    areaSum += el.w * el.h;
    if (el.role) roles.add(el.role);
  }

  const textLoad = Math.min(50, (totalTextLen / 120) * 50);
  const elementCount = n <= 2 ? 0 : Math.min(20, ((n - 2) / 12) * 20);
  const areaFill = Math.min(20, (areaSum / (SLIDE_W * SLIDE_H)) * 20);
  const seconds = totalTextLen / 6;
  const readingTime = Math.min(10, (seconds / 18) * 10);
  const hierarchyDepth = Math.max(0, Math.min(10, (roles.size - 1) * 2.5));

  const raw = textLoad + elementCount + areaFill + readingTime + hierarchyDepth;
  const score = Math.round(raw * 10) / 10;
  const band =
    score <= DENSITY_BANDS.good
      ? 'good'
      : score <= DENSITY_BANDS.warn
        ? 'warn'
        : score <= DENSITY_BANDS.autoSuggest
          ? 'auto_suggest'
          : 'blocked';

  return { score, band, components: { textLoad, elementCount, areaFill, readingTime, hierarchyDepth } };
}

export function checkDensityGate(
  slide: Slide,
  limit: number = DENSITY_BANDS.autoSuggest,
): { passed: boolean; score: number; band: DensityReport['band']; reason?: string } {
  const report = computeDensity(slide);
  const passed = report.score <= limit;
  return {
    passed,
    score: report.score,
    band: report.band,
    ...(passed ? {} : { reason: `内容密度 ${report.score} 超过上限 ${limit}` }),
  };
}

/** Truncate at sentence boundaries; fall back to a hard cut when no boundary fits. */
function truncateAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const sentences = s.split(/(?<=[。；;！？!?])/);
  let out = '';
  for (const seg of sentences) {
    if ((out + seg).length <= max) out += seg;
    else break;
  }
  if (out.length === 0) out = s.slice(0, max);
  return out.replace(/[，、；;:：]$/, '');
}

/**
 * §5.1 hard content-budget enforcement. Returns `ok:false` with one violation
 * per breached rule and `adjusted` holding the trimmed blocks.
 */
export function enforceContentBudget(
  blocks: ContentBlocks,
  budget?: ContentBudget,
): { ok: boolean; violations: Array<{ rule: string; message: string }>; adjusted: ContentBlocks } {
  const b = budget ?? defaultBudget();
  const violations: Array<{ rule: string; message: string }> = [];
  const adjusted: ContentBlocks = { ...blocks };

  if (blocks.title !== undefined && blocks.title.length > b.titleMax) {
    violations.push({ rule: 'title', message: '标题过长' });
    adjusted.title = truncateAtSentence(blocks.title, b.titleMax);
  }

  if (blocks.subtitle !== undefined && blocks.subtitle.length > b.subtitleMax) {
    violations.push({ rule: 'subtitle', message: '副标题过长' });
    adjusted.subtitle = truncateAtSentence(blocks.subtitle, b.subtitleMax);
  }

  if (blocks.body !== undefined) {
    if (blocks.body.length > b.bodyHard) {
      violations.push({ rule: 'body', message: '正文超过硬上限' });
      adjusted.body = truncateAtSentence(blocks.body, b.bodyHard);
    } else if (blocks.body.length > b.bodyTarget) {
      violations.push({ rule: 'body', message: '正文超过目标字数' });
    }
  }

  if (blocks.bullets !== undefined) {
    let bullets = blocks.bullets;
    if (bullets.length > b.bulletsMax) {
      violations.push({ rule: 'bullets', message: '项目符号过多' });
      bullets = bullets.slice(0, b.bulletsMax);
    }
    let overlong = false;
    bullets = bullets.map((bullet) => {
      if (bullet.length > b.bulletChars) {
        overlong = true;
        return bullet.slice(0, b.bulletChars - 1) + '…';
      }
      return bullet;
    });
    if (overlong) violations.push({ rule: 'bulletChars', message: '单条项目符号过长' });
    adjusted.bullets = bullets;
  }

  if (blocks.chart && blocks.chart.series.length > b.chartsMax) {
    violations.push({ rule: 'charts', message: '图表系列过多' });
    adjusted.chart = { ...blocks.chart, series: blocks.chart.series.slice(0, b.chartsMax) };
  }

  if (blocks.metrics && blocks.metrics.length > b.modulesMax) {
    violations.push({ rule: 'metrics', message: '指标过多' });
    adjusted.metrics = blocks.metrics.slice(0, b.modulesMax);
  }

  return { ok: violations.length === 0, violations, adjusted };
}
