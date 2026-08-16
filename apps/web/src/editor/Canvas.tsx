import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { SlideElement } from '@jkinco/scene-schema';
import { getTheme } from '@jkinco/scene-schema';
import {
  computeSnap,
  hitTest,
  isPointOnHandle,
  marqueeSelect,
  nearestRotation,
  pasteElements,
  resizeFromHandle,
  screenToSlide,
  selectionBounds,
  serializeElementsForCopy,
  type Guide,
  type ResizeHandle,
} from '@jkinco/slide-engine';
import { createElementsCommand } from '@jkinco/command-engine';
import { getEngine, useDeck, useSelection, useViewport } from '../state/appState';
import { SlideView } from './SlideView';
import { TextEditOverlay } from './TextEditOverlay';
import { ElementView } from './elements';

type Interaction =
  | { kind: 'none' }
  | { kind: 'marquee'; start: { x: number; y: number }; current: { x: number; y: number }; additive: boolean }
  | {
      kind: 'move';
      startPoint: { x: number; y: number };
      orig: Map<string, { x: number; y: number }>;
      ids: string[];
      current: Map<string, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      handle: ResizeHandle;
      startPoint: { x: number; y: number };
      orig: { x: number; y: number; w: number; h: number };
      current: { x: number; y: number; w: number; h: number };
    }
  | { kind: 'rotate'; id: string; startAngle: number; currentAngle: number; origAngle: number }
  | { kind: 'pan'; startClient: { x: number; y: number }; startPan: { x: number; y: number } };

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 24;

