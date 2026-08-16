import type {
  Deck,
  FillStyle,
  RichText,
  ShadowStyle,
  ShapeElement,
  SlideElement,
  StrokeStyle,
  TextElement,
  TextStyle,
} from '@jkinco/scene-schema';
import { SLIDE_H, SLIDE_W, emptyText, isFiniteNumber, sortByZIndex, validateElement, validateSlide } from '@jkinco/scene-schema';
import { getElement, getSlide, insertElements, removeElements, removeElementsShallow, updateElement, updateSlide } from './doc';
import type { Command, CommandOptions, SerializedCommand } from './types';
import { uid } from '@jkinco/scene-schema';

type ElementCommandOpts = CommandOptions;

function makeSerialized(kind: string, label: string, actor: Command['actor'], aiNote: string | undefined, payload: unknown, id: string): SerializedCommand {
  return { id, kind, label, actor, ...(aiNote ? { aiNote } : {}), payload };
}

// ---------------------------------------------------------------------------
// CreateElements / DeleteElements
// ---------------------------------------------------------------------------

export interface CreateElementsPayload {
  slideId: string;
  elements: SlideElement[];
  index?: number;
  /** Restore original stacking positions (undo of delete). */
  respectZIndex?: boolean;
}

export type CreateElementsCommand = Command & { kind: 'createElements'; payload: CreateElementsPayload };

