import { describe, expect, it } from 'vitest';
import {
  SLIDE_H,
  SLIDE_W,
  createConnector,
  createDeck,
  createDiagram,
  createShape,
  createSlide,
  createText,
  createImage,
  createTable,
  createChart,
  textFromLines,
  textFromPlain,
  textLength,
  textToPlain,
  validateDeck,
  validateSlide,
  deepClone,
  uid,
  getRotatedBounds,
  THEMES,
  getTheme,
  DEFAULT_THEME_ID,
  DEFAULT_CONTENT_BUDGET,
} from './index';

describe('constants', () => {
  it('uses 960×540 logical slide size', () => {
    expect(SLIDE_W).toBe(960);
    expect(SLIDE_H).toBe(540);
    expect(SLIDE_W / SLIDE_H).toBeCloseTo(16 / 9, 5);
  });

  it('content budget matches §5.1 hard constraints', () => {
    expect(DEFAULT_CONTENT_BUDGET.titleMax).toBeLessThanOrEqual(18);
    expect(DEFAULT_CONTENT_BUDGET.bodyHard).toBeLessThanOrEqual(120);
    expect(DEFAULT_CONTENT_BUDGET.bulletsMax).toBeLessThanOrEqual(5);
    expect(DEFAULT_CONTENT_BUDGET.bodyMinFont).toBeGreaterThanOrEqual(18);
    expect(DEFAULT_CONTENT_BUDGET.bodyFontRange[0]).toBeGreaterThanOrEqual(22);
    expect(DEFAULT_CONTENT_BUDGET.bodyFontRange[1]).toBeLessThanOrEqual(26);
  });
});

describe('uid', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uid()));
    expect(ids.size).toBe(1000);
  });
});

describe('rich text', () => {
  it('round-trips plain text', () => {
    const t = textFromPlain('第一行\n第二行');
    expect(textToPlain(t)).toBe('第一行\n第二行');
  });

  it('counts CJK chars for content budget', () => {
    expect(textLength('多模态数据标注平台研发与应用课题启动会')).toBe(19);
    expect(textLength(textFromPlain('课题研究正式启动'))).toBe(8);
  });

  it('counts latin chars at 0.55 weight', () => {
    const len = textLength('ABCDEFGHIJ');
    expect(len).toBe(6); // 10 * 0.55 = 5.5 → 6
  });

  it('parses bullet lines', () => {
    const t = textFromLines(['第一条', '- 第二条', '• 第三条']);
    expect(t.paragraphs[0]!.bullet).toBe(false);
    expect(t.paragraphs[1]!.bullet).toBe(true);
    expect(t.paragraphs[2]!.bullet).toBe(true);
    expect(textToPlain(t)).toBe('第一条\n第二条\n第三条');
  });
});

describe('elements', () => {
  it('creates a semantic text element (§3 example)', () => {
    const el = createText(84, 65, 620, 48, '项目总体架构', {
      role: 'key_message',
      semantic: { topic: '项目总体架构', importance: 0.92, sourceIds: ['doc_12'], aiEditable: true },
    });
    expect(el.type).toBe('text');
    expect(el.role).toBe('key_message');
    expect(el.semantic?.importance).toBeCloseTo(0.92);
    expect(el.semantic?.sourceIds).toEqual(['doc_12']);
    expect(el.semantic?.aiEditable).toBe(true);
  });

  it('creates shape, image, chart, table, connector, diagram', () => {
    const shape = createShape('roundRect', 0, 0, 200, 80, { text: '节点' });
    expect(shape.fill.type).toBe('solid');
    expect(shape.stroke.width).toBeGreaterThan(0);

    const img = createImage(0, 0, 100, 100, 'data:image/png;base64,AA');
    expect(img.objectFit).toBe('cover');

    const chart = createChart('column', 0, 0, 400, 240, ['Q1', 'Q2'], [{ name: '营收', data: [10, 20] }]);
    expect(chart.series).toHaveLength(1);

    const table = createTable(40, 40, [
      ['阶段', '任务'],
      ['1', '数据采集'],
    ], { headerRow: true });
    expect(table.cells).toHaveLength(2);
    expect(table.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(880);

    const conn = createConnector({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(conn.endArrow).toBe('arrow');

    const diagram = createDiagram('hierarchy', 'vertical', [{ id: 'n1' }, { id: 'n2' }], [{ id: 'e1', from: 'n1', to: 'n2' }], 40, 40, 880, 400, {
      childIds: [],
    });
    expect(diagram.layout).toBe('hierarchy');
  });
});

describe('geometry utils', () => {
  it('computes rotated bounds', () => {
    const b = getRotatedBounds({ x: 0, y: 0, w: 100, h: 50, rotation: 90 });
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
  });

  it('deep clone is independent', () => {
    const deck = createDeck();
    const copy = deepClone(deck);
    copy.title = 'changed';
    expect(deck.title).not.toBe('changed');
  });
});

describe('validation', () => {
  it('accepts a valid slide', () => {
    const slide = createSlide({
      elements: [
        createText(40, 40, 400, 50, '标题', { zIndex: 0 }),
        createShape('rect', 40, 120, 200, 100, { zIndex: 1 }),
      ],
    });
    expect(validateSlide(slide)).toEqual([]);
  });

  it('rejects out-of-range opacity and duplicate ids', () => {
    const t = createText(40, 40, 400, 50, 'a');
    const t2 = deepClone(t);
    t2.id = t.id;
    t.opacity = 2;
    const issues = validateSlide({ id: 's1', elements: [t, t2] });
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects diagram edges referencing unknown nodes', () => {
    const dgm = createDiagram('hierarchy', 'vertical', [{ id: 'n1' }], [{ id: 'e1', from: 'n1', to: 'missing' }], 0, 0, 100, 100, { childIds: ['n1'] });
    const issues = validateSlide({ id: 's1', elements: [dgm] });
    expect(issues.some((i) => i.message.includes('不存在的终点节点'))).toBe(true);
  });

  it('accepts a full deck with default theme', () => {
    const deck = createDeck({ slides: [createSlide()] });
    const result = validateDeck(deck);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown theme id', () => {
    const deck = createDeck({ themeId: 'nope' });
    const result = validateDeck(deck);
    expect(result.ok).toBe(false);
  });
});

describe('themes', () => {
  it('ships the six Style DNA sub-styles (§10.1) plus default', () => {
    expect(THEMES.length).toBe(6);
    expect(getTheme(DEFAULT_THEME_ID).id).toBe(DEFAULT_THEME_ID);
  });

  it('every theme has palette, fonts, grammars', () => {
    for (const t of THEMES) {
      expect(t.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.colors.chartPalette.length).toBeGreaterThanOrEqual(4);
      expect(t.diagram.nodeFill).toBeTruthy();
      expect(t.cover.titleFontSize).toBeGreaterThan(0);
    }
  });
});