export const Canvas = memo(function Canvas({
  onContextMenu,
}: {
  onContextMenu?: (e: React.MouseEvent, elementIds: string[], slideId: string) => void;
}) {
  const engine = getEngine();
  const deck = useDeck();
  const selection = useSelection();
  const viewport = useViewport();
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'none' });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slideWrapRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction>({ kind: 'none' });
  interactionRef.current = interaction;

  const slide = deck.slides.find((s) => s.id === selection.slideId) ?? deck.slides[0] ?? null;
  const theme = getTheme(deck.themeId);
  const zoom = viewport.zoom;

  const getSlidePoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = slideWrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const zoomToFit = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cw = container.clientWidth - 64;
    const ch = container.clientHeight - 64;
    if (cw < 60 || ch < 60) return; // container not laid out yet
    const z = Math.max(0.05, Math.min(cw / 960, ch / 540));
    engine.setViewport({ zoom: z, panX: 0, panY: 0 });
  }, [engine]);

  useEffect(() => {
    zoomToFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.slideId, engine]);

  // ------------------------------------------------------------- pointer down

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!slide) return;
      const slidePoint = getSlidePoint(e.clientX, e.clientY);
      const interactive = e.button === 0 || e.button === 1;
      if (!interactive) return;

      // Space held → pan
      if (spaceHeld || e.button === 1) {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setInteraction({ kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startPan: { x: viewport.panX, y: viewport.panY } });
        return;
      }

      const editing = selection.editingTextId;
      if (editing) {
        engine.setEditingText(null);
      }

      // Selection handles have priority
      if (selection.elementIds.length > 0 && !e.shiftKey) {
        const bounds = selectionBounds(slide, selection.elementIds);
        if (bounds) {
          const handle = isPointOnHandle(bounds, slidePoint, zoom, HANDLE_SIZE);
          if (handle) {
            const el = slide.elements.find((x) => x.id === selection.elementIds[0])!;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setInteraction({
              kind: 'resize',
              id: el.id,
              handle,
              startPoint: slidePoint,
              orig: { x: el.x, y: el.y, w: el.w, h: el.h },
              current: { x: el.x, y: el.y, w: el.w, h: el.h },
            });
            e.stopPropagation();
            return;
          }
          // Rotate handle above the box
          const rotX = bounds.x + bounds.w / 2;
          const rotY = bounds.y - ROTATE_OFFSET / zoom;
          if (Math.abs(slidePoint.x - rotX) <= HANDLE_SIZE / zoom && Math.abs(slidePoint.y - rotY) <= HANDLE_SIZE / zoom) {
            const el = slide.elements.find((x) => x.id === selection.elementIds[0])!;
            const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
            const startAngle = (Math.atan2(slidePoint.y - center.y, slidePoint.x - center.x) * 180) / Math.PI;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setInteraction({ kind: 'rotate', id: el.id, startAngle, currentAngle: el.rotation, origAngle: el.rotation });
            e.stopPropagation();
            return;
          }
        }
      }

      const hit = hitTest(slide, slidePoint, { includeGroups: false });

      if (hit) {
        // Alt/Option drag duplicates (§7.1)
        if (e.altKey && !selection.elementIds.includes(hit.id)) {
          engine.selectElements([hit.id]);
          duplicateSelection();
        }
        const ids = e.shiftKey
          ? selection.elementIds.includes(hit.id)
            ? selection.elementIds
            : [...selection.elementIds, hit.id]
          : selection.elementIds.includes(hit.id) && selection.elementIds.length > 0
            ? selection.elementIds
            : [hit.id];
        if (e.shiftKey) {
          engine.selectElements(ids);
        } else if (!selection.elementIds.includes(hit.id)) {
          engine.selectElements([hit.id]);
        }
        const moving = ids.filter((id) => {
          const el = slide.elements.find((x) => x.id === id);
          return el && !el.locked && !el.hidden;
        });
        const orig = new Map<string, { x: number; y: number }>();
        for (const id of moving) {
          const el = slide.elements.find((x) => x.id === id)!;
          orig.set(id, { x: el.x, y: el.y });
        }
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setInteraction({ kind: 'move', startPoint: slidePoint, orig, ids: moving, current: orig, moved: false });
        return;
      }

      // Empty area → marquee
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      if (!e.shiftKey) engine.clearElementSelection();
      setInteraction({ kind: 'marquee', start: slidePoint, current: slidePoint, additive: e.shiftKey });
    },
    [slide, selection, viewport, zoom, spaceHeld, engine, getSlidePoint],
  );

  function duplicateSelection() {
    const s = engine.currentSlide;
    if (!s) return;
    const json = serializeElementsForCopy(s, engine.selection.elementIds);
    const pasted = pasteElements(json, { offsetX: 16, offsetY: 16 });
    if (pasted) {
      engine.apply(createElementsCommand({ slideId: s.id, elements: pasted }));
      engine.selectElements(pasted.map((el) => el.id));
    }
  }

  // -------------------------------------------------------------- pointer move

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const it = interactionRef.current;
      if (it.kind === 'none' || !slide) return;
      const slidePoint = getSlidePoint(e.clientX, e.clientY);

      if (it.kind === 'marquee') {
        setInteraction({ ...it, current: slidePoint });
        return;
      }
      if (it.kind === 'pan') {
        engine.panBy(e.clientX - it.startClient.x, e.clientY - it.startClient.y);
        setInteraction({ ...it, startClient: { x: e.clientX, y: e.clientY } });
        return;
      }
      if (it.kind === 'move') {
        const dx = slidePoint.x - it.startPoint.x;
        const dy = slidePoint.y - it.startPoint.y;
        const current = new Map<string, { x: number; y: number }>();
        for (const [id, o] of it.orig) current.set(id, { x: o.x + dx, y: o.y + dy });

        // Snapping (§7.1): grid + object edges with smart guides
        const els = it.ids.map((id) => slide.elements.find((x) => x.id === id)).filter(Boolean) as SlideElement[];
        const first = els[0];
        const baseBounds = selectionBounds(slide, it.ids);
        if (first && baseBounds) {
          const movingRect = {
            x: baseBounds.x + dx,
            y: baseBounds.y + dy,
            w: baseBounds.w,
            h: baseBounds.h,
          };
          const snap = computeSnap(slide, movingRect, { grid: 8, threshold: 5, excludeIds: it.ids });
          const snapDx = snap.x - baseBounds.x;
          const snapDy = snap.y - baseBounds.y;
          for (const [id, o] of it.orig) current.set(id, { x: o.x + snapDx, y: o.y + snapDy });
          setGuides(snap.guides);
        }
        setInteraction({ ...it, current, moved: true });
        return;
      }
      if (it.kind === 'resize') {
        const opts = { shift: e.shiftKey, minSize: 8, grid: 8 };
        const next = resizeFromHandle(it.orig, it.handle, slidePoint, opts);
        setInteraction({ ...it, current: next });
        return;
      }
      if (it.kind === 'rotate') {
        const bounds = selectionBounds(slide, [it.id]) ?? { x: 0, y: 0, w: 10, h: 10 };
        const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
        const angle = (Math.atan2(slidePoint.y - center.y, slidePoint.x - center.x) * 180) / Math.PI;
        let next = it.origAngle + (angle - it.startAngle);
        if (e.shiftKey) next = nearestRotation(next, 15);
        setInteraction({ ...it, currentAngle: next });
        return;
      }
    },
    [slide, engine, getSlidePoint],
  );

  // ---------------------------------------------------------------- pointer up

  const onPointerUp = useCallback(() => {
    const it = interactionRef.current;
    if (it.kind === 'none') return;
    if (it.kind === 'move') {
      if (it.moved && slide) {
        const moves = [...it.current.entries()].map(([id, pos]) => ({ id, x: Math.round(pos.x), y: Math.round(pos.y) }));
        engine.moveElements(moves);
      }
    } else if (it.kind === 'resize') {
      const c = it.current;
      engine.resizeElement(it.id, Math.round(c.x), Math.round(c.y), Math.round(c.w), Math.round(c.h));
    } else if (it.kind === 'rotate') {
      engine.rotateElement(it.id, Math.round(it.currentAngle * 10) / 10);
    } else if (it.kind === 'marquee' && slide) {
      const rect = {
        x: Math.min(it.start.x, it.current.x),
        y: Math.min(it.start.y, it.current.y),
        w: Math.abs(it.current.x - it.start.x),
        h: Math.abs(it.current.y - it.start.y),
      };
      const hits = marqueeSelect(slide, rect);
      const ids = hits.map((x) => x.id);
      if (it.additive) {
        engine.selectElements([...new Set([...engine.selection.elementIds, ...ids])]);
      } else {
        engine.selectElements(ids);
      }
    }
    setInteraction({ kind: 'none' });
    setGuides([]);
  }, [engine, slide, interactionRef]);

  // ------------------------------------------------------------------- wheel

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.002);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        engine.zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
      }
    },
    [engine],
  );

  // --------------------------------------------------------------------- context menu

  const onContextMenuLocal = useCallback(
    (e: React.MouseEvent) => {
      if (!slide || !onContextMenu) return;
      e.preventDefault();
      const slidePoint = getSlidePoint(e.clientX, e.clientY);
      const hit = hitTest(slide, slidePoint, { includeGroups: false });
      let ids = engine.selection.elementIds;
      if (hit && !ids.includes(hit.id)) {
        ids = [hit.id];
        engine.selectElements([hit.id]);
      }
      onContextMenu(e, ids, slide.id);
    },
    [slide, engine, getSlidePoint, onContextMenu],
  );

  // -------------------------------------------------------------- double click

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!slide) return;
      const slidePoint = getSlidePoint(e.clientX, e.clientY);
      const hit = hitTest(slide, slidePoint, { includeGroups: false });
      if (hit && (hit.type === 'text' || (hit.type === 'shape' && hit.text))) {
        engine.selectElements([hit.id]);
        engine.setEditingText(hit.id);
      }
    },
    [slide, engine, getSlidePoint],
  );

  // ------------------------------------------------------------------ render

  const selectionIds = selection.elementIds;
  const bounds = slide ? selectionBounds(slide, selectionIds) : null;
  const previewEls = new Map<string, { x: number; y: number; w: number; h: number; rotation: number }>();
  if (interaction.kind === 'move') {
    for (const [id, pos] of interaction.current) previewEls.set(id, { x: pos.x, y: pos.y, w: 0, h: 0, rotation: 0 });
  } else if (interaction.kind === 'resize') {
    previewEls.set(interaction.id, { ...interaction.current, rotation: 0 });
  } else if (interaction.kind === 'rotate') {
    previewEls.set(interaction.id, { x: 0, y: 0, w: 0, h: 0, rotation: interaction.currentAngle });
  }

  const overlayBounds =
    interaction.kind === 'resize' && slide
      ? selectionBounds(slide, [interaction.id])
      : interaction.kind === 'move'
        ? (() => {
            const xs = [...interaction.current.values()].map((p) => p.x);
            const ys = [...interaction.current.values()].map((p) => p.y);
            if (xs.length === 0) return null;
            const els = interaction.ids.map((id) => slide!.elements.find((x) => x.id === id)).filter(Boolean) as SlideElement[];
            const maxW = Math.max(...els.map((el) => el.w));
            const maxH = Math.max(...els.map((el) => el.h));
            return { x: Math.min(...xs), y: Math.min(...ys), w: maxW, h: maxH };
          })()
        : bounds;

  return (
    <div
      ref={scrollRef}
      data-testid="canvas-scroll"
      className="relative h-full w-full overflow-auto bg-[#F1F5F9]"
      onWheel={onWheel}
      style={{ cursor: spaceHeld ? 'move' : 'default' }}
    >
      <div className="flex min-h-full min-w-full items-center justify-center" style={{ padding: 120 }}>
        <div
          ref={slideWrapRef}
          data-testid="slide-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuLocal}
          className="relative no-select"
          style={{
            width: 960 * zoom,
            height: 540 * zoom,
            transform: `translate(${viewport.panX}px, ${viewport.panY}px)`,
          }}
        >
          {slide ? (
            <SlideView slide={slide} theme={theme} zoom={zoom} interactive editingTextId={selection.editingTextId} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white text-sm text-[#94A3B8]">没有页面 — 从左侧添加</div>
          )}

          {/* overlays live in the LOGICAL 960×540 coordinate space */}
          <div
            data-testid="overlay-layer"
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: 960, height: 540, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            {/* live preview of dragged/resized/rotated elements (zero-latency drag §8.2) */}
            {slide &&
              [...previewEls.entries()].map(([id, pv]) => {
                const el = slide.elements.find((x) => x.id === id);
                if (!el) return null;
                const isMove = pv.w === 0 && pv.h === 0;
                const preview: SlideElement = {
                  ...el,
                  x: pv.x,
                  y: pv.y,
                  w: isMove ? el.w : pv.w,
                  h: isMove ? el.h : pv.h,
                  rotation: pv.rotation || el.rotation,
                  opacity: 0.65,
                };
                return <ElementView key={`preview-${id}`} element={preview} theme={theme} selected={false} isEditing={false} />;
              })}

            {/* selection outline + handles */}
            {overlayBounds && slide && selectionIds.length > 0 && interaction.kind !== 'marquee' && (
              <SelectionOverlay
                bounds={overlayBounds}
                zoom={zoom}
                selectedCount={selectionIds.length}
                editing={selection.editingTextId !== null}
              />
            )}

            {/* marquee rectangle */}
            {interaction.kind === 'marquee' && (
              <div
                data-testid="marquee"
                style={{
                  position: 'absolute',
                  left: Math.min(interaction.start.x, interaction.current.x),
                  top: Math.min(interaction.start.y, interaction.current.y),
                  width: Math.abs(interaction.current.x - interaction.start.x),
                  height: Math.abs(interaction.current.y - interaction.start.y),
                  border: '1px solid #1E56A0',
                  background: 'rgba(30,86,160,0.08)',
                }}
              />
            )}

            {/* smart guides (§7.1) */}
            {guides.map((g, i) =>
              g.orientation === 'v' ? (
                <div key={`v${i}`} data-testid="guide-v" style={{ position: 'absolute', left: g.value, top: 0, width: 1, height: 540, background: '#F43F5E' }} />
              ) : (
                <div key={`h${i}`} data-testid="guide-h" style={{ position: 'absolute', left: 0, top: g.value, width: 960, height: 1, background: '#F43F5E' }} />
              ),
            )}

            {/* text editing overlay */}
            {slide && selection.editingTextId && <TextEditOverlay slide={slide} elementId={selection.editingTextId} zoom={zoom} />}
          </div>
        </div>
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white p-1 shadow-sm">
        <button data-testid="zoom-out" className="rounded px-2 py-1 text-sm hover:bg-[#F1F5F9]" onClick={() => engine.zoomBy(1 / 1.2)} aria-label="缩小">
          −
        </button>
        <span data-testid="zoom-label" className="w-12 text-center text-xs text-[#475569]">
          {Math.round(zoom * 100)}%
        </span>
        <button data-testid="zoom-in" className="rounded px-2 py-1 text-sm hover:bg-[#F1F5F9]" onClick={() => engine.zoomBy(1.2)} aria-label="放大">
          +
        </button>
        <button data-testid="zoom-fit" className="rounded px-2 py-1 text-sm hover:bg-[#F1F5F9]" onClick={zoomToFit} aria-label="适合窗口">
          ⛶
        </button>
      </div>
    </div>
  );
});

