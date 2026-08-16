import type { ConnectorElement, Deck, DiagramElement, GroupElement, Slide, SlideElement } from '@jkinco/scene-schema';
import { deepClone, normalizeZIndexes, uid, validateSlide } from '@jkinco/scene-schema';
import { getSlide, insertElements, insertSlideAt, moveSlide, removeSlide, updateSlide } from './doc';
import { restoreSnapshotCommand } from './element-commands';
import type { Command, CommandOptions, SerializedCommand } from './types';

function makeSerialized(kind: string, label: string, actor: Command['actor'], aiNote: string | undefined, payload: unknown, id: string): SerializedCommand {
  return { id, kind, label, actor, ...(aiNote ? { aiNote } : {}), payload };
}

// ---------------------------------------------------------------------------
// InsertSlide / DeleteSlide / MoveSlide
// ---------------------------------------------------------------------------

export interface InsertSlidePayload {
  index: number;
  slide: Slide;
}

export type InsertSlideCommand = Command & { kind: 'insertSlide'; payload: InsertSlidePayload };

export function insertSlideCommand(payload: InsertSlidePayload, opts: CommandOptions = {}): InsertSlideCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'insertSlide',
    label: opts.label ?? '新建页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      const issues = validateSlide(payload.slide);
      if (issues.length > 0) return `页面校验失败: ${issues[0]!.message}`;
      if (deck.slides.some((s) => s.id === payload.slide.id)) return `页面 id 冲突: ${payload.slide.id}`;
      if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index > deck.slides.length) return '插入位置无效';
      return null;
    },
    applyTo(deck) {
      return insertSlideAt(deck, payload.index, payload.slide);
    },
    invertFrom() {
      return deleteSlideCommand({ slideId: payload.slide.id }, { label: '撤销: 新建页面', actor: 'system' });
    },
    serialize() {
      return makeSerialized('insertSlide', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface DeleteSlidePayload {
  slideId: string;
}

export type DeleteSlideCommand = Command & { kind: 'deleteSlide'; payload: DeleteSlidePayload };

export function deleteSlideCommand(payload: DeleteSlidePayload, opts: CommandOptions = {}): DeleteSlideCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'deleteSlide',
    label: opts.label ?? '删除页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      if (!deck.slides.some((s) => s.id === payload.slideId)) return `页面不存在: ${payload.slideId}`;
      if (deck.slides.length <= 1) return '至少保留一页';
      return null;
    },
    applyTo(deck) {
      return removeSlide(deck, payload.slideId);
    },
    invertFrom(before) {
      const slide = before.slides.find((s) => s.id === payload.slideId);
      const index = before.slides.findIndex((s) => s.id === payload.slideId);
      if (!slide) return restoreSnapshotCommand(before, '恢复页面');
      return insertSlideCommand({ index: Math.max(index, 0), slide }, { label: '撤销: 删除页面', actor: 'system' });
    },
    serialize() {
      return makeSerialized('deleteSlide', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface MoveSlidePayload {
  slideId: string;
  toIndex: number;
}

export type MoveSlideCommand = Command & { kind: 'moveSlide'; payload: MoveSlidePayload };

export function moveSlideCommand(payload: MoveSlidePayload, opts: CommandOptions = {}): MoveSlideCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'moveSlide',
    label: opts.label ?? '移动页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      if (!deck.slides.some((s) => s.id === payload.slideId)) return `页面不存在: ${payload.slideId}`;
      if (!Number.isInteger(payload.toIndex) || payload.toIndex < 0 || payload.toIndex >= deck.slides.length) return '目标位置无效';
      return null;
    },
    applyTo(deck) {
      return moveSlide(deck, payload.slideId, payload.toIndex);
    },
    invertFrom(before) {
      const fromIndex = before.slides.findIndex((s) => s.id === payload.slideId);
      if (fromIndex < 0) return restoreSnapshotCommand(before, '恢复页面顺序');
      return moveSlideCommand({ slideId: payload.slideId, toIndex: fromIndex }, { label: '撤销: 移动页面', actor: 'system' });
    },
    serialize() {
      return makeSerialized('moveSlide', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// DuplicateSlide
// ---------------------------------------------------------------------------

export interface DuplicateSlidePayload {
  slideId: string;
  newIndex?: number;
}

export type DuplicateSlideCommand = Command & { kind: 'duplicateSlide'; payload: DuplicateSlidePayload };

/** Deep-copy a slide with fresh ids and intact internal references. */
export function cloneSlideWithFreshIds(slide: Slide): Slide {
  const map = new Map<string, string>();
  const mapId = (oldId: string): string => {
    if (!map.has(oldId)) map.set(oldId, uid());
    return map.get(oldId)!;
  };
  const cloneElement = (el: SlideElement): SlideElement => {
    const base = deepClone(el);
    base.id = mapId(el.id);
    if (base.groupId !== undefined) base.groupId = mapId(base.groupId);
    if (el.type === 'group' || el.type === 'diagram') {
      const g = base as GroupElement | DiagramElement;
      g.childIds = el.childIds.map(mapId);
    }
    if (el.type === 'diagram') {
      const d = base as DiagramElement;
      d.nodes = el.nodes.map((n) => ({ ...n, id: mapId(n.id) }));
      d.edges = el.edges.map((e) => ({ ...e, id: mapId(e.id), from: mapId(e.from), to: mapId(e.to) }));
      d.lanes = el.lanes?.map((l) => ({ ...l, id: mapId(l.id), nodeIds: l.nodeIds.map(mapId) }));
      d.groups = el.groups?.map((g) => ({ ...g, id: mapId(g.id), nodeIds: g.nodeIds.map(mapId) }));
    }
    if (el.type === 'connector') {
      const c = base as ConnectorElement;
      if (c.fromId !== undefined) c.fromId = mapId(c.fromId);
      if (c.toId !== undefined) c.toId = mapId(c.toId);
    }
    return base;
  };
  return {
    ...deepClone({ ...slide, elements: [] }),
    id: mapId(slide.id),
    elements: normalizeZIndexes(slide.elements.map(cloneElement)),
  };
}

export function duplicateSlideCommand(payload: DuplicateSlidePayload, opts: CommandOptions = {}): DuplicateSlideCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'duplicateSlide',
    label: opts.label ?? '复制页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      if (!deck.slides.some((s) => s.id === payload.slideId)) return `页面不存在: ${payload.slideId}`;
      return null;
    },
    applyTo(deck) {
      const source = deck.slides.find((s) => s.id === payload.slideId);
      if (!source) return deck;
      const index = deck.slides.findIndex((s) => s.id === payload.slideId);
      const clone = cloneSlideWithFreshIds(source);
      clone.name = source.name ? `${source.name} 副本` : undefined;
      return insertSlideAt(deck, payload.newIndex ?? index + 1, clone);
    },
    invertFrom(before, after) {
      const newSlide = after.slides.find((s) => !before.slides.some((b) => b.id === s.id));
      if (!newSlide) return restoreSnapshotCommand(before, '撤销: 复制页面');
      return deleteSlideCommand({ slideId: newSlide.id }, { label: '撤销: 复制页面', actor: 'system' });
    },
    serialize() {
      return makeSerialized('duplicateSlide', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// SplitSlide / MergeSlides (§38, §7.2)
// ---------------------------------------------------------------------------

export interface SplitSlidePayload {
  slideId: string;
  elementIds: string[];
  /** New slide title; default: original title + "（续）". */
  newTitle?: string;
}

export type SplitSlideCommand = Command & { kind: 'splitSlide'; payload: SplitSlidePayload };

export function splitSlideCommand(payload: SplitSlidePayload, opts: CommandOptions = {}): SplitSlideCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'splitSlide',
    label: opts.label ?? '拆分页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return `页面不存在: ${payload.slideId}`;
      if (payload.elementIds.length === 0) return '没有要拆出的元素';
      const existing = new Set(slide.elements.map((e) => e.id));
      for (const elId of payload.elementIds) if (!existing.has(elId)) return `元素不存在: ${elId}`;
      if (payload.elementIds.length >= slide.elements.length) return '拆分后原页为空';
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const index = deck.slides.findIndex((s) => s.id === payload.slideId);
      const moveSet = new Set(payload.elementIds);
      const moving = slide.elements.filter((e) => moveSet.has(e.id));
      const staying = slide.elements.filter((e) => !moveSet.has(e.id));
      const newSlide: Slide = {
        ...deepClone({ ...slide, elements: [] }),
        id: uid('sld'),
        name: payload.newTitle,
        elements: normalizeZIndexes(moving),
        notes: slide.notes,
        qaStatus: 'pending',
      };
      let next = insertSlideAt(deck, index + 1, newSlide);
      next = updateSlide(next, payload.slideId, (s) => ({ ...s, elements: normalizeZIndexes(staying), qaStatus: 'pending' }));
      return next;
    },
    invertFrom(before, after) {
      const added = after.slides.find((s) => !before.slides.some((b) => b.id === s.id));
      const original = before.slides.find((s) => s.id === payload.slideId);
      if (!added || !original) return restoreSnapshotCommand(before, '撤销: 拆分页面');
      const children = [
        deleteSlideCommand({ slideId: added.id }, { actor: 'system' }),
        insertElementsInSlideCommand({ slideId: payload.slideId, elements: original.elements }, { actor: 'system' }),
      ];
      return compositeCommand(children, { label: '撤销: 拆分页面', actor: 'system' });
    },
    serialize() {
      return makeSerialized('splitSlide', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

/** Internal: replace a slide's elements with given ones. */
export function insertElementsInSlideCommand(payload: { slideId: string; elements: SlideElement[] }, opts: CommandOptions = {}): Command {
  return restoreElementsCommand(payload, opts);
}

export type RestoreElementsCommand = Command & { kind: 'restoreElements'; payload: { slideId: string; elements: SlideElement[] } };

export function restoreElementsCommand(payload: { slideId: string; elements: SlideElement[] }, opts: CommandOptions = {}): RestoreElementsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'restoreElements',
    label: opts.label ?? '恢复元素',
    actor: opts.actor ?? 'system',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      if (!getSlide(deck, payload.slideId)) return '页面不存在';
      return null;
    },
    applyTo(deck) {
      return updateSlide(deck, payload.slideId, (s) => ({ ...s, elements: normalizeZIndexes(payload.elements) }));
    },
    invertFrom(before) {
      return restoreElementsCommand({ slideId: payload.slideId, elements: before.slides.find((s) => s.id === payload.slideId)?.elements ?? [] }, { label: '撤销: 恢复元素', actor: 'system' });
    },
    serialize() {
      return makeSerialized('restoreElements', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface MergeSlidesPayload {
  sourceSlideId: string;
  targetSlideId: string;
}

export type MergeSlidesCommand = Command & { kind: 'mergeSlides'; payload: MergeSlidesPayload };

export function mergeSlidesCommand(payload: MergeSlidesPayload, opts: CommandOptions = {}): MergeSlidesCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'mergeSlides',
    label: opts.label ?? '合并页面',
    actor: opts.actor ?? 'user',

    payload,
    aiNote: opts.aiNote,
    validate(deck) {
      if (!deck.slides.some((s) => s.id === payload.sourceSlideId)) return `源页面不存在: ${payload.sourceSlideId}`;
      if (!deck.slides.some((s) => s.id === payload.targetSlideId)) return `目标页面不存在: ${payload.targetSlideId}`;
      if (payload.sourceSlideId === payload.targetSlideId) return '源页面与目标页面相同';
      return null;
    },
    applyTo(deck) {
      const source = getSlide(deck, payload.sourceSlideId)!;
      const target = getSlide(deck, payload.targetSlideId)!;
      const targetIds = new Set(target.elements.map((e) => e.id));
      const incoming = source.elements.filter((e) => !targetIds.has(e.id));
      let next = insertElements(deck, payload.targetSlideId, incoming);
      next = updateSlide(next, payload.targetSlideId, (s) => ({
        ...s,
        notes: [s.notes, source.notes].filter(Boolean).join('\n\n'),
        qaStatus: 'pending',
      }));
      next = removeSlide(next, payload.sourceSlideId);
      return next;
    },
    invertFrom(before) {
      return restoreSnapshotCommand(before, '撤销: 合并页面');
    },
    serialize() {
      return makeSerialized('mergeSlides', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export type CompositeCommand = Command & { kind: 'composite'; payload: { children: Command[] } };

export function compositeCommand(children: Command[], opts: CommandOptions = {}): CompositeCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'composite',
    label: opts.label ?? '批量操作',
    actor: opts.actor ?? 'system',
    aiNote: opts.aiNote,
    payload: { children },
    validate(deck) {
      let state = deck;
      for (const child of children) {
        const err = child.validate(state);
        if (err) return `子命令校验失败: ${err}`;
        state = child.applyTo(state);
      }
      return null;
    },
    applyTo(deck) {
      return children.reduce((acc, child) => child.applyTo(acc), deck);
    },
    invertFrom(before) {
      return restoreSnapshotCommand(before, `撤销: ${opts.label ?? '批量操作'}`);
    },
    serialize() {
      return makeSerialized(
        'composite',
        this.label,
        this.actor,
        this.aiNote,
        children.map((c) => c.serialize()),
        this.id,
      );
    },
  };
}
