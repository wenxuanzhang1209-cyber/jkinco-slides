import type { SlidePurpose } from '@jkinco/scene-schema';
import type { DeckGraph } from './graph';

/**
 * Storyboard (§9): the editable outline between the Deck Graph and the final
 * slides. Ops mutate it immutably so the rail can show a live preview.
 */
export type StoryboardContentType = 'text' | 'visual' | 'data' | 'diagram';

export interface StoryboardSlide {
  id: string;
  index: number;
  purpose: SlidePurpose;
  title: string;
  message: string;
  contentType: StoryboardContentType;
  intent: string;
}

export interface Storyboard {
  goal: string;
  audience: string;
  slides: StoryboardSlide[];
}

export type StoryboardOp =
  | { type: 'reorder'; from: number; to: number }
  | { type: 'delete'; index: number }
  | { type: 'merge'; indexes: [number, number] }
  | { type: 'add'; index: number; slide: Partial<StoryboardSlide> }
  | { type: 'editMessage'; index: number; message: string }
  | { type: 'editTitle'; index: number; title: string }
  | { type: 'setContentType'; index: number; contentType: StoryboardContentType };

function contentTypeFor(purpose: SlidePurpose): StoryboardContentType {
  switch (purpose) {
    case 'cover':
    case 'quote':
    case 'summary':
    case 'thanks':
      return 'text';
    case 'architecture':
    case 'process':
      return 'diagram';
    case 'kpi':
    case 'data_story':
    case 'comparison':
      return 'data';
    default:
      return 'visual';
  }
}

export function buildStoryboard(graph: DeckGraph): Storyboard {
  const slides: StoryboardSlide[] = graph.slides.map((slide, index) => ({
    id: `sb${index}`,
    index,
    purpose: slide.purpose,
    title: slide.title ?? slide.message,
    message: slide.message,
    contentType: contentTypeFor(slide.purpose),
    intent: slide.intent ?? 'explain',
  }));
  return { goal: graph.deckGoal, audience: graph.audience, slides };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function nextId(slides: StoryboardSlide[]): string {
  let max = -1;
  for (const s of slides) {
    const m = /^sb(\d+)$/.exec(s.id);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `sb${max + 1}`;
}

function reindex(slides: StoryboardSlide[]): StoryboardSlide[] {
  return slides.map((s, i) => ({ ...s, index: i }));
}

function applyOne(slides: StoryboardSlide[], op: StoryboardOp): StoryboardSlide[] {
  switch (op.type) {
    case 'reorder': {
      if (slides.length === 0) return slides;
      const from = clamp(op.from, 0, slides.length - 1);
      const to = clamp(op.to, 0, slides.length - 1);
      const next = [...slides];
      const [moved] = next.splice(from, 1);
      if (!moved) return slides;
      next.splice(to, 0, moved);
      return next;
    }
    case 'delete': {
      const index = clamp(op.index, 0, slides.length - 1);
      return slides.filter((_, i) => i !== index);
    }
    case 'merge': {
      const a = clamp(op.indexes[0], 0, slides.length - 1);
      const b = clamp(op.indexes[1], 0, slides.length - 1);
      if (a === b || slides.length === 0) return slides;
      const first = slides[a]!;
      const second = slides[b]!;
      const merged: StoryboardSlide = {
        ...first,
        message: `${first.message}。${second.message}`,
        title: first.title,
        purpose: first.purpose,
        contentType: first.contentType,
        intent: first.intent,
      };
      const keepFirst = a < b ? a : b;
      const dropSecond = a < b ? b : a;
      const next = slides.filter((_, i) => i !== dropSecond);
      next[keepFirst] = merged;
      return next;
    }
    case 'add': {
      const index = clamp(op.index, 0, slides.length);
      const partial = op.slide ?? {};
      const slide: StoryboardSlide = {
        id: partial.id ?? nextId(slides),
        index: partial.index ?? index,
        purpose: partial.purpose ?? 'content',
        title: partial.title ?? '新页面',
        message: partial.message ?? '',
        contentType: partial.contentType ?? 'visual',
        intent: partial.intent ?? 'explain',
      };
      const next = [...slides];
      next.splice(index, 0, slide);
      return next;
    }
    case 'editMessage': {
      const index = clamp(op.index, 0, slides.length - 1);
      return slides.map((s, i) => (i === index ? { ...s, message: op.message } : s));
    }
    case 'editTitle': {
      const index = clamp(op.index, 0, slides.length - 1);
      return slides.map((s, i) => (i === index ? { ...s, title: op.title } : s));
    }
    case 'setContentType': {
      const index = clamp(op.index, 0, slides.length - 1);
      return slides.map((s, i) => (i === index ? { ...s, contentType: op.contentType } : s));
    }
    default:
      return slides;
  }
}

export function applyStoryboardOps(storyboard: Storyboard, ops: StoryboardOp[]): Storyboard {
  let slides = storyboard.slides.map((s) => ({ ...s }));
  for (const op of ops) {
    slides = reindex(applyOne(slides, op));
  }
  return { goal: storyboard.goal, audience: storyboard.audience, slides };
}
