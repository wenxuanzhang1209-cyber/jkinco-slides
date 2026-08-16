import type { RichText, Run } from '@jkinco/scene-schema';
import { mapRuns, textFromPlain, textToPlain } from '@jkinco/scene-schema';

export type RunFormat = Partial<Pick<Run, 'bold' | 'italic' | 'underline' | 'color' | 'fontFamily' | 'fontSize'>>;

/** Apply a format to a plain-text character range [start, end). */
export function applyFormat(text: RichText, start: number, end: number, format: RunFormat): RichText {
  let offset = 0;
  return {
    paragraphs: text.paragraphs.map((p) => {
      const runs: Run[] = [];
      for (const run of p.runs) {
        const runStart = offset;
        const runEnd = offset + run.text.length;
        offset = runEnd;
        const s = Math.max(start, runStart);
        const e = Math.min(end, runEnd);
        if (e <= s) {
          runs.push(run);
          continue;
        }
        const before = run.text.slice(0, s - runStart);
        const inside = run.text.slice(s - runStart, e - runStart);
        const after = run.text.slice(e - runStart);
        const formatted = { ...run, ...format };
        if (before.length > 0) runs.push({ ...run, text: before });
        runs.push({ ...formatted, text: inside });
        if (after.length > 0) runs.push({ ...run, text: after });
      }
      return { ...p, runs };
    }),
  };
}

/** Remove a format from a range. */
export function removeFormat(text: RichText, start: number, end: number, keys: Array<keyof RunFormat>): RichText {
  let offset = 0;
  return {
    paragraphs: text.paragraphs.map((p) => {
      const runs: Run[] = [];
      for (const run of p.runs) {
        const runStart = offset;
        const runEnd = offset + run.text.length;
        offset = runEnd;
        const s = Math.max(start, runStart);
        const e = Math.min(end, runEnd);
        if (e <= s) {
          runs.push(run);
          continue;
        }
        const before = run.text.slice(0, s - runStart);
        const inside = run.text.slice(s - runStart, e - runStart);
        const after = run.text.slice(e - runStart);
        const cleaned = { ...run };
        for (const k of keys) delete (cleaned as Record<string, unknown>)[k];
        if (before.length > 0) runs.push({ ...run, text: before });
        runs.push({ ...cleaned, text: inside });
        if (after.length > 0) runs.push({ ...run, text: after });
      }
      return { ...p, runs };
    }),
  };
}

/** Merge adjacent runs with identical formatting (canonical form). */
export function mergeRuns(text: RichText): RichText {
  return {
    paragraphs: text.paragraphs.map((p) => {
      const runs: Run[] = [];
      for (const run of p.runs) {
        const prev = runs[runs.length - 1];
        if (prev) {
          const prevFmt = { bold: prev.bold, italic: prev.italic, underline: prev.underline, color: prev.color, fontFamily: prev.fontFamily, fontSize: prev.fontSize };
          const runFmt = { bold: run.bold, italic: run.italic, underline: run.underline, color: run.color, fontFamily: run.fontFamily, fontSize: run.fontSize };
          if (JSON.stringify(prevFmt) === JSON.stringify(runFmt)) {
            prev.text += run.text;
            continue;
          }
        }
        runs.push({ ...run });
      }
      return { ...p, runs };
    }),
  };
}

export function setTextAlign(text: RichText, align: 'left' | 'center' | 'right' | 'justify'): RichText {
  return { paragraphs: text.paragraphs.map((p) => ({ ...p, align })) };
}

export function toggleBullets(text: RichText, enabled: boolean): RichText {
  return { paragraphs: text.paragraphs.map((p) => ({ ...p, bullet: enabled ? true : false })) };
}

export function plainTextLength(text: RichText): number {
  return textToPlain(text).length;
}

export { mapRuns, textFromPlain, textToPlain };
