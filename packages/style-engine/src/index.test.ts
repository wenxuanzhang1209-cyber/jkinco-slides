import { describe, expect, it } from 'vitest';
import { CommandExecutor, applyThemeCommand } from '@jkinco/command-engine';
import {
  createDeck,
  createShape,
  createSlide,
  createText,
  deepClone,
  getTheme,
  validateSlide,
  type ChartElement,
  type ShapeElement,
  type TextElement,
} from '@jkinco/scene-schema';
import {
  applyStyleDnaToDeck,
  applyThemeToDeck,
  buildCoverSlide,
  buildSectionSlide,
  buildSummarySlide,
  extractStyleDna,
  variantTheme,
} from './index';

describe('applyThemeToDeck', () => {
  it('restyles by role, remaps palette colors, and does not mutate input', () => {
    const blue = getTheme('jkinco-blue');
    const executive = getTheme('executive');

    const slide = createSlide({
      purpose: 'content',
      elements: [
        createText(40, 40, 400, 60, '标题', {
          id: 'title',
          role: 'title',
          style: {
            fontSize: blue.title.fontSize,
            color: blue.title.color,
            bold: blue.title.bold,
            align: blue.title.align,
          },
          zIndex: 0,
        }),
        createShape('rect', 40, 120, 100, 60, {
          id: 'node',
          role: 'diagram_node',
          fill: { type: 'solid', color: blue.colors.primary, opacity: 1 },
          stroke: { color: blue.colors.primary, width: 1, style: 'solid' },
          zIndex: 1,
        }),
        createShape('rect', 160, 120, 100, 60, {
          id: 'primaryShape',
          fill: { type: 'solid', color: blue.colors.primary, opacity: 1 },
          stroke: { color: blue.colors.primary, width: 1, style: 'solid' },
          zIndex: 2,
        }),
        createShape('rect', 280, 120, 100, 60, {
          id: 'customShape',
          fill: { type: 'solid', color: '#123456', opacity: 1 },
          stroke: { color: '#123456', width: 1, style: 'solid' },
          zIndex: 3,
        }),
        createShape('rect', 400, 120, 100, 60, {
          id: 'lightShape',
          fill: { type: 'solid', color: blue.colors.primaryLight!, opacity: 1 },
          stroke: { color: blue.colors.primaryLight!, width: 1, style: 'solid' },
          zIndex: 4,
        }),
      ],
    });
    const deck = createDeck({ slides: [slide], themeId: 'jkinco-blue' });
    const before = deepClone(deck);

    const result = applyThemeToDeck(deck, 'executive');

    expect(result.themeId).toBe('executive');
    expect(result).not.toBe(deck);
    expect(deck).toEqual(before);

    const resSlide = result.slides[0]!;
    const title = resSlide.elements.find((e) => e.id === 'title') as TextElement;
    expect(title.style.color).toBe(executive.title.color);

    const primaryShape = resSlide.elements.find((e) => e.id === 'primaryShape') as ShapeElement;
    expect(primaryShape.fill.color).toBe(executive.colors.primary);

    const customShape = resSlide.elements.find((e) => e.id === 'customShape') as ShapeElement;
    expect(customShape.fill.color).toBe('#123456');

    const lightShape = resSlide.elements.find((e) => e.id === 'lightShape') as ShapeElement;
    expect(lightShape.fill.color).toBe(executive.colors.primaryLight);

    const node = resSlide.elements.find((e) => e.id === 'node') as ShapeElement;
    expect(node.fill.color).toBe(executive.diagram.nodeFill);
  });

  it('is idempotent when applied twice', () => {
    const blue = getTheme('jkinco-blue');
    const deck = createDeck({
      themeId: 'jkinco-blue',
      slides: [
        createSlide({
          elements: [
            createText(40, 40, 400, 60, '标题', {
              id: 't',
              role: 'title',
              style: { fontSize: blue.title.fontSize, color: blue.title.color, bold: blue.title.bold, align: blue.title.align },
              zIndex: 0,
            }),
            createShape('roundRect', 40, 120, 100, 60, {
              id: 's',
              fill: { type: 'solid', color: blue.colors.primary, opacity: 1 },
              stroke: { color: blue.colors.primary, width: 1, style: 'solid' },
              zIndex: 1,
            }),
          ],
        }),
      ],
    });

    const once = applyThemeToDeck(deck, 'executive');
    const twice = applyThemeToDeck(once, 'executive');
    expect(twice).toEqual(once);
  });

  it('registers with the command engine so ApplyThemeCommand restyles', () => {
    const blue = getTheme('jkinco-blue');
    const executive = getTheme('executive');
    const deck = createDeck({
      themeId: 'jkinco-blue',
      slides: [
        createSlide({
          elements: [
            createText(40, 40, 400, 60, '标题', {
              id: 't',
              role: 'title',
              style: { fontSize: blue.title.fontSize, color: blue.title.color, bold: true, align: 'left' },
              zIndex: 0,
            }),
          ],
        }),
      ],
    });

    const executor = new CommandExecutor(deck);
    const result = executor.apply(applyThemeCommand({ themeId: 'executive' }));
    expect(result.ok).toBe(true);
    const title = result.deck.slides[0]!.elements.find((e) => e.id === 't') as TextElement;
    expect(title.style.color).toBe(executive.title.color);
  });
});

