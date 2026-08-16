import { describe, expect, it } from 'vitest';
import {
  createChart,
  createDeck,
  createShape,
  createSlide,
  createText,
  createConnector,
  createImage,
  deepClone,
  textFromPlain,
} from '@jkinco/scene-schema';
import {
  CommandExecutor,
  alignCommand,
  applyLayoutCommand,
  bindDataCommand,
  compositeCommand,
  createElementsCommand,
  deleteElementsCommand,
  deleteSlideCommand,
  deserializeCommand,
  distributeCommand,
  duplicateSlideCommand,
  groupCommand,
  insertSlideCommand,
  mergeSlidesCommand,
  moveElementsCommand,
  moveSlideCommand,
  replaceAssetCommand,
  resizeElementCommand,
  rotateElementCommand,
  splitSlideCommand,
  ungroupCommand,
  updateElementPropsCommand,
  updateSlidePropsCommand,
  updateStyleCommand,
  updateTextCommand,
  zOrderCommand,
} from './index';

function makeDeck() {
  const slide = createSlide({
    elements: [
      createText(40, 40, 400, 60, '标题', { id: 't1', zIndex: 0 }),
      createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1 }),
      createShape('rect', 400, 100, 200, 100, { id: 's2', zIndex: 2 }),
    ],
  });
  const slide2 = createSlide({ elements: [createText(40, 40, 400, 60, '第二页', { id: 't2', zIndex: 0 })] });
  const deck = createDeck({ slides: [slide, slide2] });
  return { deck, executor: new CommandExecutor(deck) };
}

