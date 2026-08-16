import type { Bounds, Point, Slide, SlideElement } from '@jkinco/scene-schema';
import { SLIDE_H, SLIDE_W, boundsOf, getRotatedBounds, isFiniteNumber, overlaps, pointInBounds, roundTo } from '@jkinco/scene-schema';

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export function screenToSlide(vp: Viewport, screenX: number, screenY: number, originX = 0, originY = 0): Point {
  return {
    x: (screenX - originX - vp.panX) / vp.zoom,
    y: (screenY - originY - vp.panY) / vp.zoom,
  };
}

export function slideToScreen(vp: Viewport, slideX: number, slideY: number, originX = 0, originY = 0): Point {
  return {
    x: originX + slideX * vp.zoom + vp.panX,
    y: originY + slideY * vp.zoom + vp.panY,
  };
}

export interface HitTestOptions {
  tolerance?: number;
  includeHidden?: boolean;
  includeLocked?: boolean;
  /** Restrict to concrete types (skip group containers unless asked). */
  includeGroups?: boolean;
}

/** Topmost element at a slide point (groups are transparent containers). */
export function hitTest(slide: Slide, point: Point, opts: HitTestOptions = {}): SlideElement | null {
  const tolerance = opts.tolerance ?? 0;
  const sorted = [...slide.elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (el.hidden && !opts.includeHidden) continue;
    if (el.locked && !opts.includeLocked) continue;
    if ((el.type === 'group' || el.type === 'diagram') && !opts.includeGroups) continue;
    const b = getRotatedBounds(el);
    if (pointInBounds(point, b, tolerance)) return el;
  }
  return null;
}

/** All elements under a point, top-down. */
export function hitTestAll(slide: Slide, point: Point, opts: HitTestOptions = {}): SlideElement[] {
  const tolerance = opts.tolerance ?? 0;
  return [...slide.elements]
    .filter((el) => {
      if (el.hidden && !opts.includeHidden) return false;
      if ((el.type === 'group' || el.type === 'diagram') && !opts.includeGroups) return false;
      return pointInBounds(point, getRotatedBounds(el), tolerance);
    })
    .sort((a, b) => b.zIndex - a.zIndex);
}

/** Elements intersecting a marquee rectangle (box selection). */
export function marqueeSelect(slide: Slide, rect: Bounds, opts: { includeGroups?: boolean } = {}): SlideElement[] {
  return slide.elements.filter((el) => {
    if (el.hidden) return false;
    if ((el.type === 'group' || el.type === 'diagram') && !opts.includeGroups) return false;
    return overlaps(getRotatedBounds(el), rect);
  });
}

export interface Guide {
  /** 'v' vertical line (x = value), 'h' horizontal line (y = value). */
  orientation: 'v' | 'h';
  value: number;
}

export interface SnapResult {
  x: number;
  y: number;
  dx: number;
  dy: number;
  guides: Guide[];
}

export interface SnapOptions {
  grid?: number;
  /** Snap to other elements' edges/centers. */
  snapToObjects?: boolean;
  /** Snap distance threshold in slide pt. */
  threshold?: number;
  /** Exclude these element ids (the moving selection itself). */
  excludeIds?: string[];
  /** Whether to snap centers (rotation-respecting bounds). */
  snapCenters?: boolean;
}

/**
 * Snap a moving rectangle to the grid and to other objects' edges/centers,
 * returning the adjusted position and the guide lines to render.
 */