describe('extractStyleDna / applyStyleDnaToDeck', () => {
  it('extracts primary, fonts, radius and source ids from decks', () => {
    const theme = getTheme('jkinco-blue');
    const deck = (id: string) =>
      createDeck({
        id,
        slides: [
          createSlide({
            elements: [
              createText(40, 40, 400, 60, '标题', {
                role: 'title',
                style: { fontSize: theme.title.fontSize, color: theme.title.color, bold: theme.title.bold, align: theme.title.align, fontFamily: theme.fonts.heading },
              }),
              createText(40, 120, 400, 60, '正文', {
                role: 'body',
                style: { fontSize: theme.body.fontSize, color: theme.body.color, fontFamily: theme.fonts.body },
              }),
              createShape('roundRect', 40, 200, 200, 100, {
                role: 'diagram_node',
                fill: { type: 'solid', color: theme.colors.primary, opacity: 1 },
                stroke: { color: theme.colors.primary, width: theme.borderWidth, style: 'solid' },
                radius: theme.radius,
              }),
            ],
          }),
        ],
      });

    const dna = extractStyleDna([deck('d1'), deck('d2'), deck('d3')]);
    expect(dna.palette.primary).toBe(theme.colors.primary);
    expect(dna.fonts.heading).toBe(theme.fonts.heading);
    expect(dna.fonts.body).toBe(theme.fonts.body);
    expect(dna.radius).toBe(theme.radius);
    expect(dna.extractedFrom).toEqual(['d1', 'd2', 'd3']);
  });

  it('applies dna palette/fonts/radius/border and sets styleDna', () => {
    const deck = createDeck({
      slides: [
        createSlide({
          elements: [
            createText(40, 40, 400, 60, '标题', { id: 't', role: 'title', style: { fontSize: 32, color: '#000000' }, zIndex: 0 }),
            createShape('roundRect', 40, 120, 100, 60, {
              id: 's',
              fill: { type: 'solid', color: '#000000', opacity: 1 },
              stroke: { color: '#000000', width: 1, style: 'solid' },
              radius: 4,
              zIndex: 1,
            }),
          ],
        }),
      ],
    });

    const dna = {
      name: 'test',
      palette: { primary: '#FF0000', secondary: '#00FF00', accent: '#0000FF', neutrals: ['#111111', '#222222', '#333333'] },
      fonts: { heading: 'HeadingFont', body: 'BodyFont' },
      radius: 12,
      borderWidth: 3,
      spacing: 24,
    };

    const result = applyStyleDnaToDeck(deck, dna);
    expect(result.styleDna).toBe(dna);

    const title = result.slides[0]!.elements.find((e) => e.id === 't') as TextElement;
    expect(title.style.color).toBe('#FF0000');

    const shape = result.slides[0]!.elements.find((e) => e.id === 's') as ShapeElement;
    expect(shape.radius).toBe(12);
    expect(shape.stroke.width).toBe(3);
  });
});

describe('slide grammars', () => {
  it('builds cover/section/summary slides that validate', () => {
    const theme = getTheme('jkinco-blue');

    const cover = buildCoverSlide('标题', '副标题', theme, { footer: '页脚', logo: 'data:image/png;base64,x' });
    expect(validateSlide(cover)).toEqual([]);
    const coverRoles = cover.elements.map((e) => e.role);
    expect(coverRoles).toContain('title');
    expect(coverRoles).toContain('subtitle');
    expect(coverRoles).toContain('logo');
    expect(cover.elements.some((e) => e.type === 'shape' && e.w === 80 && e.h === 6)).toBe(true);

    const section = buildSectionSlide('第一章', '架构', theme, { marker: 'bar' });
    expect(validateSlide(section)).toEqual([]);
    expect(section.elements.some((e) => e.role === 'section_label')).toBe(true);

    const summary = buildSummarySlide(['要点一', '要点二', '要点三'], theme);
    expect(validateSlide(summary)).toEqual([]);
    expect(summary.elements.some((e) => e.role === 'bullet')).toBe(true);
    expect(summary.elements.some((e) => e.role === 'key_message')).toBe(true);
  });
});

describe('variantTheme', () => {
  it('produces three distinct, valid, deep-cloned variants', () => {
    const base = getTheme('jkinco-blue');
    const executive = variantTheme(base, 'executive');
    const visual = variantTheme(base, 'visual');
    const technical = variantTheme(base, 'technical');

    const accents = [executive.colors.accent, visual.colors.accent, technical.colors.accent];
    expect(new Set(accents).size).toBe(3);

    for (const t of [executive, visual, technical]) {
      expect(t.id).toBeTruthy();
      expect(t.colors.primary).toMatch(/^#/);
      expect(t.radius).toBeGreaterThan(0);
      expect(typeof t.cover.titleFontSize).toBe('number');
    }

    // deep-cloned: mutating a variant never affects the base theme
    executive.colors.primary = '#000000';
    expect(base.colors.primary).toBe(getTheme('jkinco-blue').colors.primary);
  });
});
