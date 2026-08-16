import type { Command, CommandExecutor } from '@jkinco/command-engine';
import {
  deleteElementsCommand,
  moveElementsCommand,
  updateStyleCommand,
  updateTextCommand,
} from '@jkinco/command-engine';
import type { Deck, SlideElement } from '@jkinco/scene-schema';
import { SLIDE_H, SLIDE_W, clamp } from '@jkinco/scene-schema';
import { checkAutofit, truncateToBudget } from '@jkinco/layout-engine';
import { reviewDeck } from './checks';
import type { QaIssue } from './types';

function findElement(deck: Deck, slideId: string, elementId: string): SlideElement | undefined {
  return deck.slides.find((s) => s.id === slideId)?.elements.find((e) => e.id === elementId);
}

function fontSizeOf(el: SlideElement): number | undefined {
  if (el.type === 'text') return el.style.fontSize;
  if (el.type === 'shape') return el.textStyle?.fontSize;
  return undefined;
}

/** Overflow → shrink font (last resort) or truncate text. */
function overflowFix(deck: Deck, slideId: string, el: SlideElement): Command | null {
  if (el.type !== 'text' && el.type !== 'shape') return null;
  const text = el.type === 'text' ? el.text : el.text;
  if (!text) return null;
  const budget = deck.settings.budget;
  const bodyMinFont = budget?.bodyMinFont ?? 18;
  const bodyTarget = budget?.bodyTarget ?? 80;
  const fontSize = fontSizeOf(el) ?? 22;
  const lineSpacing = el.type === 'text' ? el.style.lineSpacing ?? 1.4 : el.textStyle?.lineSpacing ?? 1.4;

  const shrinkable =
    el.type === 'text' && (el.autoFit === true || el.role === 'body' || el.role === 'bullet') && fontSize >= bodyMinFont;

  if (shrinkable) {
    const fit = checkAutofit(text, el.w, el.h, fontSize, lineSpacing);
    const suggested = fit.suggestedFontSize ?? fontSize;
    const next = Math.max(suggested, bodyMinFont);
    if (next < fontSize) {
      return updateStyleCommand(
        { slideId, id: el.id, patch: { style: { fontSize: next } } },
        { label: 'Visual QA 自动修复：缩小字号', actor: 'ai' },
      );
    }
  }

  return updateTextCommand(
    { slideId, id: el.id, text: truncateToBudget(text, bodyTarget) },
    { label: 'Visual QA 自动修复：压缩文本', actor: 'ai' },
  );
}

/** Font too small → raise to the body minimum. */
function fontRaiseFix(slideId: string, el: SlideElement): Command | null {
  if (el.type === 'text') {
    return updateStyleCommand({ slideId, id: el.id, patch: { style: { fontSize: 18 } } }, { label: 'Visual QA 自动修复：提升字号', actor: 'ai' });
  }
  if (el.type === 'shape') {
    return updateStyleCommand({ slideId, id: el.id, patch: { textStyle: { fontSize: 18 } } }, { label: 'Visual QA 自动修复：提升字号', actor: 'ai' });
  }
  return null;
}

/** Out-of-bounds → clamp back into the canvas. */
function clampFix(slideId: string, el: SlideElement): Command | null {
  const x = clamp(el.x, 0, SLIDE_W - el.w);
  const y = clamp(el.y, 0, SLIDE_H - el.h);
  if (x === el.x && y === el.y) return null;
  return moveElementsCommand({ slideId, moves: [{ id: el.id, x, y }] }, { label: 'Visual QA 自动修复：移回画布', actor: 'ai' });
}

/** Duplicate content → delete the later duplicate. */
function duplicateFix(deck: Deck, issue: QaIssue): Command | null {
  const slideId = issue.slideId;
  const ids = issue.elementIds ?? [];
  if (!slideId || ids.length < 2) return null;
  const laterId = ids[ids.length - 1]!;
  return deleteElementsCommand({ slideId, elementIds: [laterId] }, { label: 'Visual QA 自动修复：删除重复内容', actor: 'ai' });
}

/** Build real, validated command-engine commands for every auto-fixable issue. */
export function suggestFixes(deck: Deck, issues: QaIssue[]): Command[] {
  const commands: Command[] = [];
  for (const issue of issues) {
    if (issue.fix !== 'auto') continue;
    const slideId = issue.slideId;
    const elementId = issue.elementIds?.[0];
    if (!slideId) continue;

    if (issue.message.includes('重复')) {
      const cmd = duplicateFix(deck, issue);
      if (cmd) commands.push(cmd);
      continue;
    }
    if (!elementId) continue;
    const el = findElement(deck, slideId, elementId);
    if (!el) continue;

    if (issue.message.includes('溢出')) {
      const cmd = overflowFix(deck, slideId, el);
      if (cmd) commands.push(cmd);
    } else if (issue.message.includes('字号')) {
      const cmd = fontRaiseFix(slideId, el);
      if (cmd) commands.push(cmd);
    } else if (issue.message.includes('画布')) {
      const cmd = clampFix(slideId, el);
      if (cmd) commands.push(cmd);
    }
  }
  return commands;
}

/** Review the deck, apply every auto-fix as one undoable unit, count the rest as skipped. */
export function applyAutoFixes(executor: CommandExecutor, deck: Deck): { applied: number; skipped: number } {
  const report = reviewDeck(deck);
  const commands = suggestFixes(deck, report.issues);
  const skipped = report.issues.filter((i) => i.fix !== 'auto').length;
  if (commands.length === 0) return { applied: 0, skipped };
  const result = executor.applyMany(commands, { label: 'Visual QA auto-fix', actor: 'ai' });
  return result.ok ? { applied: commands.length, skipped } : { applied: 0, skipped: skipped + commands.length };
}