describe('CommandExecutor basics', () => {
  it('applies valid commands and rejects invalid ones', () => {
    const { executor } = makeDeck();
    const result = executor.apply(
      moveElementsCommand({ slideId: executor.deck.slides[0]!.id, moves: [{ id: 's1', x: 50, y: 60 }] }),
    );
    expect(result.ok).toBe(true);
    const el = result.deck.slides[0]!.elements.find((e) => e.id === 's1')!;
    expect(el.x).toBe(50);
    expect(el.y).toBe(60);

    const bad = executor.apply(moveElementsCommand({ slideId: 'nope', moves: [{ id: 's1', x: 0, y: 0 }] }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('页面不存在');
  });

  it('undo/redo restores exact state (deep equal)', () => {
    const { deck, executor } = makeDeck();
    const before = JSON.stringify(deck);
    executor.apply(moveElementsCommand({ slideId: deck.slides[0]!.id, moves: [{ id: 's1', x: 12, y: 34 }] }));
    executor.apply(updateTextCommand({ slideId: deck.slides[0]!.id, id: 't1', text: textFromPlain('新标题') }));
    expect(JSON.stringify(executor.deck)).not.toBe(before);

    executor.undo();
    executor.undo();
    expect(JSON.stringify(executor.deck)).toBe(before);

    executor.redo();
    executor.redo();
    expect(executor.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(12);
  });

  it('create → delete → undo round trip', () => {
    const { deck, executor } = makeDeck();
    const before = JSON.stringify(deck);
    const slideId = deck.slides[0]!.id;
    const created = createShape('roundRect', 10, 10, 100, 50, { id: 'new1' });
    executor.apply(createElementsCommand({ slideId, elements: [created] }));
    expect(executor.deck.slides[0]!.elements.length).toBe(4);
    executor.apply(deleteElementsCommand({ slideId, elementIds: ['new1'] }));
    expect(executor.deck.slides[0]!.elements.length).toBe(3);
    executor.undo();
    executor.undo();
    expect(JSON.stringify(executor.deck)).toBe(before);
  });

  it('applyMany creates ONE undoable unit (§19 AI changed N objects)', () => {
    const { executor, deck } = makeDeck();
    const slideId = deck.slides[0]!.id;
    const result = executor.applyMany(
      [
        moveElementsCommand({ slideId, moves: [{ id: 's1', x: 1, y: 2 }] }),
        updateTextCommand({ slideId, id: 't1', text: textFromPlain('改') }),
      ],
      { label: 'AI changed 2 objects', actor: 'ai' },
    );
    expect(result.ok).toBe(true);
    expect(executor.undoDepth).toBe(1);
    const entry = executor.history()[0]!;
    expect(entry.command.label).toBe('AI changed 2 objects');
    expect(entry.command.actor).toBe('ai');
    executor.undo();
    expect(executor.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(100);
  });
});

describe('transform commands', () => {
  it('move expands groups so children follow', () => {
    const { executor, deck } = makeDeck();
    const slideId = deck.slides[0]!.id;
    executor.apply(groupCommand({ slideId, elementIds: ['s1', 's2'] }));
    const group = executor.deck.slides[0]!.elements.find((e) => e.type === 'group')!;
    executor.apply(moveElementsCommand({ slideId, moves: [{ id: group.id, x: 300, y: 400 }] }));
    const s1 = executor.deck.slides[0]!.elements.find((e) => e.id === 's1')!;
    expect(s1.x).toBe(300);
    expect(s1.y).toBe(400);
  });

  it('move keeps bound connectors glued', () => {
    const slide = createSlide({
      elements: [
        createShape('rect', 100, 100, 100, 60, { id: 'node' }),
        createConnector({ x: 150, y: 160 }, { x: 300, y: 160 }, { id: 'edge', fromId: 'node' }),
      ],
    });
    const executor = new CommandExecutor(createDeck({ slides: [slide] }));
    executor.apply(moveElementsCommand({ slideId: slide.id, moves: [{ id: 'node', x: 400, y: 300 }] }));
    const edge = executor.deck.slides[0]!.elements.find((e) => e.id === 'edge')!;
    if (edge.type === 'connector') {
      expect(edge.start.x).toBe(450);
      expect(edge.start.y).toBe(330);
    } else {
      throw new Error('edge missing');
    }
  });

  it('resize / rotate / style / props commands work and invert', () => {
    const { deck, executor } = makeDeck();
    const before = JSON.stringify(deck);
    const slideId = deck.slides[0]!.id;
    executor.apply(resizeElementCommand({ slideId, id: 's1', x: 0, y: 0, w: 300, h: 150 }));
    executor.apply(rotateElementCommand({ slideId, id: 's1', rotation: 45 }));
    executor.apply(updateStyleCommand({ slideId, id: 's1', patch: { fill: { type: 'solid', color: '#FF0000', opacity: 1 } } }));
    executor.apply(updateElementPropsCommand({ slideId, id: 's1', patch: { locked: true, opacity: 0.5 } }));
    const s1 = executor.deck.slides[0]!.elements.find((e) => e.id === 's1')!;
    expect(s1.w).toBe(300);
    expect(s1.rotation).toBe(45);
    if (s1.type === 'shape') expect(s1.fill.color).toBe('#FF0000');
    expect(s1.locked).toBe(true);
    expect(s1.opacity).toBe(0.5);
    for (let i = 0; i < 4; i++) executor.undo();
    expect(JSON.stringify(executor.deck)).toBe(before);
  });

  it('z-order ops reorder elements', () => {
    const { deck, executor } = makeDeck();
    const slideId = deck.slides[0]!.id;
    executor.apply(zOrderCommand({ slideId, elementIds: ['t1'], op: 'front' }));
    let els = executor.deck.slides[0]!.elements;
    expect(els[els.length - 1]!.id).toBe('t1');
    executor.apply(zOrderCommand({ slideId, elementIds: ['t1'], op: 'back' }));
    els = executor.deck.slides[0]!.elements;
    expect(els[0]!.id).toBe('t1');
  });

  it('align and distribute position elements', () => {
    const { deck, executor } = makeDeck();
    const slideId = deck.slides[0]!.id;
    executor.apply(alignCommand({ slideId, elementIds: ['s1', 's2'], mode: 'top' }));
    let els = executor.deck.slides[0]!.elements.filter((e) => e.id === 's1' || e.id === 's2');
    expect(els[0]!.y).toBe(els[1]!.y);

    // Distribute needs ≥3 elements: add a middle shape.
    const mid = createShape('rect', 300, 100, 100, 100, { id: 's3' });
    executor.apply(createElementsCommand({ slideId, elements: [mid] }));
    executor.apply(moveElementsCommand({ slideId, moves: [{ id: 's1', x: 100, y: 100 }] }));
    executor.apply(moveElementsCommand({ slideId, moves: [{ id: 's2', x: 900, y: 100 }] }));
    executor.apply(moveElementsCommand({ slideId, moves: [{ id: 's3', x: 100, y: 100 }] }));
    executor.apply(distributeCommand({ slideId, elementIds: ['s1', 's3', 's2'], axis: 'horizontal' }));
    els = executor.deck.slides[0]!.elements.filter((e) => e.id === 's1' || e.id === 's3' || e.id === 's2');
    const sorted = [...els].sort((a, b) => a.x - b.x);
    expect(sorted[0]!.x).toBe(100);
    expect(sorted[2]!.x).toBe(900);
    // Equal gaps: total gap 600 split in two → 300 each.
    expect(sorted[1]!.x).toBeCloseTo(100 + 200 + 300);
  });

  it('replaceAsset swaps image src', () => {
    const img = createImage(0, 0, 100, 100, 'old.png', { id: 'i1' });
    const slide = createSlide({ elements: [img] });
    const executor = new CommandExecutor(createDeck({ slides: [slide] }));
    executor.apply(replaceAssetCommand({ slideId: slide.id, id: 'i1', src: 'new.png' }));
    const el = executor.deck.slides[0]!.elements[0]!;
    if (el.type === 'image') expect(el.src).toBe('new.png');
    executor.undo();
    const el2 = executor.deck.slides[0]!.elements[0]!;
    if (el2.type === 'image') expect(el2.src).toBe('old.png');
  });
});

describe('slide commands', () => {
  it('insert / move / delete slide with undo', () => {
    const { deck, executor } = makeDeck();
    const before = JSON.stringify(deck);
    const s = createSlide({ elements: [createText(0, 0, 100, 50, 'x')] });
    executor.apply(insertSlideCommand({ index: 1, slide: s }));
    expect(executor.deck.slides.length).toBe(3);
    executor.apply(moveSlideCommand({ slideId: s.id, toIndex: 0 }));
    expect(executor.deck.slides[0]!.id).toBe(s.id);
    executor.apply(deleteSlideCommand({ slideId: s.id }));
    expect(executor.deck.slides.length).toBe(2);
    executor.undo();
    executor.undo();
    executor.undo();
    expect(JSON.stringify(executor.deck)).toBe(before);
  });

  it('duplicate slide remaps all internal references', () => {
    const node1 = createShape('rect', 0, 0, 100, 60, { id: 'n1', text: 'A' });
    const node2 = createShape('rect', 200, 0, 100, 60, { id: 'n2', text: 'B' });
    const edge = createConnector({ x: 0, y: 0 }, { x: 100, y: 0 }, { id: 'e1', fromId: 'n1', toId: 'n2' });
    const slide = createSlide({ elements: [node1, node2, edge] });
    const executor = new CommandExecutor(createDeck({ slides: [slide] }));
    executor.apply(duplicateSlideCommand({ slideId: slide.id }));
    const copy = executor.deck.slides[1]!;
    expect(copy.id).not.toBe(slide.id);
    expect(copy.elements.length).toBe(3);
    const ids = copy.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    const copiedEdge = copy.elements.find((e) => e.type === 'connector');
    if (copiedEdge && copiedEdge.type === 'connector') {
      expect(ids).toContain(copiedEdge.fromId);
      expect(ids).toContain(copiedEdge.toId);
      expect(copiedEdge.fromId).not.toBe('n1');
    } else {
      throw new Error('edge not duplicated');
    }
  });

  it('split slide moves elements to a new slide; undo restores', () => {
    const { deck, executor } = makeDeck();
    const before = JSON.stringify(deck);
    const slideId = deck.slides[0]!.id;
    executor.apply(splitSlideCommand({ slideId, elementIds: ['s2'], newTitle: '续页' }));
    expect(executor.deck.slides.length).toBe(3);
    expect(executor.deck.slides[0]!.elements.length).toBe(2);
    expect(executor.deck.slides[1]!.elements.length).toBe(1);
    expect(executor.deck.slides[1]!.elements[0]!.id).toBe('s2');
    executor.undo();
    expect(JSON.stringify(executor.deck)).toBe(before);
  });

  it('merge slides combines elements and notes', () => {
    const { deck, executor } = makeDeck();
    const a = deck.slides[0]!.id;
    const b = deck.slides[1]!.id;
    executor.apply(updateSlidePropsCommand({ slideId: b, patch: { notes: '第二页备注' } }));
    executor.apply(mergeSlidesCommand({ sourceSlideId: b, targetSlideId: a }));
    expect(executor.deck.slides.length).toBe(1);
    const merged = executor.deck.slides[0]!;
    expect(merged.elements.length).toBe(4);
    expect(merged.notes).toContain('第二页备注');
  });
});

describe('deck-level commands', () => {
  it('applyLayout replaces slide elements and is undoable', () => {
    const { deck, executor } = makeDeck();
    const slideId = deck.slides[0]!.id;
    const layoutEls = [createText(40, 40, 600, 80, '新版式标题', { id: 'L1', zIndex: 0 })];
    executor.apply(applyLayoutCommand({ slideId, layoutId: 'hero', elements: layoutEls }));
    expect(executor.deck.slides[0]!.elements.length).toBe(1);
    expect(executor.deck.slides[0]!.layoutId).toBe('hero');
    executor.undo();
    expect(executor.deck.slides[0]!.elements.length).toBe(3);
  });

  it('bindData updates chart series with validation', () => {
    const chart = createChart('column', 40, 40, 400, 240, ['a', 'b'], [{ name: 's', data: [1, 2] }], { id: 'c1' });
    const slide = createSlide({ elements: [chart] });
    const executor = new CommandExecutor(createDeck({ slides: [slide] }));
    const bad = executor.apply(
      bindDataCommand({ slideId: slide.id, id: 'c1', dataSource: 'd1', categories: ['x'], series: [{ name: 's', data: [1, 2] }] }),
    );
    expect(bad.ok).toBe(false);
    const good = executor.apply(
      bindDataCommand({ slideId: slide.id, id: 'c1', dataSource: 'd1', categories: ['x', 'y'], series: [{ name: 's', data: [5, 6] }] }),
    );
    expect(good.ok).toBe(true);
    const c = executor.deck.slides[0]!.elements[0]!;
    if (c.type === 'chart') expect(c.series[0]!.data).toEqual([5, 6]);
  });
});

describe('serialization (collaboration replay)', () => {
  it('round-trips every command kind', () => {
    const { deck } = makeDeck();
    const slideId = deck.slides[0]!.id;
    const commands = [
      createElementsCommand({ slideId, elements: [createShape('rect', 0, 0, 10, 10, { id: 'x1' })] }),
      deleteElementsCommand({ slideId, elementIds: ['s1'] }),
      moveElementsCommand({ slideId, moves: [{ id: 't1', x: 5, y: 6 }] }),
      resizeElementCommand({ slideId, id: 's2', x: 0, y: 0, w: 10, h: 10 }),
      rotateElementCommand({ slideId, id: 's2', rotation: 90 }),
      updateTextCommand({ slideId, id: 't1', text: textFromPlain('hello') }),
      updateStyleCommand({ slideId, id: 's2', patch: { fill: { type: 'solid', color: '#111111', opacity: 1 } } }),
      groupCommand({ slideId, elementIds: ['s1', 's2'] }),
      zOrderCommand({ slideId, elementIds: ['t1'], op: 'front' }),
      insertSlideCommand({ index: 0, slide: createSlide() }),
      moveSlideCommand({ slideId, toIndex: 0 }),
      compositeCommand([moveElementsCommand({ slideId, moves: [{ id: 't1', x: 1, y: 1 }] })], { label: 'batch', actor: 'ai' }),
    ];
    for (const cmd of commands) {
      const json = JSON.stringify(cmd.serialize());
      const restored = deserializeCommand(JSON.parse(json));
      expect(restored.kind).toBe(cmd.kind);
      expect(restored.label).toBe(cmd.label);
      expect(restored.actor).toBe(cmd.actor);
    }
  });

  it('replayed commands converge on the same deck', () => {
    const { deck } = makeDeck();
    const slideId = deck.slides[0]!.id;
    const cmd = compositeCommand(
      [
        moveElementsCommand({ slideId, moves: [{ id: 's1', x: 33, y: 44 }] }),
        updateTextCommand({ slideId, id: 't1', text: textFromPlain('同步标题') }),
      ],
      { label: 'sync', actor: 'ai' },
    );
    const a = new CommandExecutor(deck);
    const deckB = deepClone(deck);
    const b2 = new CommandExecutor(deckB);
    a.apply(cmd);
    b2.apply(deserializeCommand(JSON.parse(JSON.stringify(cmd.serialize()))));
    expect(JSON.stringify(a.deck)).toBe(JSON.stringify(b2.deck));
  });
});
