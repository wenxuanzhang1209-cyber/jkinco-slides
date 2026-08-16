import { describe, expect, it } from 'vitest';
import { textLength, validateSlide } from '@jkinco/scene-schema';
import { checkDensityGate } from '@jkinco/layout-engine';
import {
  GenerationPipeline,
  applyStoryboardOps,
  askClarifyingQuestions,
  buildSlideFromStoryItem,
  buildStoryboard,
  generateDeckGraph,
  parsePrompt,
  researchFacts,
  type StoryboardOp,
} from './index';

describe('parsePrompt', () => {
  it('extracts page count, audience and topic', () => {
    const parsed = parsePrompt('AI平台建设、15页、给公司领导看');
    expect(parsed.pageCount).toBe(15);
    expect(parsed.audience).toBe('公司领导层');
    expect(parsed.topic).toBe('AI平台建设');
    expect(Array.isArray(parsed.keywords)).toBe(true);
  });

  it('handles English page notation', () => {
    expect(parsePrompt('AI平台建设 12 pages').pageCount).toBe(12);
  });
});

describe('askClarifyingQuestions', () => {
  it('returns at most 3 questions and skips audience when mentioned', () => {
    const withAudience = askClarifyingQuestions('AI平台建设、给公司领导看');
    expect(withAudience.length).toBeLessThanOrEqual(3);
    expect(withAudience.some((q) => q.kind === 'audience')).toBe(false);
    expect(withAudience.some((q) => q.kind === 'duration')).toBe(true);
    expect(withAudience.some((q) => q.kind === 'styleDna')).toBe(true);
  });

  it('asks audience when absent', () => {
    const withoutAudience = askClarifyingQuestions('AI平台建设、15页');
    expect(withoutAudience.length).toBe(3);
    expect(withoutAudience[0]!.kind).toBe('audience');
  });
});

describe('generateDeckGraph', () => {
  it('builds a deterministic plan with cover first and thanks last', () => {
    const graph = generateDeckGraph('AI平台建设、15页、给公司领导看');
    expect(graph.slides.length).toBe(15);
    expect(graph.slides[0]!.purpose).toBe('cover');
    expect(graph.slides[14]!.purpose).toBe('thanks');

    const again = generateDeckGraph('AI平台建设、15页、给公司领导看');
    expect(again).toEqual(graph);

    for (const slide of graph.slides) {
      expect(textLength(slide.title ?? '')).toBeLessThanOrEqual(18);
    }
  });

  it('clamps page count below 4', () => {
    const graph = generateDeckGraph('AI平台建设、2页');
    expect(graph.slides.length).toBe(4);
  });

  it('inserts agenda only for larger decks', () => {
    const small = generateDeckGraph('AI平台建设、5页');
    expect(small.slides.some((s) => s.purpose === 'agenda')).toBe(false);

    const large = generateDeckGraph('AI平台建设、8页');
    expect(large.slides.some((s) => s.purpose === 'agenda')).toBe(true);
  });
});

describe('buildStoryboard', () => {
  it('uses deterministic ids and maps content types', () => {
    const graph = generateDeckGraph('AI平台建设、10页');
    const storyboard = buildStoryboard(graph);
    expect(storyboard.slides[0]!.id).toBe('sb0');
    expect(storyboard.slides[1]!.id).toBe('sb1');

    const architecture = storyboard.slides.find((s) => s.purpose === 'architecture')!;
    expect(architecture.contentType).toBe('diagram');
    const kpi = storyboard.slides.find((s) => s.purpose === 'kpi')!;
    expect(kpi.contentType).toBe('data');
    const cover = storyboard.slides.find((s) => s.purpose === 'cover')!;
    expect(cover.contentType).toBe('text');
  });
});

