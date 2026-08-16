import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createSlide,
  createText,
  deepClone,
  getTheme,
  textFromLines,
  textLength,
  textToPlain,
  type Slide,
} from '@jkinco/scene-schema';
import { CommandExecutor, type Command } from '@jkinco/command-engine';
import { detectIntent, generateAlternatives, runAiEdit } from './index';

function bodyDeck(body: string) {
  const slide = createSlide({
    id: 's1',
    elements: [
      createText(40, 40, 800, 60, '汇报标题', { id: 't_title', role: 'title' }),
      createText(40, 120, 800, 300, body, { id: 't_body', role: 'body' }),
    ],
  });
  return createDeck({ slides: [slide] });
}

function plainOf(slide: Slide, id: string): string {
  const el = slide.elements.find((e) => e.id === id);
  if (!el) return '';
  if (el.type === 'text') return textToPlain(el.text);
  if (el.type === 'shape' && el.text) return textToPlain(el.text);
  return '';
}

describe('detectIntent', () => {
  const cases: Array<[string, string]> = [
    ['请精简这段文字', 'shorten'],
    ['给领导看的正式汇报', 'executive'],
    ['学术风格', 'academic'],
    ['表达更清晰', 'clearer'],
    ['翻译成英文', 'translate'],
    ['更可视化一些', 'visual'],
    ['字太多了减少文字', 'reduceText'],
    ['重新布局', 'relayout'],
    ['给我三版备选', 'alternatives'],
    ['变成时间线', 'toTimeline'],
    ['架构图', 'toArchitecture'],
    ['拆页', 'splitSlide'],
    ['简化图表', 'simplify'],
    ['加一步', 'addStep'],
    ['合并步骤', 'mergeSteps'],
    ['优化标题', 'betterTitle'],
    ['补充数据证据', 'addEvidence'],
  ];

  for (const [instruction, intent] of cases) {
    it(`maps "${instruction}" → ${intent}`, () => {
      expect(detectIntent(instruction).intent).toBe(intent);
      const confidence = detectIntent(instruction).confidence;
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  }

  it('falls back to relayout for unknown instructions', () => {
    expect(detectIntent('请帮我随便改改').intent).toBe('relayout');
  });
});

describe('runAiEdit — shorten', () => {
  it('produces updateText commands, shortens text and undo restores', () => {
    const body = '这是一个很长的正文内容，我们进行了大量的工作并且持续提升效率，进一步推动项目进展，全面推动各项相关工作。';
    const deck = bodyDeck(body);
    const before = deepClone(deck);

    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '请精简这段文字' });
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands.every((c) => c.kind === 'updateText')).toBe(true);

    const executor = new CommandExecutor(deck);
    const applied = executor.applyMany(result.commands);
    expect(applied.ok).toBe(true);

    const beforeBody = plainOf(before.slides[0]!, 't_body');
    const afterBody = plainOf(applied.deck.slides[0]!, 't_body');
    expect(textLength(afterBody)).toBeLessThanOrEqual(80);
    expect(textLength(afterBody)).toBeLessThan(textLength(beforeBody));

    const undone = executor.undo();
    expect(undone.ok).toBe(true);
    expect(undone.deck).toEqual(before);
  });
});

