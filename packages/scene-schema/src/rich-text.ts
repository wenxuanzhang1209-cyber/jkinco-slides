import type { Paragraph, RichText, Run, TextAlign } from './types';

/** Create an empty rich text. */
export function emptyText(): RichText {
  return { paragraphs: [{ runs: [{ text: '' }] }] };
}

/** Create rich text from a plain string (single paragraph, no formatting). */
export function textFromPlain(plain: string, align?: TextAlign): RichText {
  const lines = plain.split('\n');
  return {
    paragraphs: lines.map((line) => ({
      runs: [{ text: line }],
      align,
    })),
  };
}

/** Create rich text from lines; lines starting with "- " become bullets. */
export function textFromLines(lines: string[], opts?: { align?: TextAlign; bulletChar?: string }): RichText {
  return {
    paragraphs: lines.map((line) => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('· ');
      const text = isBullet ? trimmed.replace(/^[-•·]\s+/, '') : trimmed;
      return {
        runs: [{ text }],
        align: opts?.align,
        bullet: isBullet,
        bulletChar: opts?.bulletChar ?? '•',
        spacingBefore: isBullet ? 4 : 0,
      };
    }),
  };
}

/** Flatten rich text into a plain string. */
export function textToPlain(text: RichText | undefined | null): string {
  if (!text) return '';
  return text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

/**
 * Character count for content budgets (§5).
 * Chinese: every CJK char counts 1; latin/numbers count 0.55 (they are narrower).
 * Integer math keeps the result stable across floating point edge cases.
 */
export function textLength(text: RichText | string | undefined | null): number {
  const plain = typeof text === 'string' ? text : textToPlain(text);
  let units = 0;
  for (const ch of plain.replace(/\s+/g, ' ')) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) units += 100;
    else units += 55;
  }
  return Math.round(units / 100);
}

/** Does the text contain any printable character? */
export function isEmptyText(text: RichText | undefined | null): boolean {
  return textToPlain(text).trim().length === 0;
}

/** Number of paragraphs. */
export function paragraphCount(text: RichText | undefined | null): number {
  return text?.paragraphs.length ?? 0;
}

/** Number of bullet paragraphs. */
export function bulletCount(text: RichText | undefined | null): number {
  return (text?.paragraphs ?? []).filter((p) => p.bullet).length;
}

export function setPlainText(text: RichText, plain: string, align?: TextAlign): RichText {
  const next = textFromPlain(plain, align);
  if (next.paragraphs.length > 0 && text.paragraphs.length > 0) {
    next.paragraphs[0]!.align = text.paragraphs[0]!.align ?? align;
  }
  return next;
}

/** Apply default formatting to all runs lacking it. */
export function normalizeRuns(text: RichText, style: { bold?: boolean; italic?: boolean; color?: string; fontSize?: number; fontFamily?: string }): RichText {
  return {
    paragraphs: text.paragraphs.map((p: Paragraph) => ({
      ...p,
      runs: p.runs.map((r: Run) => ({
        ...r,
        bold: r.bold ?? style.bold,
        italic: r.italic ?? style.italic,
        color: r.color ?? style.color,
        fontSize: r.fontSize ?? style.fontSize,
        fontFamily: r.fontFamily ?? style.fontFamily,
      })),
    })),
  };
}

export function mapRuns(text: RichText, fn: (run: Run) => Run): RichText {
  return { paragraphs: text.paragraphs.map((p) => ({ ...p, runs: p.runs.map(fn) })) };
}

/** Estimate wrapped line count inside a box: CJK chars wrap per char, latin per word. */
export function estimateWrappedLines(text: RichText, boxW: number, fontSize: number): number {
  const cjkW = fontSize;
  const latinW = fontSize * 0.55;
  let lines = 0;
  for (const p of text.paragraphs) {
    const plain = p.runs.map((r) => r.text).join('');
    let lineW = 0;
    let paraLines = 1;
    for (const word of plain.split(/(\s+)/)) {
      let w = 0;
      for (const ch of word) w += /[\u4e00-\u9fff]/.test(ch) ? cjkW : latinW;
      if (lineW + w > boxW && lineW > 0) {
        paraLines += 1;
        lineW = 0;
      }
      lineW += w;
    }
    lines += paraLines;
  }
  return lines;
}
