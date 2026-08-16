import type { RichText } from '@jkinco/scene-schema';
import { textFromLines, textFromPlain, textToPlain } from '@jkinco/scene-schema';
import { compressText, executiveTitle, truncateToBudget } from '@jkinco/rich-text';

/**
 * Shorten text: compress fillers, then enforce the budget. When the compressed
 * result still exceeds the budget and has ≥2 sentences, drop the last sentence
 * (a more aggressive but still meaning-preserving cut).
 */
export function shortenText(text: RichText, budget = 40): RichText {
  let plain = textToPlain(compressText(text));
  const sentences = plain.split(/(?<=[。；;！？!?])/);
  if (plain.length > budget && plain.length > 12 && sentences.length >= 2) {
    const dropped = sentences.slice(0, -1).join('').replace(/[，、；;:：]$/, '');
    if (dropped.length > 0) plain = dropped;
  }
  return truncateToBudget(plain, budget);
}

/**
 * Rewrite tone deterministically:
 * - executive: strip casual particles, end assertively with 。
 * - academic: 我们 → 本研究, 我 → 笔者, ensure an analysis phrase.
 * - clearer: split over-long sentences into bullet items.
 */
export function rewriteTone(text: RichText, tone: 'executive' | 'academic' | 'clearer'): RichText {
  const plain = textToPlain(text);

  switch (tone) {
    case 'executive': {
      let out = plain.replace(/[了吧呢]/g, '');
      out = out.replace(/[！!]+$/g, '。');
      if (!/[。！？!?]$/.test(out)) out += '。';
      return textFromPlain(out);
    }
    case 'academic': {
      let out = plain.replace(/我们/g, '本研究').replace(/我/g, '笔者');
      if (!out.includes('分析')) out += '。随后进行了分析';
      return textFromPlain(out);
    }
    case 'clearer': {
      const sentences = plain.split(/(?<=[。；;！？!?])/).map((s) => s.trim()).filter(Boolean);
      const parts: string[] = [];
      for (const sentence of sentences) {
        if (sentence.length > 30) {
          const chunks = sentence
            .split(/[，,、]/)
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
          parts.push(...chunks);
        } else {
          parts.push(sentence);
        }
      }
      if (parts.length > 1) return textFromLines(parts.map((p) => `- ${p}`));
      return textFromPlain(parts[0] ?? plain);
    }
  }
}

/** Make a title more executive and clamp to a short budget. */
export function betterTitle(text: RichText, budget = 18): RichText {
  return textFromPlain(executiveTitle(textToPlain(text), budget));
}
