import type {
  Deck,
  RichText,
  Slide,
  SlideElement,
  SlideIntent,
  Theme,
} from '@jkinco/scene-schema';
import {
  SLIDE_H,
  SLIDE_W,
  createConnector,
  createShape,
  createText,
  textFromPlain,
  textLength,
  textToPlain,
  getTheme,
} from '@jkinco/scene-schema';
import type { Command } from '@jkinco/command-engine';
import {
  applyLayoutCommand,
  createElementsCommand,
  deleteElementsCommand,
  splitSlideCommand,
  updateStyleCommand,
  updateTextCommand,
} from '@jkinco/command-engine';
import type { ContentBlocks, LayoutPattern } from '@jkinco/layout-engine';
import { bestLayout, planLayouts } from '@jkinco/layout-engine';
import { translateToEnglishBasic, truncateToBudget } from '@jkinco/rich-text';
import { detectIntent } from './intent';
import { betterTitle, rewriteTone, shortenText } from './text-ops';

export type AiScope = 'object' | 'selection' | 'slide' | 'selectedSlides' | 'section' | 'deck';

export interface AiEditRequest {
  deck: Deck;
  scope: AiScope;
  targetIds: string[];
  slideId?: string;
  instruction: string;
}

export interface AiEditResult {
  commands: Command[];
  label: string;
  explanation: string;
}

export interface AlternativeVariant {
  id: string;
  label: 'Executive' | 'Visual' | 'Technical';
  commands: Command[];
}

const INTENT_LABELS: Record<string, string> = {
  shorten: '精简文字',
  executive: '转为高管语气',
  academic: '转为学术语气',
  clearer: '让表达更清晰',
  translate: '翻译为英文',
  visual: '可视化',
  reduceText: '减少文字',
  relayout: '重新排版',
  alternatives: '生成备选版式',
  toTimeline: '转为时间线',
  toArchitecture: '转为架构图',
  splitSlide: '拆分页面',
  simplify: '简化图表',
  addStep: '增加步骤',
  mergeSteps: '合并步骤',
  betterTitle: '优化标题',
  addEvidence: '补充数据来源',
};

const SCOPE_LABELS: Record<AiScope, string> = {
  object: '选中对象',
  selection: '选中对象',
  slide: '当前页',
  selectedSlides: '选中页面',
  section: '当前章节',
  deck: '整份演示',
};

const EXPLANATIONS: Record<string, string> = {
  shorten: '已压缩填充词并按预算截断文字，可通过 Undo 撤销。',
  executive: '已去除口语化语气词，并将结尾改为笃定的句号。',
  academic: '已将人称调整为“本研究/笔者”并补充分析性表述。',
  clearer: '已将长句拆分为短句/项目符号，提升可读性。',
  translate: '已按基础词典将文字译为英文。',
  visual: '已把关键数字提炼为指标卡并强调重点。',
  reduceText: '已删除多余项目符号，并将超长正文截断到预算内。',
  relayout: '已依据内容重新排版，可通过 Undo 撤销。',
  alternatives: '已生成备选版式（可在变体面板中选择）。',
  toTimeline: '已将页面重新排版为时间线结构。',
  toArchitecture: '已将页面重新排版为架构结构。',
  splitSlide: '已将下半部分元素拆分到新页面。',
  simplify: '已删除冗余的图表节点（连接线已自动清理）。',
  addStep: '已在最后一个节点后新增一步。',
  mergeSteps: '已删除最后一个节点（连接线已自动清理）。',
  betterTitle: '已优化标题，使其更简洁有力。',
  addEvidence: '已在页脚补充数据来源。',
};

// ---------------------------------------------------------------------------
// Target resolution by scope (§27)
// ---------------------------------------------------------------------------

interface TargetEl {
  slideId: string;
  element: SlideElement;
}

function slideById(deck: Deck, id: string | undefined): Slide | undefined {
  if (!id) return undefined;
  return deck.slides.find((s) => s.id === id);
}

function resolveTargetSlides(deck: Deck, scope: AiScope, targetIds: string[], slideId?: string): Slide[] {
  switch (scope) {
    case 'object':
    case 'selection': {
      const slides = new Map<string, Slide>();
      for (const s of deck.slides) {
        if (s.elements.some((e) => targetIds.includes(e.id))) slides.set(s.id, s);
      }
      return [...slides.values()];
    }
    case 'slide': {
      const s = slideById(deck, slideId);
      return s ? [s] : [];
    }
    case 'selectedSlides':
      return targetIds
        .map((id) => slideById(deck, id))
        .filter((s): s is Slide => Boolean(s));
    case 'section': {
      const s = slideById(deck, slideId);
      if (!s) return [];
      const section = s.section;
      if (section === undefined) return [s];
      return deck.slides.filter((x) => x.section === section);
    }
    case 'deck':
      return deck.slides;
    default:
      return [];
  }
}