describe('applyStoryboardOps', () => {
  it('applies ops immutably', () => {
    const graph = generateDeckGraph('AI平台建设、6页');
    const storyboard = buildStoryboard(graph);
    const original = JSON.parse(JSON.stringify(storyboard));

    const ops: StoryboardOp[] = [
      { type: 'editMessage', index: 0, message: '新的消息' },
      { type: 'editTitle', index: 1, title: '新标题' },
      { type: 'setContentType', index: 2, contentType: 'data' },
      { type: 'reorder', from: 0, to: 2 },
      { type: 'add', index: 1, slide: { title: '插入页' } },
      { type: 'merge', indexes: [0, 1] },
      { type: 'delete', index: 3 },
    ];

    const result = applyStoryboardOps(storyboard, ops);
    expect(result).not.toBe(storyboard);
    expect(storyboard).toEqual(original);
    expect(result.slides.length).toBe(5);
    expect(result.slides.some((s) => s.message.includes('。'))).toBe(true);
    // indexes renumbered 0..n-1
    expect(result.slides.every((s, i) => s.index === i)).toBe(true);
  });
});

describe('researchFacts', () => {
  it('extracts numbers with units, terms and sentences', () => {
    const facts = researchFacts('数据标注平台完成建设，2024年同比增长32%，覆盖15个场景。');
    expect(facts.some((f) => f.kind === 'number' && f.text.includes('%'))).toBe(true);
    expect(facts.some((f) => f.kind === 'term' && f.text.length >= 4 && f.text.length <= 8)).toBe(true);
    expect(facts.some((f) => f.kind === 'sentence' && /\d/.test(f.text))).toBe(true);
    expect(facts.every((f) => f.sourceId === 'src_prompt_0')).toBe(true);
  });
});

describe('buildSlideFromStoryItem', () => {
  const themeId = 'jkinco-blue';
  const graph = generateDeckGraph('AI平台建设、12页');
  const storyboard = buildStoryboard(graph);

  for (const purpose of ['cover', 'architecture', 'kpi', 'data_story', 'summary', 'thanks'] as const) {
    it(`builds a valid ${purpose} slide`, () => {
      const item = storyboard.slides.find((s) => s.purpose === purpose)!;
      const slide = buildSlideFromStoryItem(item, themeId, { index: item.index, total: storyboard.slides.length });
      expect(validateSlide(slide)).toEqual([]);
      expect(slide.elements.length).toBeLessThanOrEqual(30);
      expect(checkDensityGate(slide).score).toBeLessThan(85);
      expect(textLength(slide.name ?? '')).toBeLessThanOrEqual(18);
    });
  }
});

describe('GenerationPipeline', () => {
  it('runs through all four stages and produces a complete deck', async () => {
    const pipeline = new GenerationPipeline();
    const events: unknown[] = [];
    for await (const event of pipeline.run('AI平台建设、6页')) {
      events.push(event);
    }

    const stages = events.filter((e) => (e as { type: string }).type === 'stage').map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(['researching', 'story', 'designing', 'checking']);

    const storyboards = events.filter((e) => (e as { type: string }).type === 'storyboard');
    expect(storyboards.length).toBe(1);

    const slideReadys = events.filter((e) => (e as { type: string }).type === 'slideReady');
    expect(slideReadys.length).toBe(6);
    expect((slideReadys[0] as { total: number }).total).toBe(6);

    const done = events.find((e) => (e as { type: string }).type === 'done') as { deck: { slides: Array<object> } };
    expect(done.deck.slides.length).toBe(6);
    for (const slide of done.deck.slides) {
      expect(validateSlide(slide as never)).toEqual([]);
    }
  });

  it('cancels mid-run and yields a partial deck', async () => {
    const pipeline = new GenerationPipeline();
    const events: unknown[] = [];
    for await (const event of pipeline.run('AI平台建设、8页')) {
      events.push(event);
      if ((event as { type: string }).type === 'slideReady' && (event as { index: number }).index === 1) {
        pipeline.cancel();
      }
    }
    const done = events.find((e) => (e as { type: string }).type === 'done') as { deck: { slides: Array<object> } };
    expect(done.deck.slides.length).toBeLessThan(8);
    expect(done.deck.slides.length).toBe(2);
  });
});
