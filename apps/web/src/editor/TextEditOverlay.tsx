import React, { useEffect, useRef, useState } from 'react';
import type { Slide } from '@jkinco/scene-schema';
import { textFromPlain, textToPlain } from '@jkinco/scene-schema';
import { getEngine } from '../state/appState';

/**
 * Double-click text editing overlay (§44.1: instant entry).
 * A transparent contenteditable exactly over the element; commit on blur
 * or Enter/Escape. Commits go through updateText commands → undoable.
 */
export function TextEditOverlay({ slide, elementId, zoom }: { slide: Slide; elementId: string; zoom: number }) {
  const engine = getEngine();
  const el = slide.elements.find((e) => e.id === elementId);
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const committedRef = useRef(false);

  const text = el && (el.type === 'text' || el.type === 'shape') ? el.text : undefined;
  const style = el?.type === 'text' ? el.style : el?.type === 'shape' ? el.textStyle : undefined;

  useEffect(() => {
    if (text) {
      setValue(textToPlain(text));
      valueRef.current = textToPlain(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId]);

  const doCommit = (clearEditing = true) => {
    if (committedRef.current) return;
    const next = textFromPlain(valueRef.current.replace(/\u00a0/g, ' '), style?.align ?? 'left');
    const current = el && (el.type === 'text' || el.type === 'shape') ? textToPlain(el.text) : '';
    const changed = next.paragraphs[0]?.runs[0]?.text !== current;
    if (!changed && !clearEditing) {
      // Nothing to write (e.g. StrictMode's mount-time effect cleanup).
      return;
    }
    committedRef.current = true;
    if (changed) {
      engine.updateText(elementId, next);
    }
    if (clearEditing) engine.setEditingText(null);
  };

  // Commit pending edits even when the overlay is unmounted without blur
  // (e.g. clicking the canvas clears the editing state first). Never clear
  // the editing state from the unmount path: in StrictMode dev the effect
  // cleanup runs immediately after mount and would close the editor.
  useEffect(() => () => doCommit(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    // place caret at end
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  if (!el || !text) return null;

  const fontSize = style?.fontSize ?? 18;
  const color = style?.color ?? '#1E293B';
  const align = style?.align ?? 'left';

  const commit = () => {
    doCommit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      engine.setEditingText(null);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div
      data-testid="text-editor"
      className="absolute text-edit-surface"
      style={{
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        zIndex: 1000,
        cursor: 'text',
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-testid="text-editor-input"
        onInput={(e) => {
          const v = (e.target as HTMLDivElement).innerText;
          setValue(v);
          valueRef.current = v;
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          height: '100%',
          outline: 'none',
          fontSize,
          color,
          textAlign: align as React.CSSProperties['textAlign'],
          lineHeight: style?.lineSpacing ?? 1.4,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          overflow: 'hidden',
          caretColor: '#1E56A0',
          fontFamily: style?.fontFamily,
          fontWeight: style?.bold ? 700 : 400,
          fontStyle: style?.italic ? 'italic' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  );
}
