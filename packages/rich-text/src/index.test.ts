import { describe, expect, it } from 'vitest';
import { textFromPlain, textFromLines } from '@jkinco/scene-schema';
import {
  applyFormat,
  checkAutofit,
  checkContentBudget,
  compressText,
  executiveTitle,
  maxFontSizeThatFits,
  measureText,
  mergeRuns,
  richTextToHtml,
  stringWidth,
  toBullets,
  translateToEnglishBasic,
  truncateToBudget,
  wrapPlainText,
} from './index';

describe('measurement', () => {
  it('measures CJK width ≈ fontSize per char', () => {
    expect(stringWidth('中文字符', 20)).toBeCloseTo(80, 0);
  });

  it('wraps long CJK text into multiple lines', () => {
    const text = textFromPlain('这是一个很长很长很长很长的标题文字');
    const m = measureText(text, { fontSize: 20, lineHeight: 1.4, boxWidth: 100 });
    expect(m.lines).toBeGreaterThan(1);
    expect(m.perParagraph[0]).toBe(m.lines);
  });

  it('detects overflow inside a box', () => {
    const text = textFromPlain('很多很多很多很多很多很多很多很多很多很多文字');
    const m = measureText(text, { fontSize: 24, lineHeight: 1.4, boxWidth: 200, boxHeight: 60 });
    expect(m.overflow).toBe(true);
  });

  it('short latin text fits one line', () => {
    const m = measureText(textFromPlain('OK Next'), { fontSize: 20, lineHeight: 1.4, boxWidth: 400 });
    expect(m.lines).toBe(1);
  });

  it('wrapPlainText breaks at width', () => {
    const lines = wrapPlainText('一二三四五六七八九十', 20, 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('一二三四五六七八九十');
  });
});

describe('autofit (§5.3 — shrink is the LAST resort)', () => {
  it('reports fits when text fits', () => {
    const r = checkAutofit(textFromPlain('短标题'), 400, 60, 28);
    expect(r.fits).toBe(true);
  });

  it('suggests a smaller font only when needed', () => {
    const long = '这是一段非常非常非常非常非常非常非常非常非常非常长的正文文字内容';
    const r = checkAutofit(textFromPlain(long), 200, 60, 24);
    expect(r.fits).toBe(false);
    expect(r.suggestedFontSize).toBeLessThan(24);
    const fitsAtSuggested = checkAutofit(textFromPlain(long), 200, 60, r.suggestedFontSize!);
    expect(fitsAtSuggested.fits).toBe(true);
  });

  it('maxFontSizeThatFits never increases the font', () => {
    expect(maxFontSizeThatFits(textFromPlain('短'), 400, 60, 28, 1.4)).toBe(28);
  });
});

describe('compression (Content Compression Gate)', () => {
  it('removes filler words deterministically', () => {
    const out = compressText('我们进一步积极推动相关工作。');
    expect(out.paragraphs[0]!.runs[0]!.text).not.toContain('我们');
    expect(out.paragraphs[0]!.runs[0]!.text).toContain('推动');
  });

  it('never changes numbers', () => {
    const out = compressText('2026年同比增长32%，共7项在研课题。');
    expect(out.paragraphs[0]!.runs[0]!.text).toContain('32');
    expect(out.paragraphs[0]!.runs[0]!.text).toContain('7');
  });

  it('truncates to budget at sentence boundaries', () => {
    const long = '第一句话很长很长。第二句话也很长很长。第三句话。';
    const out = truncateToBudget(long, 10);
    expect(out.paragraphs[0]!.runs[0]!.text.length).toBeLessThanOrEqual(10);
  });

  it('executiveTitle strips 关于 and 汇报', () => {
    expect(executiveTitle('关于多模态数据标注平台研发的汇报', 18)).not.toContain('关于');
    expect(executiveTitle('关于多模态数据标注平台研发的汇报', 18)).not.toContain('的汇报');
  });

  it('toBullets splits at sentence boundaries', () => {
    const bullets = toBullets('阶段一完成数据采集。阶段二完成标注。阶段三完成训练。');
    const count = bullets.paragraphs.filter((p) => p.bullet).length;
    expect(count).toBe(3);
  });

  it('enforces §5.1 budget: title ≤18, body ≤120, bullets ≤5', () => {
    const ok = checkContentBudget({ title: '多模态数据标注平台研发课题启动', body: '短正文', bulletCount: 3 }, { titleMax: 18, subtitleMax: 30, bodyTarget: 80, bodyHard: 120, bulletsDefault: 3, bulletsMax: 5, bulletChars: 22 });
    expect(ok.ok).toBe(true);
    const bad = checkContentBudget({ title: '这是一个超过十八个字的非常非常非常长的标题测试', body: 'x'.repeat(121), bulletCount: 6 }, { titleMax: 18, subtitleMax: 30, bodyTarget: 80, bodyHard: 120, bulletsDefault: 3, bulletsMax: 5, bulletChars: 22 });
    expect(bad.ok).toBe(false);
    expect(bad.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['title', 'body', 'bullets']));
  });
});

describe('formatting', () => {
  it('applies bold to a character range', () => {
    const t = applyFormat(textFromPlain('ABCD'), 1, 3, { bold: true });
    const runs = t.paragraphs[0]!.runs;
    expect(runs).toHaveLength(3);
    expect(runs[1]!.bold).toBe(true);
    expect(runs[1]!.text).toBe('BC');
  });

  it('mergeRuns joins identical adjacent runs', () => {
    let t = textFromPlain('AB');
    t = applyFormat(t, 0, 1, { bold: true });
    t = applyFormat(t, 1, 2, { bold: true });
    expect(t.paragraphs[0]!.runs.length).toBe(2);
    const merged = mergeRuns(t);
    expect(merged.paragraphs[0]!.runs.length).toBe(1);
    expect(merged.paragraphs[0]!.runs[0]!.bold).toBe(true);
  });

  it('renders HTML with escaping', () => {
    const html = richTextToHtml(textFromPlain('<b>&</b>'), { fontSize: 20 });
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('font-size:20pt');
  });
});

describe('translate (basic deterministic)', () => {
  it('translates common project terms', () => {
    const out = translateToEnglishBasic('多模态数据标注平台研发与应用');
    expect(out).toContain('Multimodal');
    expect(out).toContain('Platform');
  });
});
