import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createShape,
  createSlide,
  createText,
  deepClone,
  textFromPlain,
} from '@jkinco/scene-schema';
import { CommandExecutor, moveElementsCommand, updateTextCommand } from '@jkinco/command-engine';
import { CollaborationSession, connectPeers } from './session';

function makeDeck() {
  const slide = createSlide({
    elements: [
      createText(40, 40, 400, 60, '标题', { id: 't1', zIndex: 0 }),
      createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1 }),
    ],
  });
  return createDeck({ slides: [slide] });
}

describe('CollaborationSession (§19 multi-user editing)', () => {
  it('replicates commands across two peers and converges', () => {
    const deckA = makeDeck();
    const deckB = deepClone(deckA);
    const execA = new CommandExecutor(deckA);
    const execB = new CommandExecutor(deckB);
    const a = new CollaborationSession(execA, { clientId: 11, userName: '甲' });
    const b = new CollaborationSession(execB, { clientId: 22, userName: '乙' });

    const disconnect = connectPeers([a, b]);
    try {
      const slideId = deckA.slides[0]!.id;
      execA.apply(moveElementsCommand({ slideId, moves: [{ id: 's1', x: 300, y: 300 }] }));
      execA.apply(updateTextCommand({ slideId, id: 't1', text: textFromPlain('协同标题') }));

      expect(execB.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(300);
      expect(JSON.stringify(execA.deck)).toBe(JSON.stringify(execB.deck));

      // Concurrent edit from B also reaches A.
      execB.apply(moveElementsCommand({ slideId, moves: [{ id: 's1', x: 500, y: 500 }] }));
      expect(execA.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(500);
      expect(JSON.stringify(execA.deck)).toBe(JSON.stringify(execB.deck));
    } finally {
      disconnect();
    }
  });

  it('undo stays local — remote peers are not rolled back', () => {
    const deckA = makeDeck();
    const deckB = deepClone(deckA);
    const execA = new CommandExecutor(deckA);
    const execB = new CommandExecutor(deckB);
    const a = new CollaborationSession(execA, { clientId: 31 });
    const b = new CollaborationSession(execB, { clientId: 32 });
    const disconnect = connectPeers([a, b]);
    try {
      const slideId = deckA.slides[0]!.id;
      execA.apply(moveElementsCommand({ slideId, moves: [{ id: 's1', x: 222, y: 222 }] }));
      expect(execB.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(222);
      execA.undo(); // local undo
      expect(execA.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(100);
      expect(execB.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(222);
    } finally {
      disconnect();
    }
  });

  it('late joiner replays the whole command log', () => {
    const deckA = makeDeck();
    const execA = new CommandExecutor(deckA);
    const a = new CollaborationSession(execA, { clientId: 41 });
    const slideId = deckA.slides[0]!.id;
    execA.apply(moveElementsCommand({ slideId, moves: [{ id: 's1', x: 420, y: 420 }] }));

    // Late joiner starts from the ORIGINAL deck, then syncs.
    const execB = new CommandExecutor(deepClone(deckA));
    const b = new CollaborationSession(execB, { clientId: 42 });
    const disconnect = connectPeers([a, b]);
    try {
      expect(execB.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(420);
      expect(JSON.stringify(execA.deck)).toBe(JSON.stringify(execB.deck));
    } finally {
      disconnect();
    }
  });

  it('tolerates a malformed remote command without crashing', () => {
    const deckA = makeDeck();
    const execA = new CommandExecutor(deckA);
    const a = new CollaborationSession(execA, { clientId: 51 });
    const execB = new CommandExecutor(deepClone(deckA));
    const b = new CollaborationSession(execB, { clientId: 52 });
    // Inject garbage directly into A's log.
    (a as unknown as { doc: { getArray: (k: string) => { push: (v: unknown[]) => void } } }).doc
      .getArray('commands')
      .push(['{"kind":"nope"}']);
    const disconnect = connectPeers([a, b]);
    try {
      // B must survive and keep its deck valid.
      expect(execB.deck.slides.length).toBe(1);
      expect(execB.deck.slides[0]!.elements.length).toBe(2);
    } finally {
      disconnect();
    }
  });

  it('presence: cursors and selections propagate (§19 live cursor)', () => {
    const execA = new CommandExecutor(makeDeck());
    const execB = new CommandExecutor(deepClone(makeDeck()));
    const a = new CollaborationSession(execA, { clientId: 61, userName: '甲', color: '#111111' });
    const b = new CollaborationSession(execB, { clientId: 62, userName: '乙', color: '#222222' });
    const disconnect = connectPeers([a, b]);
    try {
      a.setCursor({ slideId: 's1', x: 10, y: 20 });
      a.setSelection(['t1']);
      expect(b.users.length).toBe(2);
      const other = b.users.find((u) => u.id === 61)!;
      expect(other.name).toBe('甲');
      expect(other.color).toBe('#111111');
      expect(other.cursor).toEqual({ slideId: 's1', x: 10, y: 20 });
      expect(other.selection).toEqual(['t1']);
    } finally {
      disconnect();
    }
  });

  it('binary updates work as a transport (BroadcastChannel-style)', () => {
    const execA = new CommandExecutor(makeDeck());
    const a = new CollaborationSession(execA, { clientId: 71 });
    const update = a.encodeState();
    expect(update).toBeInstanceOf(Uint8Array);
    expect(update.length).toBeGreaterThan(0);

    const execB = new CommandExecutor(deepClone(makeDeck()));
    const b = new CollaborationSession(execB, { clientId: 72 });
    b.applyUpdate(update);
    expect(JSON.stringify(execA.deck)).toBe(JSON.stringify(execB.deck));
  });
});
