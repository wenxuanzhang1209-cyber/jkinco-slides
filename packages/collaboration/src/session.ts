import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate as encodeAwareness, applyAwarenessUpdate as applyAwareness } from 'y-protocols/awareness';
import { CommandExecutor, deserializeCommand, restoreSnapshotCommand, serializeCommand } from '@jkinco/command-engine';

export interface UserPresence {
  id: number;
  name: string;
  color: string;
  cursor?: { slideId: string; x: number; y: number };
  selection?: string[];
  editingTextId?: string | null;
}

const COMMANDS_KEY = 'commands';
const PRESENCE_COLORS = ['#1E56A0', '#C0392B', '#0E7490', '#7B6FC0', '#B98A2F', '#5FB39A'];

/**
 * §19/§20 collaboration: command-log CRDT.
 * - The shared log is a Y.Array of serialized commands (append-only CRDT).
 *   Every mutation replays through each peer's CommandExecutor, so undo stays
 *   local and documents converge; remote commands never echo back (command-id
 *   dedupe).
 * - A `restoreSnapshot` baseline command is pushed by the first peer(s), so
 *   late joiners reconstruct the exact starting document. Concurrent first
 *   joins converge deterministically because Yjs orders concurrent inserts
 *   by client id identically on every peer.
 * - Presence (live cursors) rides on y-protocols Awareness.
 */
export class CollaborationSession {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private executor: CommandExecutor;
  private commandArray: Y.Array<string>;
  private seenCommandIds = new Set<string>();
  private applyingRemote = false;
  private unsubExecutor: () => void;
  private unsubCommands: (() => void) | void;
  private destroyed = false;

  constructor(
    executor: CommandExecutor,
    opts: { doc?: Y.Doc; clientId?: number; userName?: string; color?: string } = {},
  ) {
    this.executor = executor;
    this.doc = opts.doc ?? new Y.Doc();
    if (opts.clientId !== undefined) this.doc.clientID = opts.clientId;
    this.awareness = new Awareness(this.doc);
    const color = opts.color ?? PRESENCE_COLORS[this.doc.clientID % PRESENCE_COLORS.length];
    this.awareness.setLocalState({
      user: { name: opts.userName ?? `用户${this.doc.clientID % 100}`, color },
    });

    this.commandArray = this.doc.getArray<string>(COMMANDS_KEY);

    // Baseline snapshot: only when this peer sees an empty log (first join).
    if (this.commandArray.length === 0) {
      const baseline = restoreSnapshotCommand(executor.deck, '会话基线');
      this.seenCommandIds.add(baseline.id);
      this.doc.transact(() => {
        this.commandArray.push([JSON.stringify(serializeCommand(baseline))]);
      }, 'baseline');
    }

    // Local mutations → shared command log.
    this.unsubExecutor = executor.subscribe((event) => {
      if (this.destroyed || this.applyingRemote) return;
      if (event.type === 'apply' && event.entry) {
        const serialized = serializeCommand(event.entry.command);
        this.seenCommandIds.add(event.entry.command.id);
        this.doc.transact(() => {
          this.commandArray.push([JSON.stringify(serialized)]);
        }, 'local-command');
      }
      if (event.type === 'reset') {
        const snapshot = restoreSnapshotCommand(executor.deck, '会话重置');
        this.seenCommandIds.add(snapshot.id);
        this.doc.transact(() => {
          this.commandArray.push([JSON.stringify(serializeCommand(snapshot))]);
        }, 'local-reset');
      }
    });

    // Remote commands → replay locally through the executor.
    this.unsubCommands = this.commandArray.observe((event) => {
      if (this.destroyed) return;
      for (const delta of event.changes.delta) {
        if (delta.insert) {
          for (const item of delta.insert) {
            this.replayRemote(String(item));
          }
        }
      }
    });

    // Replay any commands that already exist (late join).
    this.doc.transact(() => {
      for (const item of this.commandArray.toArray()) {
        this.replayRemote(item);
      }
    }, 'initial-replay');
  }

