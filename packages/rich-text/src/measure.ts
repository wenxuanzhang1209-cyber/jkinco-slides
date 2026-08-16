import type { Paragraph, RichText, Run, TextAlign } from '@jkinco/scene-schema';
import { textFromPlain, textToPlain } from '@jkinco/scene-schema';

export interface FontMetrics {
  fontSize: number;
  fontFamily?: string;
  lineHeight: number; // multiplier
  boxWidth: number;
  boxHeight: number;
  letterSpacing?: number;
}

export interface MeasureResult {
  /** Number of wrapped lines. */
  lines: number;
  /** Total text height (pt). */
  height: number;
  /** Estimated max natural (unwrapped) width per paragraph. */
  maxLineWidth: number;
  /** True when wrapped height exceeds the box height. */
  overflow: boolean;
  /** True when a single unbreakable token is wider than the box. */
  hardOverflow: boolean;
  /** Per-paragraph line counts. */
  perParagraph: number[];
}

const CJK_RE = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uac00-\ud7af]/;

/** Estimated width of a single character (pt). CJK ≈ fontSize; latin ≈ 0.55×fontSize. */
export function charWidth(ch: string, fontSize: number): number {
  if (CJK_RE.test(ch)) return fontSize;
  if (ch === ' ' || ch === '\t') return fontSize * 0.32;
  if (/[0-9]/.test(ch)) return fontSize * 0.58;
  if (/[A-Z]/.test(ch)) return fontSize * 0.72;
  if (/[a-z]/.test(ch)) return fontSize * 0.56;
  return fontSize * 0.55;
}

/** Width of a whole plain string (no wrapping). */
export function stringWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, fontSize);
  return w;
}

/** Tokenize for wrapping: CJK chars wrap per char; latin groups wrap per word. */
export function wrapTokens(paragraph: Paragraph): string[] {
  const plain = paragraph.runs.map((r) => r.text).join('');
  const tokens: string[] = [];
  let buffer = '';
  let bufferIsCjk: boolean | null = null;
  const flush = () => {
    if (buffer.length > 0) tokens.push(buffer);
    buffer = '';
    bufferIsCjk = null;
  };
  for (const ch of plain) {
    const isCjk = CJK_RE.test(ch);
    const isSpace = ch === ' ' || ch === '\t';
    if (isSpace) {
      flush();
      tokens.push(' ');
      continue;
    }
    if (bufferIsCjk !== null && bufferIsCjk !== isCjk) flush();
    bufferIsCjk = isCjk;
    buffer += ch;
  }
  flush();
  return tokens;
}

/** Measure a rich text block inside a box. */
export function measureText(text: RichText | undefined | null, metrics: Omit<FontMetrics, 'boxHeight' | 'boxWidth'> & { boxWidth: number; boxHeight?: number }): MeasureResult {
  const paragraphs = text?.paragraphs ?? [];
  const fontSize = metrics.fontSize;
  const lineHeight = metrics.lineHeight * fontSize;
  const boxWidth = Math.max(metrics.boxWidth, 1);
  const boxHeight = metrics.boxHeight ?? Infinity;
  const perParagraph: number[] = [];
  let lines = 0;
  let maxLineWidth = 0;
  let hardOverflow = false;

  for (const p of paragraphs) {
    const indent = (p.indent ?? 0) * (p.bullet ? 18 : 0) + (p.bullet ? 18 : 0);
    const avail = boxWidth - indent;
    const tokens = wrapTokens(p);
    let paraLines = 1;
    let lineWidth = 0;
    for (const token of tokens) {
      const tokenW = token === ' ' ? 0 : stringWidth(token, fontSize);
      if (token === ' ' && lineWidth === 0) continue; // skip leading spaces
      if (token === ' ') {
        const spaceW = charWidth(' ', fontSize);
        if (lineWidth + spaceW > avail && lineWidth > 0) {
          paraLines += 1;
          lineWidth = 0;
        } else {
          lineWidth += spaceW;
        }
        continue;
      }
      if (lineWidth + tokenW > avail && lineWidth > 0) {
        paraLines += 1;
        lineWidth = 0;
      }
      if (tokenW > avail) hardOverflow = true;
      // Long CJK token that itself exceeds width: split it.
      let remaining = token;
      let offset = 0;
      while (stringWidth(remaining, fontSize) > avail && avail > fontSize) {
        // find how many chars fit
        let w = 0;
        let i = 0;
        for (const ch of remaining) {
          const cw = charWidth(ch, fontSize);
          if (w + cw > avail) break;
          w += cw;
          i += 1;
        }
        if (i === 0) break;
        paraLines += 1;
        offset += i;
        remaining = remaining.slice(i);
      }
      void offset;
      lineWidth += stringWidth(remaining, fontSize);
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }
    perParagraph.push(paraLines);
    lines += paraLines;
  }

  const spacingBefore = paragraphs.reduce((acc, p) => acc + (p.spacingBefore ?? 0), 0);
  const height = lines * lineHeight + spacingBefore;
  return {
    lines,
    height,
    maxLineWidth,
    overflow: height > boxHeight,
    hardOverflow,
    perParagraph,
  };
}