function SelectionOverlay({ bounds, zoom, selectedCount, editing }: { bounds: { x: number; y: number; w: number; h: number }; zoom: number; selectedCount: number; editing: boolean }) {
  const hs = HANDLE_SIZE / zoom;
  const handles: Array<{ id: string; x: number; y: number; cursor: string }> = [
    { id: 'nw', x: bounds.x, y: bounds.y, cursor: 'nwse-resize' },
    { id: 'n', x: bounds.x + bounds.w / 2, y: bounds.y, cursor: 'ns-resize' },
    { id: 'ne', x: bounds.x + bounds.w, y: bounds.y, cursor: 'nesw-resize' },
    { id: 'e', x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, cursor: 'ew-resize' },
    { id: 'se', x: bounds.x + bounds.w, y: bounds.y + bounds.h, cursor: 'nwse-resize' },
    { id: 's', x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, cursor: 'ns-resize' },
    { id: 'sw', x: bounds.x, y: bounds.y + bounds.h, cursor: 'nesw-resize' },
    { id: 'w', x: bounds.x, y: bounds.y + bounds.h / 2, cursor: 'ew-resize' },
  ];
  if (editing) return null;
  return (
    <div data-testid="selection-overlay" className="pointer-events-none absolute" style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}>
      <div style={{ position: 'absolute', inset: -1.5 / zoom, border: `${1.5 / zoom}px solid #1E56A0` }} />
      {selectedCount > 1 && (
        <div style={{ position: 'absolute', top: -20 / zoom, left: 0, fontSize: 11 / zoom, color: '#1E56A0', fontWeight: 600 }}>
          已选 {selectedCount} 个对象
        </div>
      )}
      {handles.map((h) => (
        <div
          key={h.id}
          data-handle={h.id}
          className="pointer-events-auto"
          style={{
            position: 'absolute',
            left: h.x - hs / 2,
            top: h.y - hs / 2,
            width: hs,
            height: hs,
            background: '#FFFFFF',
            border: `${1.5 / zoom}px solid #1E56A0`,
            borderRadius: 2 / zoom,
            cursor: h.cursor,
          }}
        />
      ))}
      {/* rotate handle */}
      <div
        data-handle="rotate"
        className="pointer-events-auto"
        style={{
          position: 'absolute',
          left: bounds.w / 2 - hs / 2,
          top: -ROTATE_OFFSET / zoom - hs / 2,
          width: hs,
          height: hs,
          background: '#FFFFFF',
          border: `${1.5 / zoom}px solid #1E56A0`,
          borderRadius: '50%',
          cursor: 'grab',
        }}
      />
      <div style={{ position: 'absolute', left: bounds.w / 2 - 0.5, top: -ROTATE_OFFSET / zoom + hs / 2, width: 1 / zoom, height: ROTATE_OFFSET / zoom - hs, background: '#1E56A0' }} />
    </div>
  );
}