  private replayRemote(serialized: string): void {
    if (this.destroyed) return;
    try {
      const command = deserializeCommand(JSON.parse(serialized));
      if (this.seenCommandIds.has(command.id)) return; // own command echo
      // A remote baseline never regresses a peer that already has edits.
      if (command.kind === 'restoreSnapshot' && this.executor.undoDepth > 0) return;
      this.applyingRemote = true;
      try {
        this.executor.apply(command);
      } finally {
        this.applyingRemote = false;
      }
      this.seenCommandIds.add(command.id);
    } catch {
      // Malformed remote command: skip (never crash the session).
    }
  }

  // -------------------------------------------------------------- presence

  setCursor(cursor: { slideId: string; x: number; y: number } | null): void {
    this.awareness.setLocalStateField('cursor', cursor);
  }

  setSelection(selection: string[]): void {
    this.awareness.setLocalStateField('selection', selection);
  }

  setEditingText(id: string | null): void {
    this.awareness.setLocalStateField('editingTextId', id);
  }

  get users(): UserPresence[] {
    const out: UserPresence[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      const user = (state as { user?: { name: string; color: string } }).user ?? { name: `用户${clientId}`, color: '#94A3B8' };
      out.push({
        id: clientId,
        name: user.name,
        color: user.color,
        cursor: (state as { cursor?: { slideId: string; x: number; y: number } }).cursor,
        selection: (state as { selection?: string[] }).selection,
        editingTextId: (state as { editingTextId?: string | null }).editingTextId ?? null,
      });
    });
    return out;
  }

  // ------------------------------------------------------------ transport

  /** Binary update for WebSocket/BroadcastChannel transport. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Apply a remote binary update. */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, 'remote-update');
  }

  get commandCount(): number {
    return this.commandArray.length;
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubExecutor();
    if (this.unsubCommands) this.unsubCommands();
    this.awareness.destroy();
  }
}

/** Encode awareness (presence) changes for transport. */
export function encodeAwarenessUpdate(session: CollaborationSession, changedClients?: number[]): Uint8Array {
  const changed = changedClients ?? Array.from(session.awareness.getStates().keys());
  return encodeAwareness(session.awareness, changed);
}

/** Apply a remote awareness update. */
export function applyAwarenessUpdate(session: CollaborationSession, update: Uint8Array): void {
  applyAwareness(session.awareness, update, 'remote-update');
}

/**
 * Wire sessions together through a manual update channel (tests and demo).
 * Syncs both document updates and presence. Returns an unsubscribe function.
 */
export function connectPeers(peers: CollaborationSession[]): () => void {
  const syncDoc = () => {
    for (const a of peers) {
      for (const b of peers) {
        if (a === b) continue;
        b.applyUpdate(a.encodeState());
      }
    }
  };
  const syncAwareness = () => {
    for (const a of peers) {
      for (const b of peers) {
        if (a === b) continue;
        const aw = encodeAwarenessUpdate(a);
        if (aw.length > 0) applyAwarenessUpdate(b, aw);
      }
    }
  };
  const unsubs: Array<() => void> = [];
  for (const p of peers) {
    const docHandler = (_update: Uint8Array, origin: unknown) => {
      if (origin === 'remote-update') return;
      syncDoc();
    };
    p.doc.on('update', docHandler);
    unsubs.push(() => p.doc.off('update', docHandler));
    const awHandler = (_changes: unknown, origin: unknown) => {
      if (origin === 'remote-update') return;
      syncAwareness();
    };
    (p.awareness as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on('update', awHandler);
    unsubs.push(() =>
      (p.awareness as unknown as { off: (event: string, fn: (...args: unknown[]) => void) => void }).off('update', awHandler),
    );
  }
  syncDoc();
  syncAwareness();
  return () => unsubs.forEach((u) => u());
}

export { Y };
