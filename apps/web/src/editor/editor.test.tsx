import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDeck, createShape, createSlide, createText } from '@jkinco/scene-schema';
import { createSessionEngine, getEngine } from '../state/appState';
import { EditorPage } from './EditorPage';

function makeDeck() {
  const slide = createSlide({
    name: '第一页',
    elements: [
      createText(40, 40, 400, 60, '课题启动', { id: 't1', zIndex: 0, role: 'title', style: { fontSize: 32 } }),
      createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1, text: '框图A' }),
      createShape('roundRect', 400, 300, 200, 100, { id: 's2', zIndex: 2, text: '框图B' }),
    ],
  });
  const slide2 = createSlide({ name: '第二页', elements: [createText(40, 40, 400, 60, '第二页标题', { id: 't2', zIndex: 0 })] });
  return createDeck({ title: '测试演示文稿', slides: [slide, slide2] });
}

function renderEditor() {
  const engine = createSessionEngine(makeDeck());
  engine.setViewport({ zoom: 1, panX: 0, panY: 0 });
  return engine;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Editor shell (§6)', () => {
  it('renders rail, canvas, inspector and AI bar', () => {
    renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    expect(screen.getByTestId('thumbnail-rail')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-scroll')).toBeInTheDocument();
    expect(screen.getByTestId('inspector')).toBeInTheDocument();
    expect(screen.getByTestId('ai-bar')).toBeInTheDocument();
    expect(screen.getByTestId('ai-input')).toHaveAttribute('placeholder', expect.stringContaining('Ask AI'));
    expect(screen.getByTestId('top-bar')).toBeInTheDocument();
  });

  it('shows live thumbnails for every slide', () => {
    renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const thumbs = screen.getAllByTestId('thumbnail');
    expect(thumbs).toHaveLength(2);
    expect(screen.getByText(/1\. 第一页/)).toBeInTheDocument();
  });

  it('thumbnail click switches the current slide', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const thumbs = screen.getAllByTestId('thumbnail');
    await userEvent.click(thumbs[1]!);
    expect(engine.currentSlideId).toBe(engine.deck.slides[1]!.id);
  });
});

describe('Canvas selection and moving (§7.1)', () => {
  it('click selects an element', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    fireEvent.pointerDown(stage, { clientX: 150, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 150, pointerId: 1 });
    expect(engine.selection.elementIds).toContain('s1');
    expect(screen.getByTestId('selection-overlay')).toBeInTheDocument();
  });

  it('drag moves an element and commits one undoable command', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    fireEvent.pointerDown(stage, { clientX: 150, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 450, clientY: 450, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 450, clientY: 450, pointerId: 1 });
    const s1 = engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!;
    // 100 + 350 delta, grid-snapped to 8pt
    expect(Math.abs(s1.x - 400)).toBeLessThanOrEqual(8);
    expect(Math.abs(s1.y - 400)).toBeLessThanOrEqual(8);
    // one undo step restores original position
    engine.undo();
    const restored = engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!;
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('marquee selects multiple elements', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    // empty area drag forming a big rectangle over both shapes
    fireEvent.pointerDown(stage, { clientX: 10, clientY: 450, button: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 900, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 900, clientY: 20, pointerId: 1 });
    expect(engine.selection.elementIds).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('double-click enters text editing and commit updates the deck', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    fireEvent.doubleClick(stage, { clientX: 60, clientY: 60 });
    expect(engine.selection.editingTextId).toBe('t1');
    const editor = await screen.findByTestId('text-editor-input');
    fireEvent.input(editor, { target: { innerText: '课题正式启动' } });
    fireEvent.blur(editor);
    expect(engine.selection.editingTextId).toBeNull();
    const t1 = engine.deck.slides[0]!.elements.find((e) => e.id === 't1')!;
    if (t1.type === 'text') expect(t1.text.paragraphs[0]!.runs[0]!.text).toBe('课题正式启动');
  });

  it('delete key removes selection; undo restores', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    fireEvent.pointerDown(stage, { clientX: 150, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(engine.deck.slides[0]!.elements.some((e) => e.id === 's1')).toBe(false);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(engine.deck.slides[0]!.elements.some((e) => e.id === 's1')).toBe(true);
  });

  it('arrow keys nudge selection by 1pt / shift 10pt', () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const stage = screen.getByTestId('slide-stage');
    fireEvent.pointerDown(stage, { clientX: 150, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(101);
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!.y).toBe(110);
  });

  it('cmd+A selects all, cmd+G groups', () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(engine.selection.elementIds.length).toBe(3);
    fireEvent.keyDown(window, { key: 'g', metaKey: true });
    expect(engine.deck.slides[0]!.elements.some((e) => e.type === 'group')).toBe(true);
    fireEvent.keyDown(window, { key: 'g', metaKey: true, shiftKey: true });
    expect(engine.deck.slides[0]!.elements.some((e) => e.type === 'group')).toBe(false);
  });
});

describe('Top bar actions', () => {
  it('undo/redo buttons reflect history state', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const undoBtn = screen.getByTestId('undo');
    expect(undoBtn).toBeDisabled();
    engine.insertSlide(2);
    await waitFor(() => expect(screen.getByTestId('undo')).not.toBeDisabled());
    await userEvent.click(screen.getByTestId('undo'));
    expect(engine.deck.slides.length).toBe(2);
  });

  it('add/duplicate/delete slide via rail', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    await userEvent.click(screen.getByTestId('add-slide'));
    expect(engine.deck.slides.length).toBe(3);
    await userEvent.click(screen.getAllByTestId('duplicate-slide')[0]!);
    expect(engine.deck.slides.length).toBe(4);
    await userEvent.click(screen.getAllByTestId('delete-slide')[0]!);
    expect(engine.deck.slides.length).toBe(3);
  });
});

describe('Inspector (§6 contextual)', () => {
  it('shows slide panel when nothing is selected', () => {
    renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    expect(screen.getByTestId('slide-panel')).toBeInTheDocument();
    expect(screen.getByTestId('density-score')).toBeInTheDocument();
  });

  it('shows element panel when an element is selected', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    engine.selectElements(['s1']);
    await waitFor(() => expect(screen.getByTestId('element-panel')).toBeInTheDocument());
    expect(screen.getByTestId('shape-panel')).toBeInTheDocument();
  });

  it('shows multi-select panel with align actions', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    engine.selectElements(['s1', 's2']);
    await waitFor(() => expect(screen.getByTestId('multiselect-panel')).toBeInTheDocument());
  });

  it('notes update goes through commands', async () => {
    const engine = renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    const notes = screen.getByTestId('slide-notes');
    await userEvent.type(notes, '第一页备注');
    fireEvent.blur(notes);
    expect(engine.deck.slides[0]!.notes).toContain('第一页备注');
    engine.undo();
    expect(engine.deck.slides[0]!.notes ?? '').not.toContain('第一页备注');
  });
});

describe('Command palette (§6 ⌘K)', () => {
  it('opens with ⌘K and closes with Escape', async () => {
    renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('palette-input'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument());
  });

  it('lists AI commands and shortcuts', () => {
    renderEditor();
    render(<EditorPage onPresent={() => undefined} onHome={() => undefined} onStoryboard={() => undefined} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByText(/AI：精简当前页文字/)).toBeInTheDocument();
    expect(screen.getByText(/AI：生成 3 个备选版式/)).toBeInTheDocument();
  });
});
