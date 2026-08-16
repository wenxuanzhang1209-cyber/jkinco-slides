import React, { useEffect, useMemo, useState } from 'react';
import { createDeck } from '@jkinco/scene-schema';
import { DeckEngine } from '@jkinco/slide-engine';
import { bootstrapEngine, getEngine, type AppView } from './state/appState';
import { HomePage } from './home/HomePage';
import { GenerationFlow } from './home/GenerationFlow';
import { StoryboardView } from './home/StoryboardView';
import { deckToStoryboard, applyStoryboardBuild } from './home/storyboardBridge';
import { EditorPage } from './editor/EditorPage';
import { PresenterView } from './presenter/PresenterView';
import { useCollaboration } from './collab/useCollaboration';
import { Spinner, ToastViewport } from '@jkinco/design-system';
import type { PersistenceAdapter } from '@jkinco/slide-engine';

function createLocalStorageAdapter(): PersistenceAdapter {
  return {
    async save(key, value) {
      localStorage.setItem(key, value);
    },
    async load(key) {
      return localStorage.getItem(key);
    },
    async remove(key) {
      localStorage.removeItem(key);
    },
    async keys() {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out.push(k);
      }
      return out;
    },
  };
}

/**
 * App shell: home | generation | storyboard (inside generation) | editor | presenter.
 */
export function App() {
  const [view, setView] = useState<AppView>({ name: 'home' });
  const [ready, setReady] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');

  useEffect(() => {
    let disposed = false;
    void bootstrapEngine(createLocalStorageAdapter()).then((engine) => {
      if (disposed) return;
      // A deck with slides goes straight to the editor.
      setReady(true);
      if (engine.deck.slides.length > 0) {
        setView({ name: 'editor' });
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-[#F8FAFC] text-sm text-[#475569]">
        <Spinner /> 正在打开 JKinco Slides…
      </div>
    );
  }

  return (
    <div className="h-full">
      {view.name === 'home' && (
        <HomePage
          onGenerate={(prompt) => {
            setGenerationPrompt(prompt);
            setView({ name: 'generation', prompt });
          }}
          onOpenEditor={() => setView({ name: 'editor' })}
        />
      )}
      {view.name === 'generation' && (
        <GenerationFlow
          prompt={generationPrompt}
          onBack={() => setView({ name: 'home' })}
          onEnterEditor={() => setView({ name: 'editor' })}
        />
      )}
      {view.name === 'editor' && (
        <EditorShell onPresent={() => setView({ name: 'presenter' })} onHome={() => setView({ name: 'home' })} onStoryboard={() => setView({ name: 'storyboard' })} />
      )}
      {view.name === 'storyboard' && <EditorStoryboard onBack={() => setView({ name: 'editor' })} />}
      {view.name === 'presenter' && <PresenterView onExit={() => setView({ name: 'editor' })} />}
      <ToastViewport />
    </div>
  );
}

/** Storyboard view of the live deck (editor → Storyboard 切换, §9). */
function EditorStoryboard({ onBack }: { onBack: () => void }) {
  const engine = getEngine();
  const [board, setBoard] = useState(() => deckToStoryboard(engine.deck));
  return (
    <StoryboardView
      storyboard={board}
      onBack={onBack}
      onBuild={(b) => {
        applyStoryboardBuild(b);
        onBack();
      }}
    />
  );
}

/** Editor wrapper that keeps collaboration presence alive. */
function EditorShell({ onPresent, onHome, onStoryboard }: { onPresent: () => void; onHome: () => void; onStoryboard: () => void }) {
  useCollaboration();
  return <EditorPage onPresent={onPresent} onHome={onHome} onStoryboard={onStoryboard} />;
}

export { createDeck, DeckEngine };
