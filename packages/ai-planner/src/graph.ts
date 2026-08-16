import type { SlideIntent, SlidePurpose } from '@jkinco/scene-schema';
import { textLength } from '@jkinco/scene-schema';

/**
 * Deck Graph (§4.2). The model produces STRUCTURE first — a flat, deterministic
 * page plan — and never touches coordinates. Coordinates are the layout
 * engine's job later in the pipeline.
 */
export interface DeckGraphSlide {
  purpose: SlidePurpose;
  message: string;
  intent?: SlideIntent;
  title?: string;
}

export interface DeckGraph {
  deckGoal: string;
  audience: string;
  pageCount: number;
  slides: DeckGraphSlide[];
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  kind: 'audience' | 'duration' | 'styleDna' | 'language';
  options: string[];
}

export interface ParsedPrompt {
  topic: string;
  pageCount?: number;
  audience?: string;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Stopwords / audience mapping
// ---------------------------------------------------------------------------

const STOPWORDS = [
  '进行',
  '完成',
  '相关',
  '通过',
  '以及',
  '主要',
  '我们',
  '一个',
  '的',
  '了',
  '和',
  '与',
  '及',
  '对',
  '为',
  '在',
  '是',
];

const STOPWORD_RE = new RegExp(`(${STOPWORDS.join('|')})`, 'g');

const AUDIENCE_KEYWORDS: Array<[RegExp, string]> = [
  [/领导|管理层|高管|领导层/, '公司领导层'],
  [/客户|甲方/, '客户'],
  [/专家|评审|评委/, '技术评审专家'],
  [/团队|同事|内部/, '团队内部'],
  [/政府|政务|公共部门/, '政府'],
];

/** Truncate a string to `max` content units (CJK = 1, latin = 0.55) per §5. */
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

// ---------------------------------------------------------------------------
// parsePrompt
// ---------------------------------------------------------------------------

export function parsePrompt(prompt: string): ParsedPrompt {
  const trimmed = prompt.trim();

  // Page count: 15页 / 15页数 / 15 Page / Page 15
  let pageCount: number | undefined;
  const pageMatch =
    /(\d+)\s*页/.exec(trimmed) ??
    /(\d+)\s*页数/.exec(trimmed) ??
    /(\d+)\s*[Pp]ages?/.exec(trimmed) ??
    /[Pp]ages?\s*(\d+)/.exec(trimmed);
  if (pageMatch && pageMatch[1]) pageCount = parseInt(pageMatch[1], 10);

  // Audience
  let audience: string | undefined;
  for (const [re, label] of AUDIENCE_KEYWORDS) {
    if (re.test(trimmed)) {
      audience = label;
      break;
    }
  }

  // Topic: first sentence, else text before 、, else whole prompt.
  let topic = trimmed;
  const sentenceEnd = trimmed.search(/[。！？!?]/);
  if (sentenceEnd > 0) topic = trimmed.slice(0, sentenceEnd).trim();
  else {
    const dun = trimmed.indexOf('、');
    if (dun > 0) topic = trimmed.slice(0, dun).trim();
  }

  // Keywords: CJK words (length ≥ 2) with frequency, excluding stopwords.
  const keywords = extractKeywords(trimmed);

  return { topic, pageCount, audience, keywords };
}

function extractKeywords(prompt: string): string[] {
  const cleaned = prompt.replace(STOPWORD_RE, ' ');
  const segments = cleaned.split(/[^\u4e00-\u9fff]+/);
  const freq = new Map<string, number>();
  for (const seg of segments) {
    if (seg.length < 2) continue;
    freq.set(seg, (freq.get(seg) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0].length - b[0].length) || a[0].localeCompare(b[0]))
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// askClarifyingQuestions
// ---------------------------------------------------------------------------

export function askClarifyingQuestions(prompt: string): ClarifyingQuestion[] {
  const { audience } = parsePrompt(prompt);
  const questions: ClarifyingQuestion[] = [];

  if (!audience) {
    questions.push({
      id: 'q_audience',
      question: '这次汇报主要面向哪类听众？',
      kind: 'audience',
      options: ['公司领导层', '技术评审专家', '客户', '团队内部'],
    });
  }

  questions.push({
    id: 'q_duration',
    question: '预计演讲时长是多少？',
    kind: 'duration',
    options: ['5分钟', '10分钟', '20分钟', '30分钟'],
  });

  questions.push({
    id: 'q_style',
    question: '希望采用哪种视觉风格？',
    kind: 'styleDna',
    options: ['沿用公司 Style DNA', '标准商务', '科研风格'],
  });

  return questions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// generateDeckGraph
// ---------------------------------------------------------------------------

const MIDDLE_QUEUE: SlidePurpose[] = [
  'situation',
  'architecture',
  'process',
  'kpi',
  'data_story',
  'comparison',
  'quote',
  'summary',
  'content',
];

function buildMiddle(count: number): SlidePurpose[] {
  const out: SlidePurpose[] = [];
  for (let i = 0; i < count; i++) {
    out.push(i < MIDDLE_QUEUE.length ? MIDDLE_QUEUE[i]! : 'content');
  }
  return out;
}

function intentForPurpose(purpose: SlidePurpose): SlideIntent {
  switch (purpose) {
    case 'architecture':
      return 'architecture';
    case 'process':
      return 'process';
    case 'kpi':
      return 'kpi';
    case 'data_story':
      return 'data_story';
    case 'comparison':
      return 'compare';
    case 'quote':
      return 'quote';
    case 'summary':
      return 'summary';
    default:
      return 'explain';
  }
}

function messageFor(purpose: SlidePurpose, topic: string): string {
  switch (purpose) {
    case 'cover':
      return fitBudget(topic, 18);
    case 'agenda':
      return '汇报提纲';
    case 'situation':
      return `当前${topic}面临的关键背景与挑战`;
    case 'architecture':
      return `${topic}总体架构`;
    case 'process':
      return '实施路径与关键节点';
    case 'kpi':
      return '核心指标一览';
    case 'data_story':
      return '数据洞察与结论';
    case 'comparison':
      return '方案对比分析';
    case 'quote':
      return '关键结论';
    case 'summary':
      return '下一步行动';
    case 'thanks':
      return '谢谢聆听';
    default:
      return topic;
  }
}

export function generateDeckGraph(
  prompt: string,
  opts: { audience?: string; pageCount?: number; answers?: Record<string, string> } = {},
): DeckGraph {
  const parsed = parsePrompt(prompt);
  const topic = parsed.topic || '未命名汇报';

  let pageCount = opts.pageCount ?? parsed.pageCount ?? 10;
  if (!Number.isFinite(pageCount) || pageCount < 4) pageCount = 4;
  pageCount = Math.max(4, Math.floor(pageCount));

  let audience = opts.audience ?? parsed.audience ?? '';
  if (!audience && opts.answers) {
    const key = Object.keys(opts.answers).find((k) => /audience/i.test(k));
    if (key && opts.answers[key]) audience = opts.answers[key]!;
  }

  const middle = buildMiddle(pageCount - 2);
  if (pageCount >= 7) {
    // agenda takes the second middle slot, dropping the last to keep the count.
    middle.splice(1, 0, 'agenda');
    middle.pop();
  }

  const purposes: SlidePurpose[] = ['cover', ...middle, 'thanks'];
  const slides: DeckGraphSlide[] = purposes.map((purpose) => {
    const message = messageFor(purpose, topic);
    return {
      purpose,
      message,
      intent: intentForPurpose(purpose),
      title: fitBudget(message, 18),
    };
  });

  const deckGoal = audience ? `面向${audience}的${topic}汇报` : `${topic}汇报`;

  return { deckGoal, audience, pageCount: purposes.length, slides };
}

export { fitBudget };
