import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CollaborationSession, applyAwarenessUpdate, encodeAwarenessUpdate } from '@jkinco/collaboration';
import { getEngine, useSelection, useViewport } from '../state/appState';

const CHANNEL_NAME = 'jkinco-slides-collab';

/** Stable user name: persisted on first generation (getSnapshot must be cached). */
function getLocalUserName(): string {
  const stored = localStorage.getItem('jkinco:username');
  if (stored) return stored;
  const generated = `用户${Math.floor(Math.random() * 90 + 10)}`;
  localStorage.setItem('jkinco:username', generated);
  return generated;
}

/**
 * §19 live collaboration over BroadcastChannel (same-browser multi-tab demo;
 * the session transport is pluggable for a WebSocket backend).
 * Presence: live cursors and selections.
 */
export function useCollaboration(): { users: Array<{ id: number; name: string; color: string; cursor?: { slideId: string; x: number; y: number } }>; localId: number; enabled: boolean } {
  const engine = getEngine();
  const selection = useSelection();
  const viewport = useViewport();
  const sessionRef = useRef<CollaborationSession | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [, forceRender] = useState(0);

  const userName = useSyncExternalStore(
    (cb) => {
      window.addEventListener('jkinco:username', cb);
      return () => window.removeEventListener('jkinco:username', cb);
    },
    () => getLocalUserName(),
  );

  useEffect(() => {
    let session: CollaborationSession | null = null;
    let channel: BroadcastChannel | null = null;
    try {
      session = new CollaborationSession(engine.executor, { userName });
      sessionRef.current = session;
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        channel.onmessage = (event: MessageEvent) => {
          const data = event.data as { kind: string; payload: unknown };
          if (data.kind === 'doc-update' && session) {
            try {
              session.applyUpdate(new Uint8Array((data.payload as number[]) ?? []));
            } catch {
              // ignore malformed frames
            }
          } else if (data.kind === 'awareness-update' && session) {
            try {
              applyAwarenessUpdate(session, new Uint8Array((data.payload as number[]) ?? []));
            } catch {
              // ignore
            }
          }
        };
        // Broadcast initial state to late-joining tabs.
        channel.postMessage({ kind: 'doc-update', payload: Array.from(session.encodeState()) });
        channel.postMessage({ kind: 'awareness-update', payload: Array.from(encodeAwarenessUpdate(session)) });
      }
      const onDocUpdate = () => {
        if (channel && session) {
          channel.postMessage({ kind: 'doc-update', payload: Array.from(session.encodeState()) });
        }
        forceRender((x) => x + 1);
      };
      const onAwarenessUpdate = () => {
        if (channel && session) {
          channel.postMessage({ kind: 'awareness-update', payload: Array.from(encodeAwarenessUpdate(session)) });
        }
        forceRender((x) => x + 1);
      };
      session.doc.on('update', onDocUpdate);
      (session.awareness as unknown as { on: (e: string, fn: () => void) => void }).on('update', onAwarenessUpdate);
      const id = setInterval(() => forceRender((x) => x + 1), 3000); // prune stale presence
      return () => {
        clearInterval(id);
        session?.destroy();
        channel?.close();
        sessionRef.current = null;
        channelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [engine, userName]);

  // Publish cursor + selection on selection/viewport changes.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    const slideId = selection.slideId;
    session.setSelection(selection.elementIds);
    session.setEditingText(selection.editingTextId);
    if (slideId) {
      session.setCursor({ slideId, x: viewport.panX, y: viewport.panY });
    }
  }, [selection, viewport]);

  const session = sessionRef.current;
  const users = session
    ? session.users.map((u) => ({ id: u.id, name: u.name, color: u.color, cursor: u.cursor }))
    : [];
  return {
    users,
    localId: session ? session.doc.clientID : -1,
    enabled: Boolean(session),
  };
}