/** Estimate the max font size that fits the text into the box (shrink-only). */
export function maxFontSizeThatFits(text: RichText, boxWidth: number, boxHeight: number, startFontSize: number, lineHeight: number): number {
  let size = startFontSize;
  // Binary search: fonts shrink monotonically reduce height.
  let lo = 1;
  let hi = startFontSize;
  const fits = (fs: number) => {
    const m = measureText(text, { fontSize: fs, lineHeight, boxWidth, boxHeight });
    return !m.overflow && !m.hardOverflow;
  };
  if (fits(startFontSize)) return startFontSize;
  while (lo < hi - 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}

export interface AutofitResult {
  fits: boolean;
  /** Suggested fontSize change when shrink is the ONLY remaining option (§5.3 step 5). */
  suggestedFontSize?: number;
  /** How many lines overflow. */
  overflowLines: number;
}

/**
 * §5.3 — AI must never silently shrink fonts to fix overflow.
 * The system enforces the fixed resolution order:
 *   1. compress text → 2. restructure → 3. re-layout → 4. split slide → 5. font shrink (last).
 * This function only answers the last-resort question and reports overflow so
 * the planner can walk the earlier steps first.
 */
export function checkAutofit(text: RichText, boxWidth: number, boxHeight: number, fontSize: number, lineHeight = 1.4): AutofitResult {
  const m = measureText(text, { fontSize, lineHeight, boxWidth, boxHeight });
  if (!m.overflow && !m.hardOverflow) return { fits: true, overflowLines: 0 };
  const suggested = maxFontSizeThatFits(text, boxWidth, boxHeight, fontSize, lineHeight);
  return {
    fits: false,
    suggestedFontSize: suggested,
    overflowLines: Math.max(0, Math.ceil((m.height - boxHeight) / (lineHeight * fontSize))),
  };
}

/** Wrap a plain string into lines at a max width (CJK per-char, latin per-word). */
export function wrapToLines(plain: string, fontSize: number, maxWidth: number): string[] {
  const tokens = wrapTokens({ runs: [{ text: plain }] });
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  const push = () => {
    if (line.trim().length > 0) lines.push(line.trim());
    line = '';
    lineW = 0;
  };
  for (const token of tokens) {
    if (token === ' ') {
      const spaceW = charWidth(' ', fontSize);
      if (lineW + spaceW > maxWidth && lineW > 0) push();
      line += ' ';
      lineW += spaceW;
      continue;
    }
    const tokenW = stringWidth(token, fontSize);
    if (tokenW > maxWidth) {
      // Split an over-long CJK token per char into its own lines.
      let w = 0;
      let chunk = '';
      for (const ch of token) {
        const cw = charWidth(ch, fontSize);
        if (w + cw > maxWidth && chunk.length > 0) {
          if (line.trim().length > 0) {
            lines.push(line.trim());
            line = '';
            lineW = 0;
          }
          lines.push(chunk);
          chunk = '';
          w = 0;
        }
        chunk += ch;
        w += cw;
      }
      if (chunk.length > 0) {
        line += chunk;
        lineW += w;
      }
      continue;
    }
    if (lineW + tokenW > maxWidth && line.trim().length > 0) push();
    line += token;
    lineW += tokenW;
  }
  push();
  return lines.length > 0 ? lines : [''];
}

/** Plain text wrap for single-line inputs (titles). */
export function wrapPlainText(plain: string, fontSize: number, maxWidth: number): string[] {
  return wrapToLines(plain, fontSize, maxWidth);
}

export { textFromPlain, textToPlain };
export type { RichText, Run, Paragraph, TextAlign };
