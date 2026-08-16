import { describe, expect, it } from 'vitest';
import {
  createChart,
  createDeck,
  createSlide,
  createText,
  deepClone,
  getTheme,
  textToPlain,
  type ChartElement,
  type TextElement,
} from '@jkinco/scene-schema';
import {
  applyBrandKit,
  createBrandKit,
  isRuleLocked,
  lockRule,
  unlockRule,
  validateBrandKit,
} from './index';

describe('createBrandKit / validateBrandKit', () => {
  it('validates name, hex colors and watermark opacity', () => {
    expect(validateBrandKit(createBrandKit({ name: '' }))).toContain('缺少 kit name');

    const badHex = createBrandKit({ name: 'K', colors: { primary: 'nothex' } });
    expect(validateBrandKit(badHex).some((e) => e.includes('primary'))).toBe(true);

    const badOpacity = createBrandKit({ name: 'K', watermark: { text: 'x', opacity: 1.5 } });
    expect(validateBrandKit(badOpacity).some((e) => e.includes('opacity'))).toBe(true);

    const ok = createBrandKit({
      name: 'K',
      colors: { primary: '#1E56A0' },
      watermark: { text: 'x', opacity: 0.2 },
    });
    expect(validateBrandKit(ok)).toEqual([]);
  });
});

describe('rule locks', () => {
  it('locks and unlocks rules', () => {
    let kit = createBrandKit({ name: 'K' });
    expect(isRuleLocked(kit, 'colors')).toBe(false);

    kit = lockRule(kit, 'colors');
    expect(isRuleLocked(kit, 'colors')).toBe(true);

    kit = lockRule(kit, 'colors');
    expect(kit.lockedRules).toEqual(['colors']);

    kit = unlockRule(kit, 'colors');
    expect(isRuleLocked(kit, 'colors')).toBe(false);
  });
});

describe('applyBrandKit', () => {
  function makeDeck() {
    const theme = getTheme('jkinco-blue');
    const cover = createSlide({
      purpose: 'cover',
      elements: [createText(40, 40, 400, 60, '封面', { id: 'c1', role: 'title' })],
    });
    const content1 = createSlide({
      purpose: 'content',
      elements: [
        createText(40, 40, 400, 60, '内容', { id: 't1', role: 'title' }),
        createChart('bar', 40, 120, 400, 200, ['a', 'b'], [{ name: 's', data: [1, 2], color: theme.chart.palette[0] }], { id: 'chart1' }),
      ],
    });
    const section = createSlide({
      purpose: 'section',
      elements: [createText(40, 40, 400, 60, '章节', { id: 's1', role: 'section_label' })],
    });
    const content2 = createSlide({
      purpose: 'content',
      elements: [createText(40, 40, 400, 60, '内容2', { id: 't2', role: 'title' })],
    });
    return createDeck({ slides: [cover, content1, section, content2] });
  }

  function makeKit() {
    return createBrandKit({
      name: 'JKinco',
      logo: 'data:image/png;base64,abc',
      fonts: { heading: 'BrandHeading' },
      colors: { primary: '#101828', accent: '#B98A2F' },
      footer: { text: '内部资料', showPageNumber: true },
      confidentiality: '注意保密',
      watermark: { text: '水印', opacity: 0.2 },
      chartDefaults: { palette: ['#111111', '#222222'] },
    });
  }

  it('adds brand elements per slide and recolors charts, without mutating input', () => {
    const theme = getTheme('jkinco-blue');
    const deck = makeDeck();
    const before = deepClone(deck);

    const result = applyBrandKit(deck, makeKit(), theme);

    expect(deck).toEqual(before);

    for (const slide of result.slides) {
      // logo on every slide
      expect(slide.elements.some((e) => e.role === 'logo')).toBe(true);
      // watermark (locked) on every slide
      expect(slide.elements.some((e) => e.semantic?.sourceIds?.includes('brand-kit') && e.locked === true)).toBe(true);
      // confidentiality (muted red footnote) on every slide
      expect(slide.elements.some((e) => e.role === 'footnote' && (e as TextElement).style.color === '#C0392B')).toBe(true);
    }

    const coverRes = result.slides[0]!;
    const content1Res = result.slides[1]!;
    const sectionRes = result.slides[2]!;

    // footer/page number only on non-cover, non-section slides
    expect(coverRes.elements.some((e) => e.role === 'page_number')).toBe(false);
    expect(sectionRes.elements.some((e) => e.role === 'page_number')).toBe(false);
    expect(content1Res.elements.some((e) => e.role === 'page_number')).toBe(true);
    expect(content1Res.elements.some((e) => e.role === 'footnote' && textToPlain((e as TextElement).text) === '内部资料')).toBe(true);

    // chart recolored by chartDefaults palette
    const chart = content1Res.elements.find((e) => e.id === 'chart1') as ChartElement;
    expect(chart.series[0]!.color).toBe('#111111');
  });

  it('is deterministic for identical input', () => {
    const theme = getTheme('jkinco-blue');
    const deck = makeDeck();
    const kit = makeKit();
    const a = applyBrandKit(deck, kit, theme);
    const b = applyBrandKit(deck, kit, theme);
    expect(a).toEqual(b);
  });

  it('marks created elements with semantic.sourceIds ["brand-kit"]', () => {
    const theme = getTheme('jkinco-blue');
    const deck = createDeck({
      slides: [
        createSlide({
          id: 's1',
          purpose: 'content',
          elements: [createText(40, 40, 400, 60, 'x', { id: 't1' })],
        }),
      ],
    });
    const kit = createBrandKit({
      name: 'K',
      logo: 'x',
      footer: { text: 'f', showPageNumber: true },
      confidentiality: 'c',
      watermark: { text: 'w', opacity: 0.1 },
    });

    const result = applyBrandKit(deck, kit, theme);
    const brandEls = result.slides[0]!.elements.filter((e) => e.semantic?.sourceIds?.includes('brand-kit'));
    expect(brandEls.length).toBe(5); // logo, footer, page number, confidentiality, watermark
    for (const el of brandEls) {
      expect(el.semantic!.sourceIds).toEqual(['brand-kit']);
    }
  });
});
