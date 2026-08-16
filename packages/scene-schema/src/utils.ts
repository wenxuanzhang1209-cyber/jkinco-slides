import type { BaseElement, Point, SlideElement } from './types';

let counter = 0;

/**
 * Unique id generator. Uses crypto.randomUUID when available; a monotonic
 * counter suffix guarantees uniqueness even for rapid sequential calls.
 */
export function uid(prefix = 'el'): string {
  counter += 1;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter}`;
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getBounds(el: Pick<BaseElement, 'x' | 'y' | 'w' | 'h'>): Bounds {
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

/** Bounding box of an element *including* its rotation. */
export function getRotatedBounds(el: Pick<BaseElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>): Bounds {
  if (!el.rotation) return getBounds(el);
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const w = el.w * cos + el.h * sin;
  const h = el.w * sin + el.h * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function boundsOf(elements: Array<Pick<BaseElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>>): Bounds | null {
  if (elements.length === 0) return null;
  const boxes = elements.map((el) => getRotatedBounds(el));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const b = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: b - y };
}

export function pointInBounds(p: Point, b: Bounds, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

export function overlaps(a: Bounds, b: Bounds, tolerance = 0): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  return a.x < bx2 - tolerance && ax2 > b.x + tolerance && a.y < by2 - tolerance && ay2 > b.y + tolerance;
}

export function intersectArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function roundTo(v: number, step = 1): number {
  return Math.round(v / step) * step;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Total z-index order comparator (stable by zIndex then insertion order index). */
export function sortByZIndex<T extends { zIndex: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex);
}

/** Re-index elements so zIndex values are dense (0..n-1) while keeping order. */
export function normalizeZIndexes<T extends { zIndex: number }>(items: T[]): T[] {
  const sorted = sortByZIndex(items);
  return sorted.map((item, i) => ({ ...item, zIndex: i }));
}

/** Distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Midpoint of a segment. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function isSlideElement(value: unknown): value is SlideElement {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    ['text', 'shape', 'image', 'connector', 'chart', 'table', 'diagram', 'group', 'media'].includes(v.type as string)
  );
}
