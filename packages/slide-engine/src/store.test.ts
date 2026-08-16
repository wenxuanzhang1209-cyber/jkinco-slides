import { describe, expect, it } from 'vitest';
import {
  createChart,
  createDeck,
  createShape,
  createSlide,
  createText,
  textFromPlain,
} from '@jkinco/scene-schema';
import { moveElementsCommand } from '@jkinco/command-engine';
import { MemoryPersistence, DeckEngine, chartFromDataset } from './store';
import { pasteElements, serializeElementsForCopy, copyElementStyle, stylePatchFor } from './clipboard';
import { SHORTCUTS, matchShortcut, eventToShortcut } from './shortcuts';

function makeEngine() {
  const slide = createSlide({
    elements: [
      createText(40, 40, 400, 60, '标题', { id: 't1', zIndex: 0 }),
      createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1 }),
    ],
  });
  const deck = createDeck({ slides: [slide] });
  const engine = new DeckEngine(deck);
  return { engine, slide, deck };
}

describe('DeckEngine', () => {
  it('tracks current slide and selection', () => {
    const { engine } = makeEngine();
    expect(engine.currentSlideId).toBe(engine.deck.slides[0]!.id);
    engine.selectElements(['s1']);
    expect(engine.selection.elementIds).toEqual(['s1']);
    engine.selectElements(['t1'], { add: true });
    expect(engine.selection.elementIds).toEqual(['s1', 't1']);
    engine.clearElementSelection();
    expect(engine.selection.elementIds).toEqual([]);
  });

  it('records an audit log with AI actor info (§19)', () => {
    const { engine } = makeEngine();
    const slideId = engine.deck.slides[0]!.id;
    engine.applyMany(
      [moveElementsCommand({ slideId, moves: [{ id: 's1', x: 300, y: 300 }] })],
      { label: 'AI changed 1 object', actor: 'ai' },
    );
    expect(engine.auditLog.length).toBeGreaterThan(0);
    expect(engine.auditLog[0]!.actor).toBe('ai');
    expect(engine.auditLog[0]!.objectCount).toBe(1);
  });

  it('undo/redo through the engine', () => {
    const { engine } = makeEngine();
    const slideId = engine.deck.slides[0]!.id;
    engine.moveElements([{ id: 's1', x: 400, y: 400 }]);
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(400);
    expect(engine.canUndo).toBe(true);
    engine.undo();
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(100);
    engine.redo();
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(400);
    void slideId;
  });

  it('group / ungroup via selection', () => {
    const { engine } = makeEngine();
    engine.selectElements(['s1']);
    engine.addElement(createShape('rect', 300, 100, 100, 100, { id: 's2' }));
    engine.selectElements(['s1', 's2']);
    expect(engine.groupSelected()).toBe(true);
    expect(engine.deck.slides[0]!.elements.some((e) => e.type === 'group')).toBe(true);
    expect(engine.ungroupSelected()).toBe(true);
    expect(engine.deck.slides[0]!.elements.some((e) => e.type === 'group')).toBe(false);
  });

  it('insert / duplicate / delete slide', () => {
    const { engine } = makeEngine();
    const newId = engine.insertSlide(1, { name: '第二页' });
    expect(newId).toBeTruthy();
    expect(engine.deck.slides.length).toBe(2);
    expect(engine.currentSlideId).toBe(newId);
    expect(engine.duplicateSlide()).toBe(true);
    expect(engine.deck.slides.length).toBe(3);
    expect(engine.deleteSlide()).toBe(true);
    expect(engine.deck.slides.length).toBe(2);
    // cannot delete the last slide
    engine.deleteSlide();
    engine.deleteSlide();
    expect(engine.deck.slides.length).toBe(1);
    expect(engine.deleteSlide()).toBe(false);
  });

  it('datasets: set / bind / update deck (§12)', () => {
    const { engine } = makeEngine();
    engine.setDataset({
      id: 'ds1',
      name: '销售数据',
      columns: ['季度', '营收'],
      rows: [['Q1', 100], ['Q2', 120]],
    });
    const chart = createChart('column', 500, 100, 400, 240, ['a'], [{ name: 'x', data: [1] }], { id: 'c1', dataSource: 'ds1' });
    engine.addElement(chart);
    engine.setDataset({
      id: 'ds1',
      name: '销售数据',
      columns: ['季度', '营收'],
      rows: [['Q1', 100], ['Q2', 120], ['Q3', 150]],
    });
    const updated = engine.refreshChartsFromDataset('ds1');
    expect(updated).toBe(1);
    const c = engine.deck.slides[0]!.elements.find((e) => e.id === 'c1')!;
    if (c.type === 'chart') {
      expect(c.categories).toEqual(['Q1', 'Q2', 'Q3']);
      expect(c.series[0]!.data).toEqual([100, 120, 150]);
    } else throw new Error('chart missing');
  });

  it('chartFromDataset picks numeric columns as series', () => {
    const { categories, series } = chartFromDataset(
      { id: 'd', name: 'x', columns: ['月份', '收入', '成本'], rows: [['1月', 10, 5], ['2月', 12, 6]] },
      'column',
    );
    expect(categories).toEqual(['1月', '2月']);
    expect(series).toHaveLength(2);
    expect(series[0]!.data).toEqual([10, 12]);
  });
});