export function computeSnap(
  slide: Slide,
  rect: Bounds,
  opts: SnapOptions = {},
): SnapResult {
  const grid = opts.grid ?? 8;
  const threshold = opts.threshold ?? 5;
  const exclude = new Set(opts.excludeIds ?? []);
  const snapToObjects = opts.snapToObjects ?? true;
  const snapCenters = opts.snapCenters ?? true;

  // Grid snap first.
  let x = roundTo(rect.x, grid);
  let y = roundTo(rect.y, grid);
  const guides: Guide[] = [];

  const others = slide.elements.filter((el) => !exclude.has(el.id) && !el.hidden);
  const targets: Array<{ v: number[]; h: number[] }> = [];
  for (const el of others) {
    const b = getRotatedBounds(el);
    targets.push({
      v: [b.x, b.x + b.w / 2, b.x + b.w],
      h: [b.y, b.y + b.h / 2, b.y + b.h],
    });
  }

  if (snapToObjects) {
    const candidatesX: Array<{ value: number; dist: number }> = [];
    const candidatesY: Array<{ value: number; dist: number }> = [];
    const myXs = [x, x + rect.w / 2, x + rect.w];
    const myYs = [y, y + rect.h / 2, y + rect.h];
    for (const t of targets) {
      for (const tv of t.v) {
        for (const mx of myXs) candidatesX.push({ value: tv - (mx - x), dist: Math.abs(tv - mx) });
      }
      for (const th of t.h) {
        for (const my of myYs) candidatesY.push({ value: th - (my - y), dist: Math.abs(th - my) });
      }
    }
    const bestX = candidatesX.filter((c) => c.dist <= threshold).sort((a, b) => a.dist - b.dist)[0];
    const bestY = candidatesY.filter((c) => c.dist <= threshold).sort((a, b) => a.dist - b.dist)[0];
    if (bestX) {
      x = bestX.value;
      if (snapCenters) {
        const centerX = x + rect.w / 2;
        for (const t of targets) {
          for (const tv of t.v) {
            if (Math.abs(tv - centerX) <= threshold) guides.push({ orientation: 'v', value: tv });
          }
        }
      }
    }
    if (bestY) {
      y = bestY.value;
      if (snapCenters) {
        const centerY = y + rect.h / 2;
        for (const t of targets) {
          for (const th of t.h) {
            if (Math.abs(th - centerY) <= threshold) guides.push({ orientation: 'h', value: th });
          }
        }
      }
    }
    if (bestX) {
      const edgeX = x;
      for (const t of targets) for (const tv of t.v) if (Math.abs(tv - edgeX) <= threshold) guides.push({ orientation: 'v', value: tv });
      const rightX = x + rect.w;
      for (const t of targets) for (const tv of t.v) if (Math.abs(tv - rightX) <= threshold) guides.push({ orientation: 'v', value: tv });
    }
    if (bestY) {
      for (const t of targets) for (const th of t.h) if (Math.abs(th - y) <= threshold) guides.push({ orientation: 'h', value: th });
      const bottomY = y + rect.h;
      for (const t of targets) for (const th of t.h) if (Math.abs(th - bottomY) <= threshold) guides.push({ orientation: 'h', value: th });
    }
  }

  return { x, y, dx: x - rect.x, dy: y - rect.y, guides: dedupeGuides(guides) };
}

