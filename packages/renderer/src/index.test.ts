import { describe, expect, it } from 'vitest';
import {
  createChart,
  createConnector,
  createDeck,
  createImage,
  createMedia,
  createShape,
  createSlide,
  createTable,
  createText,
  getTheme,
  DEFAULT_THEME_ID,
} from '@jkinco/scene-schema';
import type { ShapeKind, Theme } from '@jkinco/scene-schema';
import { slideToSvg, deckToPrintHtml, escapeXml } from './index';

const theme: Theme = getTheme(DEFAULT_THEME_ID);

describe('slideToSvg', () => {
  it('returns a valid standalone SVG string', () => {
    const slide = createSlide({ elements: [createText(40, 40, 400, 60, '标题')] });
    const svg = slideToSvg(slide, theme);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 960 540"');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('XML-escapes text content', () => {
    const slide = createSlide({ elements: [createText(40, 40, 400, 60, 'A<B>&"C"')] });
    const svg = slideToSvg(slide, theme);
    expect(svg).toContain('A&lt;B&gt;&amp;&quot;C&quot;');
    expect(svg).not.toContain('A<B>');
  });

  it('renders every shape kind to its SVG tag', () => {
    const kinds: ShapeKind[] = [
      'rect',
      'roundRect',
      'pill',
      'ellipse',
      'line',
      'triangle',
      'rightTriangle',
      'diamond',
      'pentagon',
      'hexagon',
      'chevron',
      'arrowRight',
      'arrowLeft',
      'arrowUp',
      'arrowDown',
      'star',
      'parallelogram',
      'trapezoid',
    ];
    const elements = kinds.map((kind, i) =>
      createShape(kind, 20 + (i % 8) * 60, 20 + Math.floor(i / 8) * 60, 40, 30, { id: `shape-${i}` }),
    );
    const svg = slideToSvg(createSlide({ elements }), theme);
    expect(svg).toContain('<rect ');
    expect(svg).toContain('<ellipse ');
    expect(svg).toContain('<polygon ');
    expect(svg).toContain('<line ');
  });

  it('adds a marker-end for an arrow connector', () => {
    const connector = createConnector({ x: 10, y: 10 }, { x: 200, y: 100 }, { endArrow: 'arrow' });
    const svg = slideToSvg(createSlide({ elements: [connector] }), theme);
    expect(svg).toContain('marker-end="url(#');
    expect(svg).toContain('marker-arrow');
  });

  it('includes image href and omits hidden elements', () => {
    const image = createImage(10, 10, 100, 80, 'https://example.com/a.png');
    const hidden = createText(200, 200, 50, 50, 'HIDDEN_MARKER');
    hidden.hidden = true;
    const svg = slideToSvg(createSlide({ elements: [image, hidden] }), theme);
    expect(svg).toContain('href="https://example.com/a.png"');
    expect(svg).not.toContain('HIDDEN_MARKER');
  });

  it('draws a chart with a filled rect', () => {
    const chart = createChart('column', 100, 100, 300, 200, ['A', 'B', 'C'], [{ name: 'x', data: [10, 20, 30] }]);
    const svg = slideToSvg(createSlide({ elements: [chart] }), theme);
    expect(svg).toMatch(/<rect[^>]*fill=/);
  });

  it('applies rotation as a transform', () => {
    const shape = createShape('rect', 100, 100, 200, 100);
    shape.rotation = 45;
    const svg = slideToSvg(createSlide({ elements: [shape] }), theme);
    expect(svg).toContain('transform="rotate(');
  });

  it('is deterministic for identical input', () => {
    const slide = createSlide({
      elements: [
        createText(40, 40, 400, 60, '标题'),
        createShape('roundRect', 100, 120, 300, 150),
        createChart('pie', 500, 100, 200, 200, ['A', 'B', 'C'], [{ name: 'x', data: [1, 2, 3] }]),
        createConnector({ x: 10, y: 10 }, { x: 100, y: 100 }, { endArrow: 'dot' }),
      ],
    });
    expect(slideToSvg(slide, theme)).toBe(slideToSvg(slide, theme));
  });
});

describe('deckToPrintHtml', () => {
  it('embeds every slide SVG, notes content and page-break CSS', () => {
    const slide1 = createSlide({ id: 's1', elements: [createText(0, 0, 100, 50, '第一页')], notes: '备注一：这是第一页的备注。' });
    const slide2 = createSlide({ id: 's2', elements: [createText(0, 0, 100, 50, '第二页')] });
    const deck = createDeck({ title: '测试演示', slides: [slide1, slide2] });

    const html = deckToPrintHtml(deck, theme);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('第一页');
    expect(html).toContain('第二页');
    expect(html).toContain('备注一');
    expect(html).toContain('page-break-after');
    expect(html.split('<svg').length - 1).toBe(2);
  });
});

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});
