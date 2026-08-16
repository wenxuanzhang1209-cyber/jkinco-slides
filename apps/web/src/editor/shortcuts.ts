import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { matchShortcut, serializeElementsForCopy, pasteElements } from '@jkinco/slide-engine';
import { createElementsCommand } from '@jkinco/command-engine';
import { getEngine } from '../state/appState';
import { toast } from '@jkinco/design-system';

/**
 * Global editor shortcuts (§7.1). Skips when focus is in an input/textarea/
 * contenteditable except a few safe combos.
 */
export function useEditorShortcuts(): void {
  const engine = getEngine();
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || (typeof target.closest === 'function' && !!target.closest('[contenteditable]')));
      if (typing) return;

      const id = matchShortcut(e);
      if (!id) return;

      const slideId = engine.currentSlideId;
      const selection = engine.selection.elementIds;

      switch (id) {
        case 'undo':
          e.preventDefault();
          engine.undo();
          break;
        case 'redo':
          e.preventDefault();
          engine.redo();
          break;
        case 'selectAll':
          e.preventDefault();
          engine.selectAllOnSlide();
          break;
        case 'delete':
          if (selection.length > 0) {
            e.preventDefault();
            engine.deleteSelected();
          }
          break;
        case 'duplicate':
          e.preventDefault();
          duplicateSelection();
          break;
        case 'group':
          e.preventDefault();
          engine.groupSelected();
          break;
        case 'ungroup':
          e.preventDefault();
          engine.ungroupSelected();
          break;
        case 'move1':
        case 'move10': {
          if (selection.length === 0) break;
          e.preventDefault();
          const step = id === 'move10' ? 10 : 1;
          const key = e.key.toLowerCase();
          const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
          const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
          if (dx === 0 && dy === 0) break;
          const slide = engine.currentSlide;
          const moves = selection
            .map((elId) => {
              const el = slide?.elements.find((x) => x.id === elId);
              return el && !el.locked ? { id: elId, x: el.x + dx, y: el.y + dy } : null;
            })
            .filter((m): m is { id: string; x: number; y: number } => m !== null);
          engine.moveElements(moves);
          break;
        }
        case 'escape':
          engine.clearElementSelection();
          engine.setEditingText(null);
          break;
        case 'zoomIn':
          e.preventDefault();
          engine.zoomBy(1.2);
          break;
        case 'zoomOut':
          e.preventDefault();
          engine.zoomBy(1 / 1.2);
          break;
        case 'zoomReset':
          e.preventDefault();
          engine.resetViewport();
          break;
        case 'lock':
          e.preventDefault();
          if (selection.length > 0) {
            const slide = engine.currentSlide;
            const allLocked = selection.every((id) => slide?.elements.find((x) => x.id === id)?.locked);
            engine.setLocked(selection, !allLocked);
          }
          break;
        case 'hide':
          e.preventDefault();
          if (selection.length > 0) {
            const slide = engine.currentSlide;
            const allHidden = selection.every((id) => slide?.elements.find((x) => x.id === id)?.hidden);
            engine.setHidden(selection, !allHidden);
          }
          break;
        case 'bringForward':
          e.preventDefault();
          engine.changeZOrder(selection, 'forward');
          break;
        case 'sendBackward':
          e.preventDefault();
          engine.changeZOrder(selection, 'backward');
          break;
        case 'bringFront':
          e.preventDefault();
          engine.changeZOrder(selection, 'front');
          break;
        case 'sendBack':
          e.preventDefault();
          engine.changeZOrder(selection, 'back');
          break;
        case 'save':
          e.preventDefault();
          void engine.saveNow().then(() => toast('已保存', { tone: 'success' }));
          break;
        default:
          break;
      }
      void slideId;
    },
    [engine],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  function duplicateSelection() {
    const slide = engine.currentSlide;
    if (!slide || engine.selection.elementIds.length === 0) return;
    const json = serializeElementsForCopy(slide, engine.selection.elementIds);
    const pasted = pasteElements(json, { offsetX: 16, offsetY: 16 });
    if (pasted) {
      engine.apply(createElementsCommand({ slideId: slide.id, elements: pasted }));
      engine.selectElements(pasted.map((el) => el.id));
    }
  }
}

/** Copy/paste through the internal clipboard AND system clipboard. */
export function useClipboardShortcuts(): void {
  const engine = getEngine();
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod) return;
      const slide = engine.currentSlide;

      if (key === 'c' && slide && engine.selection.elementIds.length > 0) {
        const json = serializeElementsForCopy(slide, engine.selection.elementIds);
        void navigator.clipboard?.writeText(json).catch(() => undefined);
        (window as unknown as { __jkincoClipboard?: string }).__jkincoClipboard = json;
      } else if (key === 'x' && slide && engine.selection.elementIds.length > 0) {
        const json = serializeElementsForCopy(slide, engine.selection.elementIds);
        void navigator.clipboard?.writeText(json).catch(() => undefined);
        engine.deleteSelected();
      } else if (key === 'v' && slide) {
        e.preventDefault();
        const internal = (window as unknown as { __jkincoClipboard?: string }).__jkincoClipboard;
        if (internal) {
          pasteJson(internal);
          return;
        }
        void navigator.clipboard?.readText().then((text) => pasteJson(text)).catch(() => undefined);
      }
    },
    [engine],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  function pasteJson(json: string) {
    const slide = engine.currentSlide;
    if (!slide) return;
    const pasted = pasteElements(json, { offsetX: 16, offsetY: 16 });
    if (pasted) {
      engine.apply(createElementsCommand({ slideId: slide.id, elements: pasted }));
      engine.selectElements(pasted.map((el) => el.id));
    }
  }
}
