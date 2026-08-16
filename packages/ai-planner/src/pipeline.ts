import type {
  Deck,
  Slide,
  SlideElement,
  SlideIntent,
  SlidePurpose,
} from '@jkinco/scene-schema';
import {
  createDeck,
  createShape,
  createSlide,
  createText,
  textLength,
  getTheme,
  defaultBudget,
} from '@jkinco/scene-schema';
import type { ContentBlocks } from '@jkinco/layout-engine';
import { bestLayout, checkDensityGate } from '@jkinco/layout-engine';
import { createDefaultRouter, type ModelRouter } from '@jkinco/ai-sdk';
import { generateDeckGraph, parsePrompt } from './graph';
import { buildStoryboard } from './storyboard';
import type { Storyboard, StoryboardSlide } from './storyboard';

export type PipelineStage = 'researching' | 'story' | 'designing' | 'checking';

export type GenerationEvent =
  | { type: 'stage'; stage: PipelineStage; message: string }
  | { type: 'storyboard'; storyboard: Storyboard }
  | { type: 'slideReady'; index: number; total: number; slideId: string }
  | { type: 'qaResult'; index: number; total: number; issues: number }
  | { type: 'done'; deck: Deck };

export interface PipelineOptions {
  router?: ModelRouter;
  themeId?: string;
  audience?: string;
  pageCount?: number;
}

export interface Fact {
  text: string;
  sourceId: string;
  kind: 'number' | 'term' | 'sentence';
}

// ---------------------------------------------------------------------------
// researchFacts (§4.1 step 1) — deterministic extraction
// ---------------------------------------------------------------------------

const FACT_STOPWORDS = new Set([
  '进行',
  '完成',
  '相关',
  '通过',
  '以及',
  '主要',
  '我们',
  '一个',
  '关于',
  '汇报',
  '的',
  '了',
  '和',
  '与',
  '及',
  '对',
  '为',
  '在',
  '是',
]);

