import type { Deck } from '@jkinco/scene-schema';
import { textFromPlain, textToPlain } from '@jkinco/scene-schema';
import { updateTextCommand } from '@jkinco/command-engine';
import type { Storyboard } from '@jkinco/ai-planner';
import { getEngine } from '../state/appState';
import { runAiEdit } from '@jkinco/ai-editor';
import { toast } from '@jkinco/design-system';

/** Convert the live deck into storyboard items (§9 Storyboard 切换). */
export function deckToStoryboard(deck: Deck): Storyboard {
  return {
    goal: deck.deckGoal ?? deck.title,
    audience: deck.audience ?? '听众',
    slides: deck.slides.map((slide, index) => {
      const title =
        slide.elements
          .filter((e) => e.role === 'title')
          .map((e) => textToPlain((e as { text?: never }).text ?? { paragraphs: [] }))
          .find((t) => t.trim().length > 0) ?? slide.name ?? `页面 ${index + 1}`;
      const message =
        slide.elements
          .filter((e) => e.role === 'key_message')
          .map((e) => textToPlain((e as { text?: never }).text ?? { paragraphs: [] }))
          .find((t) => t.trim().length > 0) ?? title;
      const contentType = slide.elements.some((e) => e.type === 'chart') ? 'data' : slide.elements.some((e) => e.type === 'diagram') ? 'diagram' : 'visual';
      return {
        id: slide.id,
        index,
        purpose: slide.purpose ?? 'content',
        title: title.slice(0, 18),
        message,
        contentType,
        intent: slide.intent ?? 'explain',
      };
    }),
  };
}

/**
 * Build from storyboard: message changes update the slide's key text,
 * then every slide is re-laid-out by the AI editor (§9 → §14).
 * All changes flow through commands (undoable).
 */
export function applyStoryboardBuild(board: Storyboard): number {
  const engine = getEngine();
  const deck = engine.deck;
  let changed = 0;

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i]!;
    const item = board.slides[i];
    if (!item) break;

    const titleEl = slide.elements.find((e) => e.role === 'title');
    if (titleEl && (titleEl.type === 'text' || titleEl.type === 'shape')) {
      const result = engine.executor.apply(
        updateTextCommand({ slideId: slide.id, id: titleEl.id, text: textFromPlain(item.title) }, { label: 'Storyboard 标题', actor: 'ai' }),
      );
      if (result.ok) changed++;
    }

    // Re-layout the slide with the AI editor (current live deck).
    const current = engine.deck;
    const targetIds = current.slides.find((s) => s.id === slide.id)?.elements.map((e) => e.id) ?? [];
    if (targetIds.length === 0) continue;
    const result = runAiEdit({
      deck: current,
      scope: 'slide',
      targetIds,
      slideId: slide.id,
      instruction: '优化布局',
    });
    const ok = engine.applyMany(result.commands, { label: 'AI 按 Storyboard 重排', actor: 'ai' });
    if (ok) changed++;
  }
  toast('Storyboard 已应用', { description: `AI 重排了 ${deck.slides.length} 页（可撤销）`, tone: 'success' });
  return changed;
}
