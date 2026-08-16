import { useMemo } from 'react';
import type { Deck } from '@jkinco/scene-schema';
import { getTheme } from '@jkinco/scene-schema';
import { computeDensity } from '@jkinco/layout-engine';
import { reviewSlide } from '@jkinco/qa-engine';

export interface SlideQaState {
  density: { score: number; band: string };
  issues: Array<{ id: string; severity: string; message: string }>;
}

/**
 * Live per-slide QA (§15): recomputes on every deck change thanks to
 * structural sharing + useMemo.
 */
export function useQaReport(deck: Deck, slideId: string | null | undefined): SlideQaState {
  return useMemo(() => {
    const slide = deck.slides.find((s) => s.id === slideId);
    if (!slide) return { density: { score: 0, band: 'good' }, issues: [] };
    const theme = getTheme(deck.themeId);
    const density = computeDensity(slide);
    const issues = reviewSlide(slide, { theme });
    return {
      density: { score: density.score, band: density.band },
      issues: issues.map((i) => ({ id: i.id, severity: i.severity, message: i.message })),
    };
  }, [deck, slideId]);
}
