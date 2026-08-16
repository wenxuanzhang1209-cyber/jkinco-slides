import { describe, expect, it } from 'vitest';
import type { SemanticRole, ShapeElement, SlideIntent } from '@jkinco/scene-schema';
import { SLIDE_H, SLIDE_W, createSlide, createText, getTheme, validateSlide } from '@jkinco/scene-schema';
import {
  bestLayout,
  checkDensityGate,
  computeDensity,
  detectOverflow,
  enforceContentBudget,
  planLayouts,
  solve,
} from './index';
import type { ContentBlocks } from './index';

const theme = getTheme('jkinco-blue');

const INTENTS: SlideIntent[] = [
  'explain',
  'compare',
  'prove',
  'decide',
  'update',
  'timeline',
  'architecture',
  'process',
  'kpi',
  'data_story',
  'quote',
  'summary',
];

const richBlocks: ContentBlocks = {
  title: '项目总体汇报',
  subtitle: '平台研发与应用进展',
  keyMessage: '核心成果显著提升',
  body: '这是一段正文内容，用于验证正文布局。',
  bullets: ['要点一：数据接入', '要点二：模型训练', '要点三：应用落地'],
  metrics: [
    { value: '32%', label: '效率提升' },
    { value: '120', label: '接入数据源' },
    { value: '5', label: '核心项目' },
    { value: '98%', label: '准确率' },
  ],
  chart: { categories: ['Q1', 'Q2', 'Q3'], series: [{ name: '营收', data: [10, 20, 30] }] },
  table: [
    ['指标', '数值'],
    ['营收', '100'],
    ['增长', '20%'],
  ],
  diagram: { nodes: ['数据层', '模型层', '应用层'], edges: [[0, 1], [1, 2]], levels: [0, 1, 1] },
  image: { src: 'data:image/png;base64,AAAA', alt: '示例图' },
  footer: '演示页脚',
  pageNumber: 1,
  totalPages: 10,
};

