import React, { memo, useCallback, useEffect, useState } from 'react';
import { getEngine } from '../state/appState';
import { Canvas } from './Canvas';
import { ThumbnailRail } from './ThumbnailRail';
import { Inspector } from './Inspector';
import { AiBar } from './AiBar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { EditorContextMenu, useContextMenu } from './ContextMenu';
import { useEditorShortcuts, useClipboardShortcuts } from './shortcuts';


export interface EditorPageProps {
  onPresent: () => void;
  onHome: () => void;
  onStoryboard: () => void;
}

/**
 * §6 core editor shell: thumbnail rail | canvas | contextual inspector,
 * with the bottom AI bar.
 */
export const EditorPage = memo(function EditorPage({ onPresent, onHome, onStoryboard }: EditorPageProps) {
  const engine = getEngine();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { state: ctxState, openAt: openContext, close: closeContext } = useContextMenu();

  useEditorShortcuts();
  useClipboardShortcuts();

  // ⌘K opens the palette; "/" focuses the AI bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const input = document.querySelector<HTMLInputElement>('[data-testid="ai-input"]');
        if (input && document.activeElement !== input) {
          e.preventDefault();
          input.focus();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onPresent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPresent]);

  const presentListener = useCallback(() => onPresent(), [onPresent]);
  useEffect(() => {
    document.addEventListener('jkinco:present' as never, presentListener);
    return () => document.removeEventListener('jkinco:present' as never, presentListener);
  }, [presentListener]);

  return (
    <div data-testid="editor-page" className="flex h-full flex-col bg-white">
      <TopBar onPresent={onPresent} onHome={onHome} onStoryboard={onStoryboard} />
      <div className="flex min-h-0 flex-1">
        <ThumbnailRail />
        <div
          className="relative min-w-0 flex-1"
          onContextMenu={(e) => {
            // Empty-canvas right click (outside the slide stage) → slide-level menu.
            if ((e.target as HTMLElement).closest('[data-testid="slide-stage"]')) return;
            const slide = engine.currentSlide;
            if (slide) openContext(e, engine.selection.elementIds, slide.id);
          }}
        >
          <Canvas onContextMenu={(e, ids, slideId) => openContext(e, ids, slideId)} />
        </div>
        <Inspector />
      </div>
      <AiBar onOpenPalette={() => setPaletteOpen(true)} />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {ctxState.slideId && <EditorContextMenu state={ctxState} onClose={closeContext} />}
    </div>
  );
});