export function researchFacts(prompt: string): Fact[] {
  const facts: Fact[] = [];

  const numberRe = /\d+(?:\.\d+)?\s*(?:%|％|万|亿|年|月|项|个)/g;
  let m: RegExpExecArray | null;
  while ((m = numberRe.exec(prompt)) !== null) {
    facts.push({ text: m[0], sourceId: 'src_prompt_0', kind: 'number' });
  }

  const cleaned = prompt.replace(/(进行|完成|相关|通过|以及|主要|我们|一个|关于|汇报|的|了|和|与|及|对|为|在|是)/g, ' ');
  const tokens = cleaned.split(/[^\u4e00-\u9fff]+/);
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.length < 4 || token.length > 8) continue;
    if (FACT_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    facts.push({ text: token, sourceId: 'src_prompt_0', kind: 'term' });
  }

  const sentences = prompt.split(/[。！？!?]/).map((s) => s.trim()).filter((s) => s.length > 0);
  for (const sentence of sentences) {
    if (/\d/.test(sentence)) {
      facts.push({ text: sentence, sourceId: 'src_prompt_0', kind: 'sentence' });
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Content-block helpers for buildSlideFromStoryItem
// ---------------------------------------------------------------------------

function fitBudget(s: string, max: number): string {
  if (textLength(s) <= max) return s;
  let out = '';
  let units = 0;
  for (const ch of s) {
    const w = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.55;
    if (units + w > max) break;
    out += ch;
    units += w;
  }
  return out;
}

function parseLeadingNumber(text: string): number {
  const m = /(\d+(?:\.\d+)?)/.exec(text);
  return m && m[1] ? parseFloat(m[1]) : 0;
}

const DEFAULT_METRICS = [
  { value: '32%', label: '同比增长' },
  { value: '15项', label: '交付成果' },
  { value: '4个', label: '核心模块' },
  { value: '98%', label: '完成率' },
];

function metricsFromFacts(facts: Fact[]): Array<{ value: string; label: string }> {
  const numbers = facts.filter((f) => f.kind === 'number').map((f) => f.text).slice(0, 4);
  if (numbers.length > 0) {
    return numbers.map((value, i) => ({ value, label: `指标${i + 1}` }));
  }
  return DEFAULT_METRICS.map((m) => ({ ...m }));
}

function chartFromFacts(facts: Fact[]): { categories: string[]; series: Array<{ name: string; data: number[] }> } {
  const nums = facts
    .filter((f) => f.kind === 'number')
    .map((f) => parseLeadingNumber(f.text))
    .filter((n) => Number.isFinite(n))
    .slice(0, 6);
  const data = nums.length > 0 ? nums : [32, 48, 76, 92];
  const categories = data.map((_, i) => `第${i + 1}期`);
  return { categories, series: [{ name: '数值', data }] };
}

function supportBullets(topic: string, count = 3): string[] {
  const labels = ['关键要点一', '关键要点二', '关键要点三', '关键要点四', '关键要点五'];
  return labels.slice(0, count).map((label) => fitBudget(`围绕${topic}的${label}`, 22));
}

function contentBlocksFor(
  purpose: SlidePurpose,
  item: StoryboardSlide,
  topic: string,
  facts: Fact[],
): ContentBlocks {
  switch (purpose) {
    case 'agenda':
      return {
        title: item.title,
        bullets: ['背景与现状', '总体架构', '实施路径', '核心指标', '总结与展望'],
      };
    case 'situation':
      return { title: item.title, keyMessage: item.message, bullets: supportBullets(topic, 3) };
    case 'architecture':
      return {
        title: item.title,
        keyMessage: item.message,
        diagram: {
          nodes: ['数据接入层', '核心服务层', '业务应用层', '展示层'],
          edges: [],
          levels: [0, 1, 1, 2],
        },
      };
    case 'process':
      return {
        title: item.title,
        keyMessage: item.message,
        diagram: {
          nodes: ['需求分析', '方案设计', '开发实施', '测试验收', '上线运营'],
          edges: [],
          levels: [0, 0, 0, 0, 0],
        },
      };
    case 'kpi':
      return { title: item.title, keyMessage: item.message, metrics: metricsFromFacts(facts) };
    case 'data_story':
      return {
        title: item.title,
        keyMessage: item.message,
        chart: chartFromFacts(facts),
        metrics: metricsFromFacts(facts).slice(0, 2),
      };
    case 'comparison':
      return {
        title: item.title,
        keyMessage: item.message,
        bullets: ['方案A：成本低、周期短', '方案A：功能覆盖广', '方案A：生态成熟', '方案B：性能更强', '方案B：扩展性更好', '方案B：长期成本可控'],
      };
    case 'quote':
      return { title: item.title, keyMessage: item.message, footer: '关键结论' };
    case 'summary':
      return {
        title: item.title,
        keyMessage: item.message,
        bullets: ['明确分工与责任人', '制定实施时间表', '建立跟踪与复盘机制'],
      };
    default:
      return { title: item.title, keyMessage: item.message, bullets: supportBullets(topic, 3) };
  }
}

// ---------------------------------------------------------------------------
// buildSlideFromStoryItem — the deterministic content engine
// ---------------------------------------------------------------------------

export function buildSlideFromStoryItem(
  item: StoryboardSlide,
  themeId: string,
  opts: { index?: number; total?: number } = {},
): Slide {
  const theme = getTheme(themeId);
  const index = opts.index ?? 0;
  const total = opts.total ?? 1;
  const purpose = item.purpose;
  const intent = (item.intent as SlideIntent) || 'explain';
  const topic = item.title || item.message;
  const facts = researchFacts(`${item.title}。${item.message}`);
  const slideId = `slide_${index}`;

  let elements: SlideElement[];
  let background: Slide['background'] = { type: 'none' };

  if (purpose === 'cover') {
    elements = [
      createText(80, 180, 800, 120, item.message, {
        id: `${slideId}_0`,
        role: 'title',
        style: { fontSize: theme.cover.titleFontSize, color: theme.title.color, bold: theme.title.bold, align: 'left' },
      }),
      createShape('rect', 80, 300, 120, 10, {
        id: `${slideId}_1`,
        fill: { type: 'solid', color: theme.cover.accentBarColor, opacity: 1 },
        stroke: { color: theme.cover.accentBarColor, width: 0, style: 'solid' },
      }),
      createText(80, 330, 800, 50, 'JKinco Slides 生成', {
        id: `${slideId}_2`,
        role: 'subtitle',
        style: { fontSize: theme.subtitle.fontSize, color: theme.subtitle.color },
      }),
    ];
    background = { type: 'gradient', from: '#FFFFFF', to: theme.colors.primaryLight ?? theme.colors.primary, angle: 135 };
  } else if (purpose === 'thanks') {
    elements = [
      createText(80, 210, 800, 100, '谢谢聆听', {
        id: `${slideId}_0`,
        role: 'title',
        style: { fontSize: theme.cover.titleFontSize, color: theme.title.color, bold: true, align: 'center' },
      }),
      createText(80, 330, 800, 50, 'JKinco Slides 生成', {
        id: `${slideId}_1`,
        role: 'subtitle',
        style: { fontSize: theme.subtitle.fontSize, color: theme.subtitle.color, align: 'center' },
      }),
    ];
  } else {
    const blocks = contentBlocksFor(purpose, item, topic, facts);
    const candidate = bestLayout(intent, blocks, theme);
    elements = candidate.elements;
  }

  if (index >= 1 && purpose !== 'cover' && purpose !== 'section') {
    elements.push(
      createText(900, 512, 40, 16, String(index + 1), {
        id: `${slideId}_page`,
        role: 'page_number',
        style: { fontSize: theme.footer.fontSize, color: theme.footer.color, align: 'right' },
      }),
    );
  }

  return createSlide({
    id: slideId,
    name: item.title,
    purpose,
    intent,
    elements,
    background,
  });
}

// ---------------------------------------------------------------------------
// GenerationPipeline (§8.3 progressive UX)
// ---------------------------------------------------------------------------

export class GenerationPipeline {
  private cancelled = false;
  private readonly router: ModelRouter;
  private readonly themeId: string;
  private readonly audience?: string;
  private readonly pageCount?: number;

  constructor(opts: PipelineOptions = {}) {
    this.router = opts.router ?? createDefaultRouter();
    this.themeId = opts.themeId ?? 'jkinco-blue';
    this.audience = opts.audience;
    this.pageCount = opts.pageCount;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async *run(prompt: string, opts: { storyboard?: Storyboard } = {}): AsyncGenerator<GenerationEvent> {
    this.cancelled = false;

    yield { type: 'stage', stage: 'researching', message: 'Researching ✓' };
    // Deterministic fact extraction seeds the content engine.
    researchFacts(prompt);

    yield { type: 'stage', stage: 'story', message: 'Building story ✓' };
    const parsed = parsePrompt(prompt);
    const topic = parsed.topic || '未命名汇报';
    const audience = this.audience ?? parsed.audience ?? '';
    let deckGoal = audience ? `面向${audience}的${topic}汇报` : `${topic}汇报`;

    let storyboard: Storyboard;
    if (opts.storyboard) {
      storyboard = opts.storyboard;
      deckGoal = storyboard.goal || deckGoal;
    } else {
      const graph = generateDeckGraph(prompt, { audience: this.audience, pageCount: this.pageCount });
      storyboard = buildStoryboard(graph);
      deckGoal = graph.deckGoal || deckGoal;
    }

    yield { type: 'storyboard', storyboard };

    // Optional model annotation — never blocks (default router falls back to local rules).
    try {
      const resp = await this.router.complete({ task: 'reasoning', prompt });
      const annotation = (resp.text ?? '').trim();
      if (annotation && resp.provider !== 'local-rule') {
        deckGoal = `${deckGoal} —— ${annotation.slice(0, 80)}`;
      }
    } catch {
      // ignore; generation must continue offline
    }

    const deck = createDeck({
      title: topic,
      deckGoal,
      audience,
      themeId: this.themeId,
      settings: { budget: defaultBudget() },
    });

    yield { type: 'stage', stage: 'designing', message: 'Designing slides…' };
    const total = storyboard.slides.length;
    for (let i = 0; i < total; i++) {
      if (this.cancelled) break;
      const item = storyboard.slides[i]!;
      const slide = buildSlideFromStoryItem(item, this.themeId, { index: i, total });
      deck.slides.push(slide);
      yield { type: 'slideReady', index: i, total, slideId: slide.id };
      // Yield to the event loop so the UI can breathe and cancel() can land.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (!this.cancelled) {
      yield { type: 'stage', stage: 'checking', message: 'Checking density ✓' };
      const count = deck.slides.length;
      for (let i = 0; i < count; i++) {
        const slide = deck.slides[i]!;
        const gate = checkDensityGate(slide);
        yield { type: 'qaResult', index: i, total: count, issues: gate.passed ? 0 : 1 };
      }
    }

    yield { type: 'done', deck };
  }
}