describe('@jkinco/layout-engine', () => {
  it('planLayouts returns 3–8 valid candidates for every intent, sorted by score', () => {
    for (const intent of INTENTS) {
      const candidates = planLayouts(intent, richBlocks, theme);
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      expect(candidates.length).toBeLessThanOrEqual(8);
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i - 1]!.score).toBeGreaterThanOrEqual(candidates[i]!.score);
      }
      for (const c of candidates) {
        expect(c.breakdown).toBeDefined();
        expect(validateSlide({ id: 't', elements: c.elements })).toEqual([]);
      }
    }
  });

  it('is deterministic across calls', () => {
    const a = planLayouts('explain', richBlocks, theme, { count: 5 });
    const b = planLayouts('explain', richBlocks, theme, { count: 5 });
    expect(a).toEqual(b);
  });

  it('score breakdown contains every component', () => {
    const candidates = planLayouts('explain', richBlocks, theme, { count: 3 });
    const keys = ['hierarchy', 'alignment', 'spacing', 'balance', 'density', 'contrast', 'brandMatch', 'similarityPenalty'];
    for (const c of candidates) {
      for (const key of keys) {
        expect(c.breakdown).toHaveProperty(key);
        expect(typeof c.breakdown[key]).toBe('number');
      }
    }
  });

  it('constraint solver: no overlap, inside bounds, gaps, title top, footer bottom', () => {
    const els = solve(richBlocks, 'kpi-grid', theme, 0);
    const nonConn = els.filter((e) => e.type !== 'connector');

    for (const el of nonConn) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(SLIDE_W);
      expect(el.y + el.h).toBeLessThanOrEqual(SLIDE_H);
    }

    for (let i = 0; i < nonConn.length; i++) {
      for (let j = i + 1; j < nonConn.length; j++) {
        const a = nonConn[i]!;
        const b = nonConn[j]!;
        const overlaps = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
        expect(overlaps).toBe(false);
      }
    }

    const title = els.find((e) => e.role === 'title');
    expect(title).toBeDefined();
    expect(title!.y).toBe(40);

    const footer = els.find((e) => e.role === 'footnote' || e.role === 'page_number');
    expect(footer).toBeDefined();
    expect(footer!.y).toBe(512);

    const cards = els.filter((e) => e.type === 'shape' && e.role === 'metric');
    expect(cards.length).toBe(4);
    let minGap = Infinity;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!;
        const b = cards[j]!;
        const hGap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        const vGap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
        const gap = Math.max(hGap, vGap);
        if (gap > 0) minGap = Math.min(minGap, gap);
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(20);
  });

  it('density: empty slide is good/low, overloaded slide is blocked, bands behave', () => {
    const empty = createSlide({ id: 'empty', elements: [] });
    const dEmpty = computeDensity(empty);
    expect(dEmpty.score).toBeLessThanOrEqual(10);
    expect(dEmpty.band).toBe('good');

    const mk = (id: string, roles: SemanticRole[], charsPer: number, count: number) => {
      const els = [];
      for (let i = 0; i < count; i++) {
        els.push(
          createText(10 + (i % 5) * 150, 10 + Math.floor(i / 5) * 40, 140, 30, '长'.repeat(charsPer), {
            role: roles[i % roles.length],
          }),
        );
      }
      return createSlide({ id, elements: els });
    };

    const warn = computeDensity(mk('warn', ['body', 'bullet'], 40, 3));
    expect(warn.band).toBe('warn');

    const autoSuggest = computeDensity(mk('auto', ['body', 'bullet', 'key_message', 'subtitle'], 20, 8));
    expect(autoSuggest.band).toBe('auto_suggest');

    const blocked = computeDensity(mk('blocked', ['title', 'subtitle', 'body', 'bullet', 'key_message'], 20, 14));
    expect(blocked.band).toBe('blocked');
    expect(blocked.score).toBeGreaterThan(85);

    const gate = checkDensityGate(createSlide({ id: 'b', elements: mk('blocked', ['title', 'subtitle', 'body', 'bullet', 'key_message'], 20, 14).elements }));
    expect(gate.passed).toBe(false);
  });

  it('enforceContentBudget trims bullets, body and title', () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `要点${i}这是一条内容`);
    const res = enforceContentBudget({
      bullets,
      body: 'x'.repeat(200),
      title: '标'.repeat(30),
    });

    expect(res.adjusted.bullets!.length).toBe(5);
    expect(res.violations.some((v) => v.rule === 'bullets')).toBe(true);

    expect(res.adjusted.body!.length).toBeLessThanOrEqual(120);
    expect(res.violations.some((v) => v.rule === 'body')).toBe(true);

    expect(res.adjusted.title!.length).toBeLessThanOrEqual(18);
    expect(res.violations.some((v) => v.rule === 'title')).toBe(true);

    expect(res.ok).toBe(false);
  });

  it('detectOverflow emits the fixed order with shrink last; null when nothing overflows', () => {
    const overflowSlide = createSlide({
      id: 'ov',
      elements: [createText(40, 40, 120, 24, '这是一段非常长的文本内容会被压缩或处理', { id: 'ov1', role: 'body', style: { fontSize: 22 } })],
    });
    const steps = detectOverflow(overflowSlide);
    expect(steps).not.toBeNull();
    expect(steps!.map((s) => s.action)).toEqual(['compress', 'restructure', 'relayout', 'split', 'shrink']);
    expect(steps!.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(steps![steps!.length - 1]!.action).toBe('shrink');

    const okSlide = createSlide({
      id: 'ok',
      elements: [createText(40, 40, 400, 100, '短文本', { id: 'ok1', role: 'body', style: { fontSize: 22 } })],
    });
    expect(detectOverflow(okSlide)).toBeNull();
  });

  it('pattern shapes: process chevrons+connectors, kpi-grid big value, comparison two columns', () => {
    const processEls = solve({ title: '流程', bullets: ['一', '二', '三'] }, 'process', theme, 0);
    expect(processEls.some((e) => e.type === 'shape' && e.shape === 'chevron')).toBe(true);
    expect(processEls.some((e) => e.type === 'connector')).toBe(true);

    const kpiEls = solve({ title: '指标', metrics: [{ value: '100', label: '营收' }, { value: '20%', label: '增长' }] }, 'kpi-grid', theme, 0);
    const metricShapes = kpiEls.filter((e) => e.type === 'shape' && e.role === 'metric');
    expect(metricShapes.length).toBeGreaterThanOrEqual(2);
    const big = metricShapes[0] as ShapeElement;
    expect(big.text!.paragraphs[0]!.runs[0]!.fontSize).toBeGreaterThanOrEqual(32);

    const cmpEls = solve({ title: '对比', bullets: ['a', 'b', 'c', 'd'] }, 'comparison', theme, 0);
    expect(cmpEls.filter((e) => e.role === 'bullet').length).toBe(2);
  });

  it('bestLayout returns a valid, top-scoring candidate', () => {
    const best = bestLayout('summary', richBlocks, theme);
    expect(validateSlide({ id: 't', elements: best.elements })).toEqual([]);
    expect(best.score).toBeGreaterThanOrEqual(0);
  });
});