describe('runAiEdit — tone / translate', () => {
  it('rewrites to executive tone', () => {
    const deck = bodyDeck('我们进行了相关工作了，全面推动进展吧！');
    const result = runAiEdit({ deck, scope: 'object', targetIds: ['t_body'], instruction: '转为高管语气' });
    expect(result.commands.every((c) => c.kind === 'updateText')).toBe(true);
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const text = plainOf(applied.deck.slides[0]!, 't_body');
    expect(text).toContain('。');
    expect(text).not.toContain('吧');
  });

  it('rewrites to academic tone', () => {
    const deck = bodyDeck('我们进行了相关工作。');
    const result = runAiEdit({ deck, scope: 'object', targetIds: ['t_body'], instruction: '学术风格' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const text = plainOf(applied.deck.slides[0]!, 't_body');
    expect(text).toContain('本研究');
    expect(text).toContain('分析');
  });

  it('splits long sentences when making clearer', () => {
    const long = '这是一个非常非常长的句子，包含了大量的信息点，为了表达更清晰需要把它拆分成多个短句来展示给读者。';
    const deck = bodyDeck(long);
    const result = runAiEdit({ deck, scope: 'object', targetIds: ['t_body'], instruction: '表达更清晰' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const el = applied.deck.slides[0]!.elements.find((e) => e.id === 't_body');
    expect(el && el.type === 'text').toBe(true);
    if (el && el.type === 'text') {
      expect(el.text.paragraphs.length).toBeGreaterThan(1);
    }
  });

  it('translates to English', () => {
    const deck = bodyDeck('多模态数据标注平台建设');
    const result = runAiEdit({ deck, scope: 'object', targetIds: ['t_body'], instruction: '翻译成英文' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const text = plainOf(applied.deck.slides[0]!, 't_body');
    expect(text).toContain('Platform');
  });
});

describe('runAiEdit — reduceText', () => {
  it('caps bullets at 3', () => {
    const slide = createSlide({
      id: 's1',
      elements: [
        createText(40, 40, 800, 60, '标题', { id: 't1', role: 'title' }),
        createText(40, 120, 800, 300, textFromLines(['- 第一点', '- 第二点', '- 第三点', '- 第四点', '- 第五点']), {
          id: 't2',
          role: 'bullet',
        }),
      ],
    });
    const deck = createDeck({ slides: [slide] });
    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '字太多了减少文字' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const el = applied.deck.slides[0]!.elements.find((e) => e.id === 't2');
    expect(el && el.type === 'text').toBe(true);
    if (el && el.type === 'text') {
      expect(el.text.paragraphs.filter((p) => p.bullet).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('runAiEdit — relayout', () => {
  it('replaces elements with a layout while preserving text', () => {
    const slide = createSlide({
      id: 's1',
      elements: [
        createText(40, 40, 800, 60, '标题', { id: 't1', role: 'title' }),
        createText(40, 120, 800, 60, '核心信息', { id: 't2', role: 'key_message' }),
        createText(40, 200, 800, 200, textFromLines(['- A', '- B', '- C']), { id: 't3', role: 'bullet' }),
      ],
    });
    const deck = createDeck({ slides: [slide] });
    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '重新布局' });
    expect(result.commands.some((c) => c.kind === 'applyLayout')).toBe(true);

    const applied = new CommandExecutor(deck).applyMany(result.commands);
    const newSlide = applied.deck.slides[0]!;
    expect(newSlide.layoutId).toBeTruthy();

    const beforeTexts = new Set(
      slide.elements.map((e) => (e.type === 'text' ? textToPlain(e.text) : '')).filter((s) => s.trim()),
    );
    const afterTexts = new Set(
      newSlide.elements.map((e) => (e.type === 'text' ? textToPlain(e.text) : '')).filter((s) => s.trim()),
    );
    for (const t of beforeTexts) expect(afterTexts.has(t)).toBe(true);
  });
});

describe('runAiEdit — splitSlide', () => {
  it('splits an overfull slide into two', () => {
    const elements = Array.from({ length: 8 }, (_, i) =>
      createText(40, 40 + i * 50, 400, 40, `元素${i}`, { id: `e${i}`, role: i === 0 ? 'title' : 'body' }),
    );
    const slide = createSlide({ id: 's1', elements });
    const deck = createDeck({ slides: [slide] });
    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '拆页' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    expect(applied.ok).toBe(true);
    expect(applied.deck.slides.length).toBe(2);
    expect(applied.deck.slides[0]!.elements.length).toBeLessThan(8);
  });
});

describe('generateAlternatives', () => {
  it('produces 3 content-identical, structurally-distinct variants', () => {
    const slide = createSlide({
      id: 's1',
      elements: [
        createText(40, 40, 800, 60, '标题', { id: 't1', role: 'title' }),
        createText(40, 200, 800, 200, textFromLines(['- 甲', '- 乙', '- 丙']), { id: 't2', role: 'bullet' }),
      ],
    });
    const deck = createDeck({ slides: [slide] });
    const theme = getTheme('jkinco-blue');
    const { variants } = generateAlternatives(deck, 's1', theme);

    expect(variants.length).toBe(3);
    expect(variants.map((v) => v.label)).toEqual(['Executive', 'Visual', 'Technical']);
    for (const v of variants) {
      expect(v.commands.length).toBe(1);
      expect(v.commands[0]!.kind).toBe('applyLayout');
    }

    const applyVariant = (commands: Command[]): Slide => {
      const executor = new CommandExecutor(deepClone(deck));
      const res = executor.apply(commands[0]!);
      return res.deck.slides[0]!;
    };

    const textLines = (s: Slide): Set<string> => {
      const set = new Set<string>();
      for (const el of s.elements) {
        const plain =
          el.type === 'text' ? textToPlain(el.text) : el.type === 'shape' && el.text ? textToPlain(el.text) : '';
        for (const line of plain.split('\n')) if (line.trim()) set.add(line.trim());
      }
      return set;
    };

    const geoSet = (s: Slide): Set<string> =>
      new Set(s.elements.map((e) => `${e.type}:${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.w)},${Math.round(e.h)}`));

    const applied = variants.map((v) => applyVariant(v.commands));
    const baseline = textLines(applied[0]!);
    for (const s of applied) expect(textLines(s)).toEqual(baseline);

    expect(geoSet(applied[0]!)).not.toEqual(geoSet(applied[1]!));
    expect(geoSet(applied[1]!)).not.toEqual(geoSet(applied[2]!));
    expect(geoSet(applied[0]!)).not.toEqual(geoSet(applied[2]!));
  });
});

describe('runAiEdit — scope', () => {
  const longA = '我们进行了大量的相关工作，进一步推动项目进展，持续提升整体效率。';
  const longB = '全面推动各项工作深入开展，切实完成相关任务目标与关键节点。';

  it('object scope touches only the targeted element', () => {
    const slide = createSlide({
      id: 's1',
      elements: [
        createText(40, 40, 800, 60, longA, { id: 'e1', role: 'body' }),
        createText(40, 120, 800, 60, longB, { id: 'e2', role: 'body' }),
      ],
    });
    const deck = createDeck({ slides: [slide] });
    const result = runAiEdit({ deck, scope: 'object', targetIds: ['e2'], slideId: 's1', instruction: '精简' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    expect(plainOf(applied.deck.slides[0]!, 'e1')).toBe(longA);
    expect(plainOf(applied.deck.slides[0]!, 'e2')).not.toBe(longB);
  });

  it('selection scope touches only the selected element', () => {
    const slide = createSlide({
      id: 's1',
      elements: [
        createText(40, 40, 800, 60, longA, { id: 'e1', role: 'body' }),
        createText(40, 120, 800, 60, longB, { id: 'e2', role: 'body' }),
      ],
    });
    const deck = createDeck({ slides: [slide] });
    const result = runAiEdit({ deck, scope: 'selection', targetIds: ['e1'], slideId: 's1', instruction: '精简' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    expect(plainOf(applied.deck.slides[0]!, 'e1')).not.toBe(longA);
    expect(plainOf(applied.deck.slides[0]!, 'e2')).toBe(longB);
  });

  it('slide scope leaves other slides untouched', () => {
    const slideA = createSlide({
      id: 's1',
      elements: [createText(40, 40, 800, 60, longA, { id: 'e1', role: 'body' })],
    });
    const slideB = createSlide({
      id: 's2',
      elements: [createText(40, 40, 800, 60, longB, { id: 'e2', role: 'body' })],
    });
    const deck = createDeck({ slides: [slideA, slideB] });
    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '精简' });
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    expect(applied.deck.slides[1]).toEqual(deck.slides[1]);
  });
});

describe('runAiEdit — purity and fallback', () => {
  it('never mutates the input deck', () => {
    const deck = bodyDeck('我们进行了大量的相关工作，进一步推动项目进展。');
    const before = deepClone(deck);
    runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '精简' });
    expect(deck).toEqual(before);
  });

  it('falls back to relayout for unknown instructions and applies', () => {
    const deck = bodyDeck('一些正文内容');
    const result = runAiEdit({ deck, scope: 'slide', targetIds: [], slideId: 's1', instruction: '请随便处理一下' });
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands.some((c) => c.kind === 'applyLayout')).toBe(true);
    const applied = new CommandExecutor(deck).applyMany(result.commands);
    expect(applied.ok).toBe(true);
  });
});
