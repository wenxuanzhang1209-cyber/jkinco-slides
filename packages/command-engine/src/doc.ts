/**
 * Immutable deck document helpers. Every update returns a NEW deck sharing
 * untouched subtrees (structural sharing) — history snapshots are O(1).
 */
import type { Deck, Slide, SlideElement } from '@jkinco/scene-schema';
import { deepClone, normalizeZIndexes, sortByZIndex, uid } from '@jkinco/scene-schema';

export function getSlide(deck: Deck, slideId: string): Slide | undefined {
  return deck.slides.find((s) => s.id === slideId);
}

export function getElement(deck: Deck, slideId: string, elementId: string): SlideElement | undefined {
  return getSlide(deck, slideId)?.elements.find((e) => e.id === elementId);
}

export function updateSlide(deck: Deck, slideId: string, fn: (slide: Slide) => Slide): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => (s.id === slideId ? fn(s) : s)),
  };
}

export function updateElement(deck: Deck, slideId: string, elementId: string, fn: (el: SlideElement) => SlideElement): Deck {
  return updateSlide(deck, slideId, (slide) => ({
    ...slide,
    elements: slide.elements.map((el) => (el.id === elementId ? fn(el) : el)),
  }));
}

/**
 * Add elements at the given index (default: on top) with fresh zIndexes.
 * With `respectZIndex`, elements carrying an in-range zIndex are re-inserted
 * at that stacking position (used when restoring removed elements).
 */
export function insertElements(
  deck: Deck,
  slideId: string,
  elements: SlideElement[],
  index?: number,
  opts: { respectZIndex?: boolean } = {},
): Deck {
  return updateSlide(deck, slideId, (slide) => {
    const current = slide.elements;
    const maxZ = current.length === 0 ? -1 : Math.max(...current.map((e) => e.zIndex));
    const placed = elements.map((el, i) => ({
      ...el,
      zIndex:
        opts.respectZIndex && Number.isFinite(el.zIndex) && el.zIndex >= 0 && el.zIndex <= maxZ
          ? el.zIndex
          : maxZ + 1 + i,
    }));
    const next =
      index === undefined
        ? [...current, ...placed]
        : [...current.slice(0, index), ...placed, ...current.slice(index)];
    return { ...slide, elements: normalizeZIndexes(next) };
  });
}

function collectGroupChildren(slide: Slide, element: SlideElement, out: Set<string>): void {
  if (element.type === 'group' || element.type === 'diagram') {
    for (const childId of element.childIds) {
      if (!out.has(childId)) {
        out.add(childId);
        const child = slide.elements.find((e) => e.id === childId);
        if (child) collectGroupChildren(slide, child, out);
      }
    }
  }
}

export interface RemoveResult {
  deck: Deck;
  removed: SlideElement[];
}

/** Remove exactly the given ids only — no group cascade, no connector cascade. */
export function removeElementsShallow(deck: Deck, slideId: string, ids: string[]): RemoveResult {
  const slide = getSlide(deck, slideId);
  if (!slide) return { deck, removed: [] };
  const removeSet = new Set(ids);
  const removed = slide.elements.filter((e) => removeSet.has(e.id));
  const kept = slide.elements.filter((e) => !removeSet.has(e.id));
  const updated = updateSlide(deck, slideId, (s) => ({ ...s, elements: normalizeZIndexes(kept) }));
  return { deck: updated, removed };
}

/**
 * Remove elements with full integrity maintenance:
 * - groups/diagrams remove their children recursively
 * - removed children are detached from parent group/diagram metadata
 * - diagram edges referencing removed nodes (and their connectors) are removed
 * - connectors bound to removed elements are removed
 */
export function removeElements(deck: Deck, slideId: string, ids: string[]): RemoveResult {
  const slide = getSlide(deck, slideId);
  if (!slide) return { deck, removed: [] };

  const removeSet = new Set(ids);
  for (const id of ids) {
    const el = slide.elements.find((e) => e.id === id);
    if (el) collectGroupChildren(slide, el, removeSet);
  }
  // Expand: connectors bound to removed elements.
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of slide.elements) {
      if (removeSet.has(el.id)) continue;
      if (el.type === 'connector') {
        if ((el.fromId && removeSet.has(el.fromId)) || (el.toId && removeSet.has(el.toId))) {
          removeSet.add(el.id);
          changed = true;
        }
      }
    }
  }

  const removed = slide.elements.filter((e) => removeSet.has(e.id));
  const kept = slide.elements.filter((e) => !removeSet.has(e.id));

  const nextElements = kept.map((el) => {
    if ((el.type === 'group' || el.type === 'diagram') && el.childIds.some((c) => removeSet.has(c))) {
      const childIds = el.childIds.filter((c) => !removeSet.has(c));
      if (el.type === 'diagram') {
        const nodeIds = new Set(el.nodes.filter((n) => !removeSet.has(n.id)).map((n) => n.id));
        const edges = el.edges.filter((e) => !removeSet.has(e.id) && nodeIds.has(e.from) && nodeIds.has(e.to));
        return {
          ...el,
          childIds,
          nodes: el.nodes.filter((n) => nodeIds.has(n.id)),
          edges,
          lanes: el.lanes?.map((l) => ({ ...l, nodeIds: l.nodeIds.filter((n) => nodeIds.has(n)) })),
          groups: el.groups?.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((n) => nodeIds.has(n)) })),
        };
      }
      return { ...el, childIds };
    }
    return el;
  });

  const updated = updateSlide(deck, slideId, (s) => ({
    ...s,
    elements: normalizeZIndexes(nextElements),
  }));
  return { deck: updated, removed };
}

export function insertSlideAt(deck: Deck, index: number, slide: Slide): Deck {
  const clone = deepClone(slide);
  const next = [...deck.slides];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, clone);
  return { ...deck, slides: next };
}

export function removeSlide(deck: Deck, slideId: string): Deck {
  return { ...deck, slides: deck.slides.filter((s) => s.id !== slideId) };
}

export function moveSlide(deck: Deck, slideId: string, toIndex: number): Deck {
  const from = deck.slides.findIndex((s) => s.id === slideId);
  if (from < 0) return deck;
  const next = [...deck.slides];
  const [slide] = next.splice(from, 1);
  if (!slide) return deck;
  next.splice(Math.min(Math.max(toIndex, 0), next.length), 0, slide);
  return { ...deck, slides: next };
}

/** Replace all elements of a slide (used by ApplyLayout). */
export function replaceSlideElements(deck: Deck, slideId: string, elements: SlideElement[]): Deck {
  return updateSlide(deck, slideId, (slide) => ({
    ...slide,
    elements: normalizeZIndexes(elements),
  }));
}

export function normalizeDeckZIndexes(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => ({ ...s, elements: normalizeZIndexes(s.elements) })),
  };
}

/** Sanitize an element: assign fresh ids recursively so pasted content is unique. */
export function remapElementIds(element: SlideElement, map: Map<string, string> = new Map()): SlideElement {
  const newId = uid();
  map.set(element.id, newId);
  const base = { ...element, id: newId };
  if (element.type === 'group' || element.type === 'diagram') {
    return { ...base, childIds: element.childIds.map((c) => c) } as SlideElement;
  }
  return base as SlideElement;
}

export function sortElements(slide: Slide): SlideElement[] {
  return sortByZIndex(slide.elements);
}