function resolveTargetElements(deck: Deck, scope: AiScope, targetIds: string[], slideId?: string): TargetEl[] {
  switch (scope) {
    case 'object':
    case 'selection': {
      const out: TargetEl[] = [];
      for (const s of deck.slides) {
        for (const e of s.elements) {
          if (targetIds.includes(e.id)) out.push({ slideId: s.id, element: e });
        }
      }
      return out;
    }
    case 'slide': {
      const s = slideById(deck, slideId);
      return s ? s.elements.map((e) => ({ slideId: s.id, element: e })) : [];
    }
    case 'selectedSlides':
      return targetIds.flatMap((id) => {
        const s = slideById(deck, id);
        return s ? s.elements.map((e) => ({ slideId: id, element: e })) : [];
      });
    case 'section':
    case 'deck': {
      const slides = resolveTargetSlides(deck, scope, targetIds, slideId);
      return slides.flatMap((s) => s.elements.map((e) => ({ slideId: s.id, element: e })));
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Content extraction / text helpers
// ---------------------------------------------------------------------------

function elementText(el: SlideElement): RichText | undefined {
  if (el.type === 'text') return el.text;
  if (el.type === 'shape') return el.text;
  return undefined;
}

function bulletTexts(slide: Slide): string[] {
  const out: string[] = [];
  for (const el of slide.elements) {
    if (el.role !== 'bullet') continue;
    const text = elementText(el);
    if (text) out.push(...textToPlain(text).split('\n').filter(Boolean));
  }
  return out;
}

function slideTitle(slide: Slide): string {
  for (const el of slide.elements) {
    if (el.role === 'title') {
      const text = elementText(el);
      if (text) {
        const plain = textToPlain(text).trim();
        if (plain) return plain;
      }
    }
  }
  return slide.name ?? '新页面';
}

function extractContentBlocks(slide: Slide): ContentBlocks {
  let title: string | undefined;
  let keyMessage: string | undefined;
  const bullets: string[] = [];
  const metrics: Array<{ value: string; label: string }> = [];

  for (const el of slide.elements) {
    const text = elementText(el);
    if (!text) continue;
    const plain = textToPlain(text);
    if (!plain.trim()) continue;

    switch (el.role) {
      case 'title':
        if (!title) title = plain;
        break;
      case 'key_message':
        if (!keyMessage) keyMessage = plain;
        break;
      case 'bullet':
        bullets.push(...plain.split('\n').filter(Boolean));
        break;
      case 'metric': {
        const lines = plain.split('\n').filter(Boolean);
        metrics.push({ value: lines[0] ?? '—', label: lines[1] ?? '指标' });
        break;
      }
      default:
        break;
    }
  }

  return {
    title,
    keyMessage,
    bullets: bullets.length > 0 ? bullets : undefined,
    metrics: metrics.length > 0 ? metrics : undefined,
  };
}

function candidatePreservesKeyMessage(
  candidate: { elements: SlideElement[] },
  keyMessage: string,
): boolean {
  return candidate.elements.some(
    (e) => e.type === 'text' && e.role === 'key_message' && textToPlain(e.text).trim() === keyMessage.trim(),
  );
}

function relayoutForSlide(deck: Deck, slide: Slide, theme: Theme): Command {
  const blocks = extractContentBlocks(slide);
  const intent: SlideIntent = slide.intent ?? 'explain';
  const candidates = planLayouts(intent, blocks, theme, { count: 3 });
  let candidate = candidates[0] ?? bestLayout(intent, blocks, theme);
  // Prefer a candidate that keeps the key message (some patterns drop it).
  if (blocks.keyMessage) {
    const preserving = candidates.find((c) => candidatePreservesKeyMessage(c, blocks.keyMessage!));
    if (preserving) candidate = preserving;
  }
  return applyLayoutCommand(
    { slideId: slide.id, layoutId: candidate.pattern, elements: candidate.elements, keepBackground: true },
    { actor: 'ai', label: 'AI 重新排版' },
  );
}

function relayoutCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  return slideIds
    .map((sid) => slideById(deck, sid))
    .filter((s): s is Slide => Boolean(s))
    .map((s) => relayoutForSlide(deck, s, theme));
}

// ---------------------------------------------------------------------------
// Intent command builders
// ---------------------------------------------------------------------------

function budgetForRole(role: SlideElement['role'], budget: Deck['settings']['budget']): number {
  if (role === 'title') return budget?.titleMax ?? 18;
  if (role === 'subtitle') return budget?.subtitleMax ?? 30;
  return budget?.bodyTarget ?? 80;
}

function buildTextCommands(
  deck: Deck,
  targets: TargetEl[],
  intent: 'shorten' | 'executive' | 'academic' | 'clearer' | 'translate',
): Command[] {
  const commands: Command[] = [];
  for (const target of targets) {
    const text = elementText(target.element);
    if (!text) continue;
    if (intent === 'shorten') {
      const budget = budgetForRole(target.element.role, deck.settings.budget);
      commands.push(
        updateTextCommand(
          { slideId: target.slideId, id: target.element.id, text: shortenText(text, budget) },
          { actor: 'ai', label: 'AI 精简文字' },
        ),
      );
    } else if (intent === 'translate') {
      commands.push(
        updateTextCommand(
          { slideId: target.slideId, id: target.element.id, text: textFromPlain(translateToEnglishBasic(text)) },
          { actor: 'ai', label: 'AI 翻译' },
        ),
      );
    } else {
      commands.push(
        updateTextCommand(
          { slideId: target.slideId, id: target.element.id, text: rewriteTone(text, intent) },
          { actor: 'ai', label: 'AI 改写语气' },
        ),
      );
    }
  }
  return commands;
}

function titleCommands(deck: Deck, targets: TargetEl[]): Command[] {
  let titles = targets.filter((t) => t.element.role === 'title' && elementText(t.element));
  if (titles.length === 0) titles = targets.filter((t) => Boolean(elementText(t.element)));
  const commands: Command[] = [];
  for (const t of titles) {
    const text = elementText(t.element);
    if (!text) continue;
    commands.push(
      updateTextCommand(
        { slideId: t.slideId, id: t.element.id, text: betterTitle(text, deck.settings.budget?.titleMax ?? 18) },
        { actor: 'ai', label: 'AI 优化标题' },
      ),
    );
  }
  return commands;
}

function trimBullets(text: RichText, max = 3): RichText {
  let seen = 0;
  const paragraphs = [];
  for (const p of text.paragraphs) {
    if (p.bullet) {
      if (seen >= max) continue;
      seen += 1;
    }
    paragraphs.push(p);
  }
  return { paragraphs };
}

function reduceTextCommands(deck: Deck, slideIds: string[]): Command[] {
  const commands: Command[] = [];
  const hard = deck.settings.budget?.bodyHard ?? 120;
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    for (const el of slide.elements) {
      const text = elementText(el);
      if (!text) continue;
      const bulletCount = text.paragraphs.filter((p) => p.bullet).length;
      if (bulletCount > 3) {
        commands.push(
          updateTextCommand({ slideId: sid, id: el.id, text: trimBullets(text, 3) }, { actor: 'ai', label: 'AI 减少文字' }),
        );
      } else if (el.role === 'body' && textLength(text) > hard) {
        commands.push(
          updateTextCommand({ slideId: sid, id: el.id, text: truncateToBudget(text, hard) }, { actor: 'ai', label: 'AI 减少文字' }),
        );
      }
    }
  }
  return commands;
}

function extractNumbers(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    const m = t.match(/\d+(?:\.\d+)?\s*(?:%|％|万|亿|项|个|倍)?/g);
    if (m) out.push(...m);
  }
  return out;
}

function visualCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const numbers = extractNumbers(bulletTexts(slide));
    if (numbers.length >= 2) {
      const values = numbers.slice(0, 4);
      const elements = values.map((value, i) =>
        createText(40 + i * 220, 420, 200, 60, textFromPlain(`${value}\n指标${i + 1}`), {
          id: `ai_metric_${sid}_${i}`,
          role: 'metric',
          style: { fontSize: 36, color: theme.colors.primary, bold: true, align: 'center' },
        }),
      );
      commands.push(
        createElementsCommand({ slideId: sid, elements }, { actor: 'ai', label: 'AI 可视化' }),
      );
      const accentTarget = slide.elements.find(
        (e) => e.type === 'text' && (e.role === 'key_message' || e.role === 'title'),
      );
      if (accentTarget) {
        commands.push(
          updateStyleCommand(
            { slideId: sid, id: accentTarget.id, patch: { style: { color: theme.colors.accent } } },
            { actor: 'ai', label: 'AI 强调重点' },
          ),
        );
      }
    } else {
      commands.push(relayoutForSlide(deck, slide, theme));
    }
  }
  return commands;
}

function splitCommands(deck: Deck, slideIds: string[]): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide || slide.elements.length <= 5) continue;
    const sorted = [...slide.elements].sort((a, b) => a.y - b.y);
    const half = Math.ceil(sorted.length / 2);
    const elementIds = sorted.slice(half).map((e) => e.id);
    commands.push(
      splitSlideCommand(
        { slideId: sid, elementIds, newTitle: `${slideTitle(slide)}（续）` },
        { actor: 'ai', label: 'AI 拆分页面' },
      ),
    );
  }
  return commands;
}

function simplifyCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const nodes = slide.elements.filter((e) => e.type === 'shape' && e.role === 'diagram_node');
    if (nodes.length <= 4) {
      commands.push(relayoutForSlide(deck, slide, theme));
      continue;
    }
    const rest = nodes.slice(4);
    const toRemove = rest.filter((_, i) => i % 2 === 0).map((e) => e.id);
    commands.push(
      deleteElementsCommand({ slideId: sid, elementIds: toRemove }, { actor: 'ai', label: 'AI 简化图表' }),
    );
  }
  return commands;
}

function addStepCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const nodes = slide.elements.filter((e) => e.type === 'shape' && e.role === 'diagram_node');
    if (nodes.length === 0) {
      commands.push(relayoutForSlide(deck, slide, theme));
      continue;
    }
    const last = nodes[nodes.length - 1]!;
    const nodeId = `ai_step_${sid}`;
    const connectorId = `ai_step_cnn_${sid}`;
    const newNode = createShape('roundRect', last.x, last.y + last.h + 24, last.w, last.h, {
      id: nodeId,
      role: 'diagram_node',
      text: textFromPlain('新增步骤'),
      textStyle: { fontSize: 16, align: 'center' },
    });
    const rawConnector = createConnector(
      { x: last.x + last.w / 2, y: last.y + last.h },
      { x: newNode.x + newNode.w / 2, y: newNode.y },
      { id: connectorId, role: 'diagram_edge', fromId: last.id, toId: nodeId },
    );
    const connector = { ...rawConnector, w: Math.max(rawConnector.w, 1), h: Math.max(rawConnector.h, 1) };
    commands.push(
      createElementsCommand({ slideId: sid, elements: [newNode, connector] }, { actor: 'ai', label: 'AI 增加步骤' }),
    );
  }
  return commands;
}

function mergeStepsCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const nodes = slide.elements.filter((e) => e.type === 'shape' && e.role === 'diagram_node');
    if (nodes.length === 0) {
      commands.push(relayoutForSlide(deck, slide, theme));
      continue;
    }
    const last = nodes[nodes.length - 1]!;
    commands.push(
      deleteElementsCommand({ slideId: sid, elementIds: [last.id] }, { actor: 'ai', label: 'AI 合并步骤' }),
    );
  }
  return commands;
}

function forcedRelayoutCommands(
  deck: Deck,
  slideIds: string[],
  theme: Theme,
  intent: SlideIntent,
  pattern: LayoutPattern,
): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const blocks = extractContentBlocks(slide);
    const candidates = planLayouts(intent, blocks, theme, { count: 3 });
    const candidate = candidates.find((c) => c.pattern === pattern) ?? candidates[0]!;
    commands.push(
      applyLayoutCommand(
        { slideId: sid, layoutId: candidate.pattern, elements: candidate.elements, keepBackground: true },
        { actor: 'ai', label: 'AI 重新排版' },
      ),
    );
  }
  return commands;
}

function evidenceCommands(deck: Deck, slideIds: string[], theme: Theme): Command[] {
  const commands: Command[] = [];
  for (const sid of slideIds) {
    const slide = slideById(deck, sid);
    if (!slide) continue;
    const bullets = bulletTexts(slide);
    const source = bullets[0] ? `数据来源：${bullets[0]}` : '数据来源：内部资料';
    commands.push(
      createElementsCommand(
        {
          slideId: sid,
          elements: [
            createText(40, 512, 600, 20, source, {
              id: `ai_source_${sid}`,
              role: 'source',
              style: { fontSize: 11, color: theme.colors.textMuted },
            }),
          ],
        },
        { actor: 'ai', label: 'AI 补充来源' },
      ),
    );
  }
  return commands;
}

// ---------------------------------------------------------------------------
// runAiEdit
// ---------------------------------------------------------------------------

