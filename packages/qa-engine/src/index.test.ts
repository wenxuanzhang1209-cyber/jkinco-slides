import { describe, expect, it } from 'vitest';
import { CommandExecutor } from '@jkinco/command-engine';
import { bestLayout } from '@jkinco/layout-engine';
import type { ContentBlocks } from '@jkinco/layout-engine';
import { createDeck, createShape, createSlide, createText, getTheme } from '@jkinco/scene-schema';
import { applyAutoFixes, reviewDeck, reviewSlide, suggestFixes } from './index';

const theme = getTheme('jkinco-blue');

describe('@jkinco/qa-engine', () => {
  it('clean slide (bestLayout output) → no errors and no warnings', () => {
    const cleanBlocks: ContentBlocks = { title: '项目汇报', keyMessage: '核心成果显著', footer: '演示页脚' };
    const cand = bestLayout('quote', cleanBlocks, theme);
    const slide = createSlide({ id: 'clean', purpose: 'summary', intent: 'summary', elements: cand.elements });
    const issues = reviewSlide(slide, { theme });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([]);
  });

  it('geometry: overlapping elements → error; out-of-bounds → error/warning', () => {
    const overlap = createSlide({
      id: 'g',
      elements: [
        createText(100, 100, 200, 100, '元素一', { id: 'a', role: 'body' }),
        createText(150, 120, 200, 100, '元素二', { id: 'b', role: 'body' }),
      ],
    });
    const overlapIssues = reviewSlide(overlap, { theme });
    expect(overlapIssues.some((i) => i.category === 'geometry' && i.severity === 'error' && i.message.includes('重叠'))).toBe(true);

    const out = createSlide({ id: 'o', elements: [createText(1000, 100, 200, 100, '越界', { id: 'c', role: 'body' })] });
    const outIssues = reviewSlide(out, { theme });
    expect(outIssues.some((i) => i.category === 'geometry' && (i.severity === 'error' || i.severity === 'warning') && i.message.includes('画布'))).toBe(true);
  });

  it('typography: 12pt body → error; long title → warning', () => {
    const s = createSlide({
      id: 't',
      elements: [
        createText(40, 40, 400, 100, '正文内容', { id: 'f', role: 'body', style: { fontSize: 12 } }),
        createText(40, 150, 400, 40, '这是一个非常非常非常长的标题超过十八个字符', { id: 'ti', role: 'title', style: { fontSize: 32 } }),
      ],
    });
    const issues = reviewSlide(s, { theme });
    expect(issues.some((i) => i.category === 'typography' && i.severity === 'error' && i.message.includes('字号'))).toBe(true);
    expect(issues.some((i) => i.category === 'typography' && i.severity === 'warning' && i.message.includes('标题'))).toBe(true);
  });

  it('content: 200-char body → error; duplicate text → warning; missing key message → warning', () => {
    const longBody = '很'.repeat(200);
    const s = createSlide({
      id: 'c',
      purpose: 'content',
      elements: [
        createText(40, 40, 400, 400, longBody, { id: 'b1', role: 'body' }),
        createText(40, 40, 400, 400, longBody, { id: 'b2', role: 'body' }),
      ],
    });
    const issues = reviewSlide(s, { theme });
    expect(issues.some((i) => i.category === 'content' && i.severity === 'error' && i.message.includes('120'))).toBe(true);
    expect(issues.some((i) => i.category === 'content' && i.severity === 'warning' && i.message.includes('重复'))).toBe(true);

    const noKey = createSlide({
      id: 'nk',
      purpose: 'content',
      elements: [createText(40, 40, 400, 40, '只有标题', { id: 't2', role: 'title', style: { fontSize: 32 } })],
    });
    const noKeyIssues = reviewSlide(noKey, { theme });
    expect(noKeyIssues.some((i) => i.category === 'content' && i.severity === 'warning' && i.message.includes('关键信息'))).toBe(true);
  });

  it('visual: white-on-white → warning; off-palette fill → info', () => {
    const lowContrast = createSlide({
      id: 'v',
      elements: [
        createShape('rect', 40, 40, 200, 100, {
          id: 'sh',
          fill: { type: 'solid', color: '#FFFFFF', opacity: 1 },
          stroke: { color: '#000000', width: 1, style: 'solid' },
          text: '白色文字',
          textStyle: { fontSize: 22, color: '#FFFFFF' },
        }),
      ],
    });
    const issues = reviewSlide(lowContrast, { theme });
    expect(issues.some((i) => i.category === 'visual' && i.severity === 'warning' && i.message.includes('对比度'))).toBe(true);

    const offPalette = createSlide({
      id: 'p',
      elements: [
        createShape('rect', 40, 40, 200, 100, {
          id: 's2',
          fill: { type: 'solid', color: '#123456', opacity: 1 },
          stroke: { color: '#ABCDEF', width: 1, style: 'solid' },
        }),
      ],
    });
    const pIssues = reviewSlide(offPalette, { theme });
    expect(pIssues.some((i) => i.category === 'visual' && i.severity === 'info' && i.message.includes('调色板'))).toBe(true);
  });

  it('reviewDeck: duplicate slides → warning; blank slide → error; ready flag', () => {
    const title = (id: string) => createText(40, 40, 400, 40, '标题A', { id, role: 'title', style: { fontSize: 32 } });
    const s1 = createSlide({ id: 's1', purpose: 'content', elements: [title('t1')] });
    const s2 = createSlide({ id: 's2', purpose: 'content', elements: [title('t2')] });
    const blank = createSlide({ id: 's3', purpose: 'content', elements: [] });
    const deck = createDeck({ id: 'd', slides: [s1, s2, blank] });

    const report = reviewDeck(deck, { theme });
    expect(report.stats.errors).toBeGreaterThan(0);
    expect(report.ready).toBe(false);
    expect(report.issues.some((i) => i.category === 'deck' && i.severity === 'warning' && i.message.includes('重复页面'))).toBe(true);
    expect(report.issues.some((i) => i.category === 'deck' && i.severity === 'error' && i.message.includes('空白'))).toBe(true);
  });

  it('suggestFixes returns commands; applyAutoFixes reduces errors and undoes cleanly', () => {
    const slide = createSlide({
      id: 'fix',
      purpose: 'content',
      elements: [
        createText(40, 40, 300, 60, '这是一个用于测试修复的长文本内容会被压缩', { id: 'ov', role: 'body', autoFit: true, style: { fontSize: 24 } }),
        createText(40, 160, 300, 40, '小字号', { id: 'small', role: 'body', style: { fontSize: 12 } }),
        createText(1000, 40, 100, 40, '越界', { id: 'oob', role: 'body' }),
      ],
    });
    const deck = createDeck({ id: 'd', slides: [slide] });

    const report = reviewDeck(deck, { theme });
    const commands = suggestFixes(deck, report.issues);
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) expect(typeof c.kind).toBe('string');

    const executor = new CommandExecutor(deck);
    const before = executor.deck;
    const res = applyAutoFixes(executor, deck);
    expect(res.applied).toBeGreaterThan(0);
    expect(executor.canUndo).toBe(true);

    const afterReport = reviewDeck(executor.deck, { theme });
    expect(afterReport.stats.errors).toBeLessThan(report.stats.errors);

    executor.undo();
    expect(executor.deck).toEqual(before);
  });

  it('reviewDeck is deterministic', () => {
    const slide = createSlide({
      id: 'det',
      purpose: 'content',
      elements: [createText(40, 40, 400, 40, '标题', { id: 'x', role: 'title', style: { fontSize: 32 } })],
    });
    const deck = createDeck({ id: 'dd', slides: [slide] });
    expect(reviewDeck(deck, { theme })).toEqual(reviewDeck(deck, { theme }));
  });
});
