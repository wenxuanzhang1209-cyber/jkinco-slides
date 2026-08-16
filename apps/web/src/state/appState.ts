import { useRef, useSyncExternalStore } from 'react';
import type { Deck } from '@jkinco/scene-schema';
import { createDeck } from '@jkinco/scene-schema';
import { DeckEngine, MemoryPersistence, type PersistenceAdapter } from '@jkinco/slide-engine';
import type { EngineEvent, SelectionState } from '@jkinco/slide-engine';

export type AppView =
  | { name: 'home' }
  | { name: 'generation'; prompt: string }
  | { name: 'storyboard' }
  | { name: 'editor' }
  | { name: 'presenter' };

let engineInstance: DeckEngine | null = null;

export function getEngine(): DeckEngine {
  return engineInstance!;
}

export function setEngine(engine: DeckEngine): void {
  engineInstance = engine;
}

/** Restore the last deck from storage or create a new one. */
export async function bootstrapEngine(adapter: PersistenceAdapter): Promise<DeckEngine> {
  const restored = await DeckEngine.restore(adapter, { fallbackDeck: createDeck() });
  const engine = new DeckEngine(restored, { persistence: adapter, autosaveDelay: 800, maxHistory: 500 });
  setEngine(engine);
  return engine;
}

export function createSessionEngine(deck?: Deck, adapter?: PersistenceAdapter): DeckEngine {
  const engine = new DeckEngine(deck ?? createDeck(), { persistence: adapter ?? new MemoryPersistence(), autosaveDelay: 800 });
  setEngine(engine);
  return engine;
}

// ---------------------------------------------------------------------------
// React bindings (structural sharing keeps re-renders cheap)
// ---------------------------------------------------------------------------

const EMPTY = '';

export function useDeck(): Deck {
  const engine = engineInstance;
  if (!engine) throw new Error('engine not bootstrapped');
  return useSyncExternalStore(
    (cb) => engine.subscribe((e) => (e.type === 'deck' ? cb() : undefined)),
    () => engine.deck,
  );
}

export function useSelection(): SelectionState {
  const engine = engineInstance;
  if (!engine) throw new Error('engine not bootstrapped');
  return useSyncExternalStore(
    (cb) => engine.subscribe((e) => (e.type === 'selection' ? cb() : undefined)),
    () => engine.selection,
  );
}

export function useViewport() {
  const engine = engineInstance;
  if (!engine) throw new Error('engine not bootstrapped');
  return useSyncExternalStore(
    (cb) => engine.subscribe((e) => (e.type === 'viewport' ? cb() : undefined)),
    () => engine.viewport,
  );
}

export function useCanUndoRedo(): { canUndo: boolean; canRedo: boolean } {
  // Derived from the deck reference: any command changes the deck, and
  // undo/redo mutate the stacks in lockstep with the deck.
  const deck = useDeck();
  const engine = engineInstance!;
  // getSnapshot must return a cached value (React contract) — recompute only
  // when the deck reference changes.
  const cache = useRef<{ deck: Deck; value: { canUndo: boolean; canRedo: boolean } } | null>(null);
  if (!cache.current || cache.current.deck !== deck) {
    cache.current = { deck, value: { canUndo: engine.canUndo, canRedo: engine.canRedo } };
  }
  return cache.current.value;
}

export function useAuditLog() {
  const engine = engineInstance;
  if (!engine) throw new Error('engine not bootstrapped');
  return useSyncExternalStore(
    (cb) => engine.subscribe((e) => (e.type === 'audit' ? cb() : undefined)),
    () => engine.auditLog,
  );
}

export function useEngineEvent(types: EngineEvent['type'][]): number {
  const engine = engineInstance;
  if (!engine) throw new Error('engine not bootstrapped');
  return useSyncExternalStore(
    (cb) => engine.subscribe((e) => (types.includes(e.type) ? cb() : undefined)),
    () => 0,
  );
}

export { EMPTY };
