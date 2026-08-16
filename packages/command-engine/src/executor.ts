import type { Deck } from '@jkinco/scene-schema';
import type { Command } from './types';
import { compositeCommand } from './slide-commands';
import { deserializeCommand, serializeCommand } from './serialize';

export interface HistoryEntry {
  command: Command;
  before: Deck;
  after: Deck;
  at: number;
}

export interface ExecutorEvent {
  type: 'apply' | 'undo' | 'redo' | 'reset';
  entry?: HistoryEntry;
  deck: Deck;
  undoDepth: number;
  redoDepth: number;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  deck: Deck;
}

/**
 * The one and only mutation point of the document. Both the user and the AI
 * mutate the deck through this executor (§7.2) so every change is:
 * undoable, replayable, auditable, collaborative.
 *
 * Because the deck is immutable with structural sharing, each history entry
 * keeps O(1) references to its before/after states — unlimited-feeling history
 * at zero memory cost.
 */
export class CommandExecutor {
  private _deck: Deck;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<(event: ExecutorEvent) => void>();
  private maxHistory: number;

  constructor(deck: Deck, opts: { maxHistory?: number } = {}) {
    this._deck = deck;
    this.maxHistory = opts.maxHistory ?? 500;
  }

  get deck(): Deck {
    return this._deck;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  history(): readonly HistoryEntry[] {
    return this.undoStack;
  }

  subscribe(listener: (event: ExecutorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ExecutorEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors must not break the executor
      }
    }
  }

  /** Replace the document (e.g. remote sync, file open) and reset history. */
  setDeck(deck: Deck, opts: { resetHistory?: boolean } = {}): void {
    this._deck = deck;
    if (opts.resetHistory !== false) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.emit({ type: 'reset', deck: this._deck, undoDepth: 0, redoDepth: 0 });
  }

  /** Apply a single command. Validates first; a failure leaves the deck untouched. */
  apply(command: Command): ApplyResult {
    const error = command.validate(this._deck);
    if (error) return { ok: false, error, deck: this._deck };
    const before = this._deck;
    const after = command.applyTo(before);
    const entry: HistoryEntry = { command, before, after, at: Date.now() };
    this._deck = after;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
    this.emit({
      type: 'apply',
      entry,
      deck: after,
      undoDepth: this.undoStack.length,
      redoDepth: 0,
    });
    return { ok: true, deck: after };
  }

  /**
   * Apply several commands as ONE undoable unit (§19 — "AI changed 6 objects"
   * shows as a single history entry). Returns the composite's result.
   */
  applyMany(commands: Command[], opts: { label?: string; actor?: Command['actor']; aiNote?: string } = {}): ApplyResult {
    if (commands.length === 0) return { ok: false, error: '没有命令', deck: this._deck };
    const composite = compositeCommand(commands, { label: opts.label, actor: opts.actor, aiNote: opts.aiNote });
    return this.apply(composite);
  }

  undo(): ApplyResult {
    const entry = this.undoStack.pop();
    if (!entry) return { ok: false, error: '没有可撤销的操作', deck: this._deck };
    this._deck = entry.before;
    this.redoStack.push(entry);
    this.emit({
      type: 'undo',
      entry,
      deck: this._deck,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    });
    return { ok: true, deck: this._deck };
  }

  redo(): ApplyResult {
    const entry = this.redoStack.pop();
    if (!entry) return { ok: false, error: '没有可重做的操作', deck: this._deck };
    this._deck = entry.after;
    this.undoStack.push(entry);
    this.emit({
      type: 'redo',
      entry,
      deck: this._deck,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    });
    return { ok: true, deck: this._deck };
  }

  /** Undo back to a named checkpoint (§34) if present. */
  undoTo(predicate: (entry: HistoryEntry) => boolean): number {
    let count = 0;
    while (this.canUndo) {
      const top = this.undoStack[this.undoStack.length - 1]!;
      const done = predicate(top);
      this.undo();
      count += 1;
      if (done) break;
    }
    return count;
  }

  serializeCommand(command: Command): string {
    return JSON.stringify(serializeCommand(command));
  }

  deserializeCommand(json: string | object): Command {
    return deserializeCommand(json);
  }

  /** Serialize the whole document. */
  serializeDeck(): string {
    return JSON.stringify(this._deck);
  }
}
