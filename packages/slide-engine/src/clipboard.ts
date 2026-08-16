import type { ConnectorElement, DiagramElement, GroupElement, ImageElement, ShapeElement, Slide, SlideElement, TextElement } from '@jkinco/scene-schema';
import { deepClone, uid } from '@jkinco/scene-schema';

/**
 * Clipboard model: element copy/paste preserves styles; ids are remapped on
 * paste so pasted content never collides with existing elements (§44.6).
 */

export interface ClipboardPayload {
  version: 1;
  elements: SlideElement[];
}

export function serializeElementsForCopy(slide: Slide, ids: string[]): string {
  const elements = slide.elements
    .filter((e) => ids.includes(e.id))
    .map((e) => deepClone(e));
  const payload: ClipboardPayload = { version: 1, elements };
  return JSON.stringify(payload);
}

export function deserializeClipboard(json: string): SlideElement[] | null {
  try {
    const parsed = JSON.parse(json) as ClipboardPayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.elements)) return null;
    return parsed.elements;
  } catch {
    return null;
  }
}

/** Remap ids (elements, groups, diagrams, connectors) for a fresh paste. */
export function remapElementsForPaste(elements: SlideElement[]): SlideElement[] {
  const map = new Map<string, string>();
  const mapId = (oldId: string): string => {
    if (!map.has(oldId)) map.set(oldId, uid());
    return map.get(oldId)!;
  };
  return elements.map((el) => {
    const copy = deepClone(el);
    copy.id = mapId(el.id);
    if (copy.groupId !== undefined) copy.groupId = mapId(copy.groupId);
    if (el.type === 'group' || el.type === 'diagram') {
      const g = copy as GroupElement | DiagramElement;
      g.childIds = el.childIds.map(mapId);
    }
    if (el.type === 'diagram') {
      const d = copy as DiagramElement;
      d.nodes = el.nodes.map((n) => ({ ...n, id: mapId(n.id) }));
      d.edges = el.edges.map((e) => ({ ...e, id: mapId(e.id), from: mapId(e.from), to: mapId(e.to) }));
      d.lanes = el.lanes?.map((l) => ({ ...l, id: mapId(l.id), nodeIds: l.nodeIds.map(mapId) }));
      d.groups = el.groups?.map((g) => ({ ...g, id: mapId(g.id), nodeIds: g.nodeIds.map(mapId) }));
    }
    if (el.type === 'connector') {
      const c = copy as ConnectorElement;
      if (c.fromId !== undefined) c.fromId = mapId(c.fromId);
      if (c.toId !== undefined) c.toId = mapId(c.toId);
    }
    return copy;
  });
}

export function pasteElements(json: string, opts: { offsetX?: number; offsetY?: number } = {}): SlideElement[] | null {
  const elements = deserializeClipboard(json);
  if (!elements || elements.length === 0) return null;
  const remapped = remapElementsForPaste(elements);
  const offsetX = opts.offsetX ?? 16;
  const offsetY = opts.offsetY ?? 16;
  return remapped.map((el) => ({ ...el, x: el.x + offsetX, y: el.y + offsetY }));
}

// ---------------------------------------------------------------------------
// Copy Style / Paste Style (§7.1)
// ---------------------------------------------------------------------------

export interface CopyableStyle {
  version: 1;
  elementType: string;
  style: Record<string, unknown>;
}

export function copyElementStyle(el: SlideElement): string {
  let style: Record<string, unknown> = {};
  if (el.type === 'text') style = { ...el.style };
  if (el.type === 'shape') {
    style = { fill: el.fill, stroke: el.stroke, radius: el.radius, shadow: el.shadow, textStyle: el.textStyle };
  }
  if (el.type === 'image') style = { radius: el.radius, objectFit: el.objectFit, filter: el.filter };
  if (el.type === 'connector') style = { stroke: el.stroke, startArrow: el.startArrow, endArrow: el.endArrow };
  const payload: CopyableStyle = { version: 1, elementType: el.type, style };
  return JSON.stringify(payload);
}

export interface StylePatchResult {
  patch: Record<string, unknown>;
  ok: boolean;
}

/** Build an UpdateStyle patch from a copied style, applied to a target element. */
export function stylePatchFor(json: string, target: SlideElement): StylePatchResult {
  try {
    const parsed = JSON.parse(json) as CopyableStyle;
    if (parsed.version !== 1) return { patch: {}, ok: false };
    if (parsed.elementType !== target.type) return { patch: {}, ok: false };
    return { patch: parsed.style, ok: Object.keys(parsed.style).length > 0 };
  } catch {
    return { patch: {}, ok: false };
  }
}

export type { SlideElement, TextElement, ShapeElement, ImageElement };