describe('persistence (§15 autosave, §34 named versions)', () => {
  it('saves and restores a deck', async () => {
    const adapter = new MemoryPersistence();
    const { engine } = makeEngine();
    const engineWithP = new DeckEngine(engine.deck, { persistence: adapter, autosaveDelay: 5 });
    engineWithP.moveElements([{ id: 's1', x: 300, y: 300 }]);
    await new Promise((r) => setTimeout(r, 40));
    await engineWithP.saveNow();
    const restored = await DeckEngine.restore(adapter);
    expect(restored.slides[0]!.elements.find((e) => e.id === 's1')!.x).toBe(300);
  });

  it('falls back to the default deck when storage is corrupt', async () => {
    const adapter = new MemoryPersistence();
    await adapter.save('lastDeckId', 'deck:corrupt');
    await adapter.save('deck:deck:corrupt', '{not json');
    const fallback = createDeck();
    const restored = await DeckEngine.restore(adapter, { fallbackDeck: fallback });
    expect(restored.id).toBe(fallback.id);
  });

  it('named versions can be listed and restored (§34)', async () => {
    const adapter = new MemoryPersistence();
    const { engine } = makeEngine();
    const e = new DeckEngine(engine.deck, { persistence: adapter });
    await e.saveNamedVersion('v1 初稿');
    e.moveElements([{ id: 's1', x: 900, y: 900 }]);
    await e.saveNamedVersion('v2 修改后');
    const versions = await e.listVersions();
    expect(versions).toHaveLength(2);
    const restored = await e.restoreNamedVersion(versions[1]!.id);
    expect(restored).toBe(true);
    expect(e.deck.slides[0]!.elements.find((el) => el.id === 's1')!.x).toBe(100);
  });
});

describe('clipboard', () => {
  it('copy → paste remaps ids and offsets position', () => {
    const slide = createSlide({
      elements: [
        createShape('rect', 100, 100, 200, 100, { id: 's1', text: '内容' }),
        createText(40, 40, 200, 50, '标题', { id: 't1' }),
      ],
    });
    const json = serializeElementsForCopy(slide, ['s1', 't1']);
    const pasted = pasteElements(json, { offsetX: 10, offsetY: 20 })!;
    expect(pasted).toHaveLength(2);
    const ids = new Set(pasted.map((e) => e.id));
    expect(ids.has('s1')).toBe(false);
    expect(pasted.find((e) => e.type === 'shape')!.x).toBe(110);
    expect(pasted.find((e) => e.type === 'shape')!.y).toBe(120);
  });

  it('copy style → paste style patch', () => {
    const a = createShape('roundRect', 0, 0, 100, 100, {
      fill: { type: 'solid', color: '#123456', opacity: 1 },
      stroke: { color: '#000000', width: 2, style: 'dashed' },
      radius: 12,
    });
    const b = createShape('rect', 0, 0, 50, 50);
    const json = copyElementStyle(a);
    const { patch, ok } = stylePatchFor(json, b);
    expect(ok).toBe(true);
    expect((patch.fill as { color: string }).color).toBe('#123456');
    expect((patch.stroke as { width: number }).width).toBe(2);
    // incompatible types refuse to patch
    const t = createText(0, 0, 10, 10, 'x');
    expect(stylePatchFor(json, t).ok).toBe(false);
  });
});

describe('shortcuts (§7.1 completeness)', () => {
  it('covers the full professional editing list', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    for (const required of ['undo', 'redo', 'selectAll', 'delete', 'group', 'ungroup', 'move1', 'move10', 'altDragCopy', 'shiftConstrain', 'spacePan', 'commandPalette', 'duplicate', 'copy', 'paste', 'present']) {
      expect(ids).toContain(required);
    }
  });

  it('matches mod+z and cmd+k', () => {
    expect(matchShortcut({ key: 'z', metaKey: true })).toBe('undo');
    expect(matchShortcut({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(matchShortcut({ key: 'k', metaKey: true })).toBe('commandPalette');
    expect(matchShortcut({ key: 'a', metaKey: true })).toBe('selectAll');
    expect(matchShortcut({ key: 'g', metaKey: true })).toBe('group');
  });

  it('arrow keys map to move actions', () => {
    expect(matchShortcut({ key: 'ArrowLeft' })).toBe('move1');
    expect(matchShortcut({ key: 'ArrowRight', shiftKey: true })).toBe('move10');
  });

  it('eventToShortcut normalizes keys', () => {
    expect(eventToShortcut({ key: 'Z', metaKey: true })).toBe('mod+z');
  });
});

describe('text editing via engine', () => {
  it('updates text through commands', () => {
    const { engine } = makeEngine();
    engine.selectElements(['t1']);
    expect(engine.updateText('t1', textFromPlain('新标题'))).toBe(true);
    expect(engine.deck.slides[0]!.elements.find((e) => e.id === 't1')!.type === 'text').toBe(true);
    engine.undo();
    const t = engine.deck.slides[0]!.elements.find((e) => e.id === 't1')!;
    if (t.type === 'text') expect(t.text.paragraphs[0]!.runs[0]!.text).toBe('标题');
  });
});
