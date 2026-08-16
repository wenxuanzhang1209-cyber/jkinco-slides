import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createShape,
  createSlide,
  createText,
  textFromPlain,
  type Bounds,
} from '@jkinco/scene-schema';
import {
  DEFAULT_VIEWPORT,
  computeSnap,
  hitTest,
  hitTestAll,
  isPointOnHandle,
  marqueeSelect,
  nearestRotation,
  resizeFromHandle,
  screenToSlide,
  selectionBounds,
  slideToScreen,
} from './geometry';

const rect = (x: number, y: number, w: number, h: number): Bounds => ({ x, y, w, h });

describe('viewport transforms', () => {
  it('screenToSlide / slideToScreen round-trip', () => {
    const vp = { ...DEFAULT_VIEWPORT, zoom: 2, panX: 100, panY: 50 };
    const slide = screenToSlide(vp, 300, 250);
    const screen = slideToScreen(vp, slide.x, slide.y);
    expect(screen.x).toBeCloseTo(300);
    expect(screen.y).toBeCloseTo(250);
  });
});

describe('hit testing', () => {
  const slide = createSlide({
    elements: [
      createShape('rect', 0, 0, 100, 100, { id: 'a', zIndex: 0 }),
      createShape('rect', 50, 50, 100, 100, { id: 'b', zIndex: 1 }),
      createShape('rect', 200, 200, 50, 50, { id: 'hidden1', zIndex: 2 }),
    ],
  });
  slide.elements.find((e) => e.id === 'hidden1')!.hidden = true;

  it('returns the topmost element at a point', () => {
    const hit = hitTest(slide, { x: 60, y: 60 });
    expect(hit?.id).toBe('b');
  });

  it('skips hidden elements', () => {
    const hit = hitTest(slide, { x: 210, y: 210 });
    expect(hit).toBeNull();
  });

  it('hitTestAll returns top-down order', () => {
    const all = hitTestAll(slide, { x: 60, y: 60 });
    expect(all.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('marquee select intersects', () => {
    const hits = marqueeSelect(slide, rect(0, 0, 120, 120));
    expect(hits.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});

describe('snapping', () => {
  const slide = createSlide({
    elements: [
      createShape('rect', 0, 0, 100, 100, { id: 'fixed', zIndex: 0 }),
      createShape('rect', 200, 200, 100, 100, { id: 'moving', zIndex: 1 }),
    ],
  });

  it('snaps to the 8pt grid', () => {
    const result = computeSnap(slide, rect(101, 103, 100, 100), { excludeIds: ['moving'], snapToObjects: false });
    expect(result.x).toBe(104);
    expect(result.y).toBe(104);
  });

  it('snaps to another object edge', () => {
    const result = computeSnap(slide, rect(104, 200, 100, 100), { excludeIds: ['moving'], threshold: 6 });
    expect(result.x).toBe(100); // fixed.x + fixed.w = 100
    expect(result.guides.length).toBeGreaterThan(0);
  });

  it('does not snap beyond the threshold', () => {
    const result = computeSnap(slide, rect(500, 500, 50, 50), { grid: 1, excludeIds: ['moving'], threshold: 6 });
    expect(result.x).toBe(500);
  });
});

describe('resize math', () => {
  const el = { x: 100, y: 100, w: 200, h: 100 };

  it('resizes from se corner', () => {
    const r = resizeFromHandle(el, 'se', { x: 400, y: 300 });
    expect(r).toEqual({ x: 100, y: 100, w: 300, h: 200 });
  });

  it('resizes from nw corner (moves origin)', () => {
    const r = resizeFromHandle(el, 'nw', { x: 50, y: 60 });
    expect(r.x).toBe(50);
    expect(r.y).toBe(60);
    expect(r.w).toBe(250);
    expect(r.h).toBe(140);
  });

  it('preserves ratio with shift', () => {
    const r = resizeFromHandle(el, 'se', { x: 500, y: 160 }, { shift: true });
    expect(r.w / r.h).toBeCloseTo(2, 5);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it('edge resize with shift anchors the opposite edge', () => {
    const r = resizeFromHandle(el, 'e', { x: 500, y: 100 }, { shift: true });
    expect(r.x).toBe(100);
    expect(r.w).toBe(400);
    expect(r.h).toBeCloseTo(200, 5);
  });

  it('enforces minimum size', () => {
    const r = resizeFromHandle(el, 'se', { x: 10, y: 10 }, { minSize: 20 });
    expect(r.w).toBeGreaterThanOrEqual(20);
    expect(r.h).toBeGreaterThanOrEqual(20);
  });

  it('never flips when dragging past the opposite edge', () => {
    const r = resizeFromHandle(el, 'se', { x: 50, y: 50 });
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('rotation & handles', () => {
  it('snaps rotation to 15° steps', () => {
    expect(nearestRotation(47)).toBe(45);
    expect(nearestRotation(358)).toBe(0);
    expect(nearestRotation(-47)).toBe(315);
  });

  it('finds resize handle near a corner', () => {
    const b = rect(100, 100, 200, 100);
    expect(isPointOnHandle(b, { x: 100, y: 100 }, 1, 10)).toBe('nw');
    expect(isPointOnHandle(b, { x: 300, y: 200 }, 1, 10)).toBe('se');
    expect(isPointOnHandle(b, { x: 150, y: 150 }, 1, 10)).toBeNull();
  });
});

describe('selection bounds', () => {
  it('computes the union of selected elements', () => {
    const slide = createSlide({
      elements: [
        createShape('rect', 100, 100, 100, 50, { id: 'a', zIndex: 0 }),
        createShape('rect', 300, 200, 50, 100, { id: 'b', zIndex: 1 }),
      ],
    });
    const b = selectionBounds(slide, ['a', 'b'])!;
    expect(b.x).toBe(100);
    expect(b.y).toBe(100);
    expect(b.w).toBe(250);
    expect(b.h).toBe(200);
  });
});