export function createElementsCommand(payload: CreateElementsPayload, opts: ElementCommandOpts = {}): CreateElementsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'createElements',
    label: opts.label ?? '添加元素',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      if (!getSlide(deck, payload.slideId)) return '目标页面不存在';
      if (payload.elements.length === 0) return '没有元素';
      const existing = new Set(getSlide(deck, payload.slideId)!.elements.map((e) => e.id));
      const seen = new Set<string>();
      for (const el of payload.elements) {
        if (seen.has(el.id) || existing.has(el.id)) return `元素 id 冲突: ${el.id}`;
        seen.add(el.id);
        const issues = validateElement(el, payload.slideId, 0);
        if (issues.length > 0) return `元素校验失败: ${issues[0]!.message}`;
      }
      return null;
    },
    applyTo(deck) {
      return insertElements(deck, payload.slideId, payload.elements, payload.index, {
        respectZIndex: payload.respectZIndex,
      });
    },
    invertFrom() {
      return deleteElementsCommand(
        { slideId: payload.slideId, elementIds: payload.elements.map((e) => e.id) },
        { label: `撤销: ${opts.label ?? '添加元素'}`, actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('createElements', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface DeleteElementsPayload {
  slideId: string;
  elementIds: string[];
}

export type DeleteElementsCommand = Command & { kind: 'deleteElements'; payload: DeleteElementsPayload };

export function deleteElementsCommand(payload: DeleteElementsPayload, opts: ElementCommandOpts = {}): DeleteElementsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'deleteElements',
    label: opts.label ?? '删除元素',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.elementIds.length === 0) return '没有要删除的元素';
      const existing = new Set(slide.elements.map((e) => e.id));
      for (const elId of payload.elementIds) if (!existing.has(elId)) return `元素不存在: ${elId}`;
      return null;
    },
    applyTo(deck) {
      return removeElements(deck, payload.slideId, payload.elementIds).deck;
    },
    invertFrom(before) {
      const slide = getSlide(before, payload.slideId);
      if (!slide) return restoreSnapshotCommand(before, '恢复元素');
      const byId = new Map(slide.elements.map((e) => [e.id, e]));
      const removed: SlideElement[] = [];
      for (const elId of payload.elementIds) {
        const el = byId.get(elId);
        if (el) removed.push(el);
      }
      return createElementsCommand(
        { slideId: payload.slideId, elements: removed, respectZIndex: true },
        { label: `撤销: 删除元素`, actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('deleteElements', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// MoveElements
// ---------------------------------------------------------------------------

export interface MoveElementsPayload {
  slideId: string;
  moves: Array<{ id: string; x: number; y: number }>;
}

export type MoveElementsCommand = Command & { kind: 'moveElements'; payload: MoveElementsPayload };

/** Expand group/diagram containers: children move with their parent. */
export function expandGroupMoves(slideElements: SlideElement[], moves: Array<{ id: string; x: number; y: number }>): Array<{ id: string; x: number; y: number; dx: number; dy: number }> {
  const byId = new Map(slideElements.map((e) => [e.id, e]));
  const result = new Map<string, { id: string; x: number; y: number; dx: number; dy: number }>();
  const queue = moves.map((m) => {
    const el = byId.get(m.id);
    return { id: m.id, x: m.x, y: m.y, dx: el ? m.x - el.x : 0, dy: el ? m.y - el.y : 0 };
  });
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (result.has(item.id)) continue;
    result.set(item.id, item);
    const el = byId.get(item.id);
    if (el && (el.type === 'group' || el.type === 'diagram')) {
      for (const childId of el.childIds) {
        const child = byId.get(childId);
        if (child && !result.has(childId)) {
          queue.push({ id: childId, x: child.x + item.dx, y: child.y + item.dy, dx: item.dx, dy: item.dy });
        }
      }
    }
  }
  return [...result.values()];
}

export function moveElementsCommand(payload: MoveElementsPayload, opts: ElementCommandOpts = {}): MoveElementsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'moveElements',
    label: opts.label ?? '移动元素',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.moves.length === 0) return '没有移动操作';
      const existing = new Set(slide.elements.map((e) => e.id));
      for (const m of payload.moves) {
        if (!existing.has(m.id)) return `元素不存在: ${m.id}`;
        if (!isFiniteNumber(m.x) || !isFiniteNumber(m.y)) return '移动坐标无效';
      }
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const expanded = expandGroupMoves(slide.elements, payload.moves);
      const posMap = new Map(expanded.map((m) => [m.id, m] as const));
      let next = deck;
      for (const [elId, pos] of posMap) {
        next = updateElement(next, payload.slideId, elId, (el) => {
          if (el.type === 'connector') {
            return {
              ...el,
              x: pos.x,
              y: pos.y,
              start: { x: el.start.x + pos.dx, y: el.start.y + pos.dy },
              end: { x: el.end.x + pos.dx, y: el.end.y + pos.dy },
            };
          }
          return { ...el, x: pos.x, y: pos.y };
        });
      }
      // Keep bound connectors glued to their nodes.
      const movedIds = new Set([...posMap.keys()]);
      return updateSlideForConnectors(next, payload.slideId, movedIds);
    },
    invertFrom(before) {
      const slide = getSlide(before, payload.slideId);
      if (!slide) return restoreSnapshotCommand(before, '恢复位置');
      const byId = new Map(slide.elements.map((e) => [e.id, e]));
      const moves = payload.moves
        .map((m) => {
          const el = byId.get(m.id);
          return el ? { id: m.id, x: el.x, y: el.y } : null;
        })
        .filter((m): m is { id: string; x: number; y: number } => m !== null);
      return moveElementsCommand({ slideId: payload.slideId, moves }, { label: `撤销: 移动元素`, actor: 'system' });
    },
    serialize() {
      return makeSerialized('moveElements', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

function updateSlideForConnectors(deck: Deck, slideId: string, movedIds: Set<string>): Deck {
  const slide = getSlide(deck, slideId);
  if (!slide) return deck;
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  let next = deck;
  for (const el of slide.elements) {
    if (el.type !== 'connector' || movedIds.has(el.id)) continue;
    const from = el.fromId ? byId.get(el.fromId) : undefined;
    const to = el.toId ? byId.get(el.toId) : undefined;
    if (!from && !to) continue;
    const start = from ? anchorPoint(from) : el.start;
    const end = to ? anchorPoint(to) : el.end;
    if (start.x !== el.start.x || start.y !== el.start.y || end.x !== el.end.x || end.y !== el.end.y) {
      next = updateElement(next, slideId, el.id, (conn) => ({
        ...conn,
        start,
        end,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      }));
    }
  }
  return next;
}

/** Default anchor point of a node for connector attachment (border center toward nothing → center). */
export function anchorPoint(el: Pick<SlideElement, 'x' | 'y' | 'w' | 'h'>): { x: number; y: number } {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
}

// ---------------------------------------------------------------------------
// Resize / Rotate
// ---------------------------------------------------------------------------

export interface ResizeElementPayload {
  slideId: string;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeElementCommand = Command & { kind: 'resizeElement'; payload: ResizeElementPayload };

export function resizeElementCommand(payload: ResizeElementPayload, opts: ElementCommandOpts = {}): ResizeElementCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'resizeElement',
    label: opts.label ?? '调整大小',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      if (!getElement(deck, payload.slideId, payload.id)) return `元素不存在: ${payload.id}`;
      if (!isFiniteNumber(payload.x) || !isFiniteNumber(payload.y)) return '坐标无效';
      if (!isFiniteNumber(payload.w) || payload.w <= 0 || !isFiniteNumber(payload.h) || payload.h <= 0) return '宽高必须为正数';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => ({ ...el, x: payload.x, y: payload.y, w: payload.w, h: payload.h }));
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el) return restoreSnapshotCommand(before, '恢复大小');
      return resizeElementCommand({ slideId: payload.slideId, id: el.id, x: el.x, y: el.y, w: el.w, h: el.h }, { label: '撤销: 调整大小', actor: 'system' });
    },
    serialize() {
      return makeSerialized('resizeElement', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface RotateElementPayload {
  slideId: string;
  id: string;
  rotation: number;
}

export type RotateElementCommand = Command & { kind: 'rotateElement'; payload: RotateElementPayload };

export function rotateElementCommand(payload: RotateElementPayload, opts: ElementCommandOpts = {}): RotateElementCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'rotateElement',
    label: opts.label ?? '旋转元素',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      if (!getElement(deck, payload.slideId, payload.id)) return `元素不存在: ${payload.id}`;
      if (!isFiniteNumber(payload.rotation)) return '旋转角度无效';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => ({ ...el, rotation: ((payload.rotation % 360) + 360) % 360 }));
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el) return restoreSnapshotCommand(before, '恢复旋转');
      return rotateElementCommand({ slideId: payload.slideId, id: el.id, rotation: el.rotation }, { label: '撤销: 旋转', actor: 'system' });
    },
    serialize() {
      return makeSerialized('rotateElement', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// UpdateText / UpdateStyle / UpdateElementProps
// ---------------------------------------------------------------------------

export interface UpdateTextPayload {
  slideId: string;
  id: string;
  text: RichText;
}

export type UpdateTextCommand = Command & { kind: 'updateText'; payload: UpdateTextPayload };

export function updateTextCommand(payload: UpdateTextPayload, opts: ElementCommandOpts = {}): UpdateTextCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'updateText',
    label: opts.label ?? '编辑文字',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.id);
      if (!el) return `元素不存在: ${payload.id}`;
      if (el.type !== 'text' && el.type !== 'shape') return '该元素不支持文字';
      if (!Array.isArray(payload.text.paragraphs) || payload.text.paragraphs.length === 0) return '文本必须包含段落';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => {
        if (el.type === 'text' || el.type === 'shape') return { ...el, text: payload.text };
        return el;
      });
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el || (el.type !== 'text' && el.type !== 'shape')) return restoreSnapshotCommand(before, '恢复文字');
      return updateTextCommand({ slideId: payload.slideId, id: payload.id, text: el.text ?? emptyText() }, { label: '撤销: 编辑文字', actor: 'system' });
    },
    serialize() {
      return makeSerialized('updateText', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface UpdateStylePayload {
  slideId: string;
  id: string;
  patch: Partial<{
    style: Partial<TextStyle>;
    textStyle: Partial<TextStyle>;
    fill: FillStyle;
    stroke: StrokeStyle;
    radius: number;
    shadow: ShadowStyle | null;
  }>;
}

export type UpdateStyleCommand = Command & { kind: 'updateStyle'; payload: UpdateStylePayload };

export function updateStyleCommand(payload: UpdateStylePayload, opts: ElementCommandOpts = {}): UpdateStyleCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'updateStyle',
    label: opts.label ?? '修改样式',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.id);
      if (!el) return `元素不存在: ${payload.id}`;
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => {
        if (el.type === 'text' && payload.patch.style) {
          return { ...el, style: { ...el.style, ...payload.patch.style } };
        }
        if (el.type === 'shape') {
          return {
            ...el,
            ...(payload.patch.fill ? { fill: payload.patch.fill } : {}),
            ...(payload.patch.stroke ? { stroke: payload.patch.stroke } : {}),
            ...(payload.patch.radius !== undefined ? { radius: payload.patch.radius } : {}),
            ...(payload.patch.shadow !== undefined ? { shadow: payload.patch.shadow } : {}),
            ...(payload.patch.textStyle ? { textStyle: { ...el.textStyle, ...payload.patch.textStyle } } : {}),
          };
        }
        return el;
      });
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el) return restoreSnapshotCommand(before, '恢复样式');
      const patch: UpdateStylePayload['patch'] = {};
      if (el.type === 'text') patch.style = el.style;
      if (el.type === 'shape') {
        patch.fill = el.fill;
        patch.stroke = el.stroke;
        patch.radius = el.radius;
        patch.shadow = el.shadow ?? null;
        patch.textStyle = el.textStyle;
      }
      return updateStyleCommand({ slideId: payload.slideId, id: payload.id, patch }, { label: '撤销: 修改样式', actor: 'system' });
    },
    serialize() {
      return makeSerialized('updateStyle', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface UpdateElementPropsPayload {
  slideId: string;
  id: string;
  patch: Partial<{
    locked: boolean;
    hidden: boolean;
    opacity: number;
    rotation: number;
    name: string;
    role: SlideElement['role'];
    semantic: SlideElement['semantic'];
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

export type UpdateElementPropsCommand = Command & { kind: 'updateElementProps'; payload: UpdateElementPropsPayload };

export function updateElementPropsCommand(payload: UpdateElementPropsPayload, opts: ElementCommandOpts = {}): UpdateElementPropsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'updateElementProps',
    label: opts.label ?? '修改元素属性',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      if (!getElement(deck, payload.slideId, payload.id)) return `元素不存在: ${payload.id}`;
      if (payload.patch.opacity !== undefined && (!isFiniteNumber(payload.patch.opacity) || payload.patch.opacity < 0 || payload.patch.opacity > 1)) return 'opacity 必须在 0..1';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => ({ ...el, ...payload.patch }));
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el) return restoreSnapshotCommand(before, '恢复属性');
      const patch: UpdateElementPropsPayload['patch'] = {
        locked: el.locked,
        hidden: el.hidden,
        opacity: el.opacity,
        rotation: el.rotation,
        name: el.name,
        role: el.role,
        semantic: el.semantic,
      };
      return updateElementPropsCommand({ slideId: payload.slideId, id: payload.id, patch }, { label: '撤销: 修改属性', actor: 'system' });
    },
    serialize() {
      return makeSerialized('updateElementProps', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// Group / Ungroup
// ---------------------------------------------------------------------------

export interface GroupPayload {
  slideId: string;
  elementIds: string[];
  groupId?: string;
}

export type GroupCommand = Command & { kind: 'group'; payload: GroupPayload };

export function groupCommand(payload: GroupPayload, opts: ElementCommandOpts = {}): GroupCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'group',
    label: opts.label ?? '组合',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.elementIds.length < 2) return '至少需要两个元素才能组合';
      const existing = new Set(slide.elements.map((e) => e.id));
      for (const elId of payload.elementIds) if (!existing.has(elId)) return `元素不存在: ${elId}`;
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const maxZ = Math.max(...slide.elements.map((e) => e.zIndex));
      const children = slide.elements.filter((e) => payload.elementIds.includes(e.id));
      const xs = children.map((e) => e.x);
      const ys = children.map((e) => e.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...children.map((e) => e.x + e.w)) - x;
      const h = Math.max(...children.map((e) => e.y + e.h)) - y;
      const groupEl = {
        id: payload.groupId ?? uid('grp'),
        type: 'group' as const,
        name: '分组',
        x,
        y,
        w,
        h,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: maxZ + 1,
        childIds: [...payload.elementIds],
      };
      let next = insertElements(deck, payload.slideId, [groupEl]);
      for (const elId of payload.elementIds) {
        next = updateElement(next, payload.slideId, elId, (el) => ({ ...el, groupId: groupEl.id }));
      }
      return next;
    },
    invertFrom(before, after) {
      const added = after.slides.find((s) => s.id === payload.slideId)?.elements.find(
        (e) => e.type === 'group' && e.childIds.length === payload.elementIds.length && e.childIds.every((c) => payload.elementIds.includes(c)),
      );
      const groupId = added?.id ?? payload.groupId;
      if (!groupId) return restoreSnapshotCommand(before, '取消组合');
      return ungroupCommand({ slideId: payload.slideId, groupId }, { label: '撤销: 组合', actor: 'system' });
    },
    serialize() {
      return makeSerialized('group', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface UngroupPayload {
  slideId: string;
  groupId: string;
}

export type UngroupCommand = Command & { kind: 'ungroup'; payload: UngroupPayload };

export function ungroupCommand(payload: UngroupPayload, opts: ElementCommandOpts = {}): UngroupCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'ungroup',
    label: opts.label ?? '取消组合',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.groupId);
      if (!el) return `组合不存在: ${payload.groupId}`;
      if (el.type !== 'group') return '该元素不是组合';
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const group = slide.elements.find((e) => e.id === payload.groupId);
      if (!group || group.type !== 'group') return deck;
      // Remove ONLY the group container; children stay.
      let next = removeElementsShallow(deck, payload.slideId, [payload.groupId]).deck;
      for (const childId of group.childIds) {
        next = updateElement(next, payload.slideId, childId, (el) => {
          const { groupId: _g, ...rest } = el as SlideElement & { groupId?: string };
          return rest;
        });
      }
      return next;
    },
    invertFrom(before) {
      const group = getElement(before, payload.slideId, payload.groupId);
      if (!group || group.type !== 'group') return restoreSnapshotCommand(before, '恢复组合');
      return groupCommand({ slideId: payload.slideId, elementIds: group.childIds, groupId: group.id }, { label: '撤销: 取消组合', actor: 'system' });
    },
    serialize() {
      return makeSerialized('ungroup', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// Align / Distribute / ZOrder
// ---------------------------------------------------------------------------

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export interface AlignPayload {
  slideId: string;
  elementIds: string[];
  mode: AlignMode;
  /** 'selection' aligns within the selection bounds; 'canvas' aligns to the slide. */
  target?: 'selection' | 'canvas';
}

export type AlignCommand = Command & { kind: 'align'; payload: AlignPayload };

export function alignCommand(payload: AlignPayload, opts: ElementCommandOpts = {}): AlignCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'align',
    label: opts.label ?? '对齐',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.elementIds.length < 2) return '至少需要两个元素';
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const els = slide.elements.filter((e) => payload.elementIds.includes(e.id) && !e.locked);
      if (els.length < 2) return deck;
      const target = payload.target ?? 'selection';
      let bound: { min: number; max: number } | null = null;
      if (target === 'canvas') {
        bound = { min: 0, max: payload.mode === 'top' || payload.mode === 'bottom' || payload.mode === 'centerY' ? 0 : 0 };
      } else {
        const xs = els.map((e) => [e.x, e.x + e.w] as const);
        const ys = els.map((e) => [e.y, e.y + e.h] as const);
        if (payload.mode === 'left' || payload.mode === 'centerX' || payload.mode === 'right') {
          bound = { min: Math.min(...xs.map((v) => v[0])), max: Math.max(...xs.map((v) => v[1])) };
        } else {
          bound = { min: Math.min(...ys.map((v) => v[0])), max: Math.max(...ys.map((v) => v[1])) };
        }
      }
      const moves = els.map((e) => {
        if (payload.mode === 'left') return { id: e.id, x: target === 'canvas' ? 0 : bound!.min, y: e.y };
        if (payload.mode === 'right') return { id: e.id, x: target === 'canvas' ? SLIDE_W - e.w : bound!.max - e.w, y: e.y };
        if (payload.mode === 'centerX') return { id: e.id, x: target === 'canvas' ? SLIDE_W / 2 - e.w / 2 : bound!.min + (bound!.max - bound!.min) / 2 - e.w / 2, y: e.y };
        if (payload.mode === 'top') return { id: e.id, x: e.x, y: target === 'canvas' ? 0 : bound!.min };
        if (payload.mode === 'bottom') return { id: e.id, x: e.x, y: target === 'canvas' ? SLIDE_H - e.h : bound!.max - e.h };
        return { id: e.id, x: e.x, y: target === 'canvas' ? SLIDE_H / 2 - e.h / 2 : bound!.min + (bound!.max - bound!.min) / 2 - e.h / 2 };
      });
      return moveElementsCommand({ slideId: payload.slideId, moves }, { actor: 'system' }).applyTo(deck);
    },
    invertFrom(before) {
      return restoreSnapshotCommand(before, '撤销: 对齐');
    },
    serialize() {
      return makeSerialized('align', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export interface DistributePayload {
  slideId: string;
  elementIds: string[];
  axis: 'horizontal' | 'vertical';
}

export type DistributeCommand = Command & { kind: 'distribute'; payload: DistributePayload };

export function distributeCommand(payload: DistributePayload, opts: ElementCommandOpts = {}): DistributeCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'distribute',
    label: opts.label ?? '等距分布',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.elementIds.length < 3) return '至少需要三个元素';
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const els = slide.elements
        .filter((e) => payload.elementIds.includes(e.id) && !e.locked)
        .sort((a, b) => (payload.axis === 'horizontal' ? a.x - b.x : a.y - b.y));
      if (els.length < 3) return deck;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const moves = new Array<{ id: string; x: number; y: number }>();
      if (payload.axis === 'horizontal') {
        const totalGap = last.x - (first.x + first.w);
        const gap = totalGap / (els.length - 1);
        for (let i = 1; i < els.length - 1; i++) {
          const prev = els[i - 1]!;
          moves.push({ id: els[i]!.id, x: prev.x + prev.w + gap, y: els[i]!.y });
        }
      } else {
        const totalGap = last.y - (first.y + first.h);
        const gap = totalGap / (els.length - 1);
        for (let i = 1; i < els.length - 1; i++) {
          const prev = els[i - 1]!;
          moves.push({ id: els[i]!.id, x: els[i]!.x, y: prev.y + prev.h + gap });
        }
      }
      return moveElementsCommand({ slideId: payload.slideId, moves }, { actor: 'system' }).applyTo(deck);
    },
    invertFrom(before) {
      return restoreSnapshotCommand(before, '撤销: 等距分布');
    },
    serialize() {
      return makeSerialized('distribute', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export type ZOrderOp = 'front' | 'back' | 'forward' | 'backward';

export interface ZOrderPayload {
  slideId: string;
  elementIds: string[];
  op: ZOrderOp;
}

export type ZOrderCommand = Command & { kind: 'changeZOrder'; payload: ZOrderPayload };

export function zOrderCommand(payload: ZOrderPayload, opts: ElementCommandOpts = {}): ZOrderCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'changeZOrder',
    label: opts.label ?? '调整层级',
    actor: opts.actor ?? 'user',

    payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return '目标页面不存在';
      if (payload.elementIds.length === 0) return '没有元素';
      return null;
    },
    applyTo(deck) {
      const slide = getSlide(deck, payload.slideId)!;
      const sorted = sortByZIndex(slide.elements);
      const selected = new Set(payload.elementIds);
      let order = sorted.map((e) => e.id);
      if (payload.op === 'front') {
        const sel = order.filter((eid) => selected.has(eid));
        const rest = order.filter((eid) => !selected.has(eid));
        order = [...rest, ...sel];
      } else if (payload.op === 'back') {
        const sel = order.filter((eid) => selected.has(eid));
        const rest = order.filter((eid) => !selected.has(eid));
        order = [...sel, ...rest];
      } else if (payload.op === 'forward' || payload.op === 'backward') {
        const step = payload.op === 'forward' ? 1 : -1;
        const list = [...order];
        // Bubble selected items step-by-step (stable).
        for (let pass = 0; pass < Math.abs(step); pass++) {
          for (let i = step > 0 ? list.length - 1 : 0; step > 0 ? i >= 0 : i < list.length; step > 0 ? i-- : i++) {
            const j = i + step;
            if (j < 0 || j >= list.length) continue;
            if (selected.has(list[i]!) && !selected.has(list[j]!)) {
              const a = list[i]!;
              const b = list[j]!;
              list[i] = b;
              list[j] = a;
            }
          }
        }
        order = list;
      }
      // Rebuild the elements array in the new z-order.
      const byId = new Map(slide.elements.map((e) => [e.id, e]));
      const reordered = order
        .map((elId, z) => {
          const el = byId.get(elId);
          return el ? { ...el, zIndex: z } : null;
        })
        .filter((el): el is SlideElement => el !== null);
      return updateSlide(deck, payload.slideId, (s) => ({ ...s, elements: reordered }));
    },
    invertFrom(before) {
      return restoreSnapshotCommand(before, '撤销: 调整层级');
    },
    serialize() {
      return makeSerialized('changeZOrder', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// Snapshot restore (fallback inverse)
// ---------------------------------------------------------------------------

export interface RestoreSnapshotPayload {
  deck: Deck;
}

export type RestoreSnapshotCommand = Command & { kind: 'restoreSnapshot'; payload: RestoreSnapshotPayload };

export function restoreSnapshotCommand(deck: Deck, label = '恢复快照', id?: string): RestoreSnapshotCommand {
  const cmdId = id ?? uid('cmd');
  return {
    id: cmdId,
    kind: 'restoreSnapshot',
    label,
    actor: 'system',
    payload: { deck },
    validate: () => null,
    applyTo: () => deck,
    invertFrom: (before) => restoreSnapshotCommand(before, `撤销: ${label}`),
    serialize: () => makeSerialized('restoreSnapshot', label, 'system', undefined, { deck }, cmdId),
  };
}

export function validateSlideElements(slideId: string, elements: SlideElement[]): string | null {
  const slide = { id: slideId, elements, qaStatus: 'pending' as const };
  const issues = validateSlide(slide);
  if (issues.length > 0) return `元素校验失败: ${issues[0]!.message}`;
  return null;
}