function dedupeGuides(guides: Guide[]): Guide[] {
  const seen = new Set<string>();
  return guides.filter((g) => {
    const key = `${g.orientation}:${Math.round(g.value * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeOptions {
  shift?: boolean;
  keepRatio?: boolean;
  minSize?: number;
  grid?: number;
}

/**
 * Resize from a handle to a target point. With shift/keepRatio the aspect
 * ratio is preserved (corners scale proportionally, edges grow from center).
 * Returns new geometry (x, y, w, h).
 */
export function resizeFromHandle(
  el: Pick<SlideElement, 'x' | 'y' | 'w' | 'h'>,
  handle: ResizeHandle,
  target: Point,
  opts: ResizeOptions = {},
): { x: number; y: number; w: number; h: number } {
  const min = opts.minSize ?? 4;
  const ratio = el.w / el.h;
  let nx = el.x;
  let ny = el.y;
  let nw = el.w;
  let nh = el.h;

  if (opts.shift || opts.keepRatio) {
    if (handle.length === 2) {
      // Corner: opposite corner is the anchor; scale = max of both axes.
      const anchorX = handle.includes('e') ? el.x : el.x + el.w;
      const anchorY = handle.includes('s') ? el.y : el.y + el.h;
      const scale = Math.max(Math.abs(target.x - anchorX) / el.w, Math.abs(target.y - anchorY) / el.h);
      nw = el.w * scale;
      nh = el.h * scale;
      nx = handle.includes('e') ? anchorX : anchorX - nw;
      ny = handle.includes('s') ? anchorY : anchorY - nh;
    } else if (handle === 'e' || handle === 'w') {
      const anchorX = handle === 'e' ? el.x : el.x + el.w;
      nw = Math.abs(target.x - anchorX);
      nh = nw / ratio;
      ny = el.y + el.h / 2 - nh / 2;
      nx = handle === 'e' ? anchorX : anchorX - nw;
    } else {
      const anchorY = handle === 's' ? el.y : el.y + el.h;
      nh = Math.abs(target.y - anchorY);
      nw = nh * ratio;
      nx = el.x + el.w / 2 - nw / 2;
      ny = handle === 's' ? anchorY : anchorY - nh;
    }
  } else {
    const x2 = el.x + el.w;
    const y2 = el.y + el.h;
    let nx2 = x2;
    let ny2 = y2;
    if (handle.includes('w')) nx = target.x;
    if (handle.includes('e')) nx2 = target.x;
    if (handle.includes('n')) ny = target.y;
    if (handle.includes('s')) ny2 = target.y;
    // Protect minimum size against the anchored edge.
    if (nx2 - nx < min) {
      if (handle.includes('w')) nx = nx2 - min;
      else nx2 = nx + min;
    }
    if (ny2 - ny < min) {
      if (handle.includes('n')) ny = ny2 - min;
      else ny2 = ny + min;
    }
    nw = nx2 - nx;
    nh = ny2 - ny;
  }

  const grid = opts.grid;
  if (grid) {
    nx = roundTo(nx, grid);
    ny = roundTo(ny, grid);
    nw = Math.max(min, roundTo(nw, grid));
    nh = Math.max(min, roundTo(nh, grid));
  }

  return { x: nx, y: ny, w: Math.max(min, nw), h: Math.max(min, nh) };
}

export function nearestRotation(angle: number, step = 15): number {
  const normalized = ((angle % 360) + 360) % 360;
  const snapped = Math.round(normalized / step) * step;
  return snapped % 360;
}

/** Bounds of a selection of element ids. */
export function selectionBounds(slide: Slide, ids: string[]): Bounds | null {
  const els = slide.elements.filter((e) => ids.includes(e.id));
  return boundsOf(els);
}

export function clampToSlide(rect: Bounds, opts: { padding?: number; hard?: boolean } = {}): Bounds {
  const pad = opts.padding ?? 0;
  if (!opts.hard) return rect;
  const w = Math.min(rect.w, SLIDE_W);
  const h = Math.min(rect.h, SLIDE_H);
  return {
    x: Math.max(-pad, Math.min(rect.x, SLIDE_W - w + pad)),
    y: Math.max(-pad, Math.min(rect.y, SLIDE_H - h + pad)),
    w,
    h,
  };
}

export function isPointOnHandle(bounds: Bounds, point: Point, zoom: number, handleSize = 8): ResizeHandle | null {
  const hs = handleSize / zoom;
  const handles: Array<[ResizeHandle, Point]> = [
    ['nw', { x: bounds.x, y: bounds.y }],
    ['n', { x: bounds.x + bounds.w / 2, y: bounds.y }],
    ['ne', { x: bounds.x + bounds.w, y: bounds.y }],
    ['e', { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }],
    ['se', { x: bounds.x + bounds.w, y: bounds.y + bounds.h }],
    ['s', { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h }],
    ['sw', { x: bounds.x, y: bounds.y + bounds.h }],
    ['w', { x: bounds.x, y: bounds.y + bounds.h / 2 }],
  ];
  for (const [handle, p] of handles) {
    if (Math.abs(point.x - p.x) <= hs && Math.abs(point.y - p.y) <= hs) return handle;
  }
  return null;
}

export function validateFinite(n: number): boolean {
  return isFiniteNumber(n);
}
