import { getEngine } from '../state/appState';
import { runAiEdit, type AiEditResult } from '@jkinco/ai-editor';

export interface AiBridgeResult {
  label: string;
  explanation: string;
}

/**
 * Bridge between the UI and the AI editor: AI edits ALWAYS flow through
 * the command executor so they are undoable, replayable and auditable (§7.2).
 */
export async function runAiRequest(opts: { instruction: string; forceScope?: 'object' | 'selection' | 'slide' | 'selectedSlides' | 'section' | 'deck' }): Promise<AiBridgeResult | null> {
  const engine = getEngine();
  const deck = engine.deck;
  const selection = engine.selection;

  const slideId = selection.slideId ?? deck.slides[0]?.id;
  const slide = deck.slides.find((s) => s.id === slideId);

  let scope: 'object' | 'selection' | 'slide' | 'selectedSlides' | 'section' | 'deck' = opts.forceScope ?? 'slide';
  let targetIds: string[] = [];

  if (!opts.forceScope) {
    if (selection.slideIds.length > 1) scope = 'selectedSlides';
    else if (selection.elementIds.length === 1) scope = 'object';
    else if (selection.elementIds.length > 1) scope = 'selection';
  }

  if (scope === 'object' || scope === 'selection') {
    targetIds = selection.elementIds;
  } else if (scope === 'slide') {
    targetIds = slide?.elements.map((e) => e.id) ?? [];
  } else if (scope === 'selectedSlides') {
    targetIds = selection.slideIds.flatMap((sid) => deck.slides.find((s) => s.id === sid)?.elements.map((e) => e.id) ?? []);
  } else if (scope === 'section') {
    const section = slide?.section;
    targetIds = deck.slides.filter((s) => s.section === section).flatMap((s) => s.elements.map((e) => e.id));
  } else {
    targetIds = deck.slides.flatMap((s) => s.elements.map((e) => e.id));
  }

  const result: AiEditResult = runAiEdit({
    deck,
    scope,
    targetIds,
    slideId,
    instruction: opts.instruction,
  });

  const ok = engine.applyMany(result.commands, { label: result.label, actor: 'ai', aiNote: opts.instruction });
  if (!ok) throw new Error('AI 生成的命令校验失败，已保持原文档不变');
  return { label: result.label, explanation: result.explanation };
}