export function runAiEdit(request: AiEditRequest): AiEditResult {
  const { deck, scope, targetIds, slideId, instruction } = request;
  const detected = detectIntent(instruction);
  const intent = detected.intent;
  const theme = getTheme(deck.themeId);

  const targetElements = resolveTargetElements(deck, scope, targetIds, slideId);
  const targetSlideIds = [...new Set(resolveTargetSlides(deck, scope, targetIds, slideId).map((s) => s.id))];

  let commands: Command[] = [];

  switch (intent) {
    case 'shorten':
    case 'executive':
    case 'academic':
    case 'clearer':
    case 'translate':
      commands = buildTextCommands(deck, targetElements, intent);
      break;
    case 'betterTitle':
      commands = titleCommands(deck, targetElements);
      break;
    case 'reduceText':
      commands = reduceTextCommands(deck, targetSlideIds);
      break;
    case 'visual':
      commands = visualCommands(deck, targetSlideIds, theme);
      break;
    case 'relayout':
    case 'alternatives':
      commands = relayoutCommands(deck, targetSlideIds, theme);
      break;
    case 'toTimeline':
      commands = forcedRelayoutCommands(deck, targetSlideIds, theme, 'timeline', 'timeline');
      break;
    case 'toArchitecture':
      commands = forcedRelayoutCommands(deck, targetSlideIds, theme, 'architecture', 'architecture');
      break;
    case 'splitSlide':
      commands = splitCommands(deck, targetSlideIds);
      break;
    case 'simplify':
      commands = simplifyCommands(deck, targetSlideIds, theme);
      break;
    case 'addStep':
      commands = addStepCommands(deck, targetSlideIds, theme);
      break;
    case 'mergeSteps':
      commands = mergeStepsCommands(deck, targetSlideIds, theme);
      break;
    case 'addEvidence':
      commands = evidenceCommands(deck, targetSlideIds, theme);
      break;
    default:
      commands = relayoutCommands(deck, targetSlideIds, theme);
      break;
  }

  // Never return an empty command list — fall back to relayout.
  if (commands.length === 0 && targetSlideIds.length > 0) {
    commands = relayoutCommands(deck, targetSlideIds, theme);
  }

  const intentLabel = INTENT_LABELS[intent] ?? INTENT_LABELS['relayout']!;
  const scopeLabel = SCOPE_LABELS[scope] ?? '当前页';
  const label = `AI ${intentLabel}（${scopeLabel}）`;
  const explanation = EXPLANATIONS[intent] ?? '未识别的指令，已重新排版（可用 Undo 撤销）';

  return { commands, label, explanation };
}

// ---------------------------------------------------------------------------
// generateAlternatives (§28) — same content, different structure/style
// ---------------------------------------------------------------------------

export function generateAlternatives(
  deck: Deck,
  slideId: string,
  theme: Theme,
): { variants: AlternativeVariant[] } {
  const slide = deck.slides.find((s) => s.id === slideId);
  if (!slide) return { variants: [] };
  const blocks = extractContentBlocks(slide);

  const make = (label: AlternativeVariant['label'], intent: SlideIntent, pattern: LayoutPattern): AlternativeVariant => {
    const candidates = planLayouts(intent, blocks, theme, { count: 3 });
    const candidate = candidates.find((c) => c.pattern === pattern) ?? candidates[0]!;
    let elements = candidate.elements;

    if (label === 'Executive') {
      elements = elements.map((el) =>
        el.type === 'text' && el.role === 'title' ? { ...el, style: { ...el.style, bold: true } } : el,
      );
    } else if (label === 'Visual') {
      elements = elements.map((el) =>
        el.type === 'shape' && el.role !== 'diagram_node'
          ? { ...el, fill: { ...el.fill, color: theme.colors.primaryLight } }
          : el,
      );
    } else {
      elements = elements.map((el) =>
        el.type === 'shape' ? { ...el, stroke: { ...el.stroke, width: (el.stroke.width ?? 1) + 0.5 } } : el,
      );
    }

    return {
      id: `variant_${label.toLowerCase()}`,
      label,
      commands: [
        applyLayoutCommand(
          { slideId, layoutId: candidate.pattern, elements, keepBackground: true },
          { actor: 'ai', label: `AI 变体 ${label}` },
        ),
      ],
    };
  };

  return {
    variants: [
      make('Executive', 'decide', 'hero'),
      make('Visual', 'explain', 'title-visual'),
      make('Technical', 'process', 'process'),
    ],
  };
}
