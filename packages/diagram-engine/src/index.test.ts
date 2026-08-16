import { describe, expect, it } from 'vitest';
import {
  createDeck,
  DEFAULT_THEME_ID,
  getTheme,
  validateSlide,
} from '@jkinco/scene-schema';
import type {
  DiagramEdgeMeta,
  DiagramLayoutKind,
  DiagramNodeMeta,
} from '@jkinco/scene-schema';
import { layoutDiagram } from './layout';
import type { DiagramNodeInput, DiagramLayoutOutput } from './layout';
import { buildDiagramElements } from './build';
import { reflowDiagram } from './reflow';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Strict (positive-area) axis-aligned rect intersection — touching is not overlap. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pos(out: DiagramLayoutOutput, id: string): { x: number; y: number } {
  return out.positions[id]!;
}

function assertNoOverlap(nodes: DiagramNodeInput[], out: DiagramLayoutOutput): void {
  const rects: Rect[] = nodes.map((n) => ({ ...pos(out, n.id), w: n.w, h: n.h }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
    }
  }
}

const ALL_KINDS: DiagramLayoutKind[] = [
  'hierarchy',
  'dag',
  'swimlane',
  'timeline',
  'radial',
  'matrix',
  'architecture',
  'funnel',
  'cycle',
  'pyramid',
];

function genericInput(): { nodes: DiagramNodeInput[]; edges: { from: string; to: string }[] } {
  return {
    nodes: [
      { id: 'a', w: 120, h: 48, laneId: 'L1' },
      { id: 'b', w: 140, h: 52, laneId: 'L1' },
      { id: 'c', w: 110, h: 46, laneId: 'L2' },
      { id: 'd', w: 130, h: 50, laneId: 'L2' },
      { id: 'e', w: 100, h: 44, laneId: 'L2' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'e' },
    ],
  };
}

describe('layoutDiagram', () => {
  it('1. every layout kind yields valid, non-negative, non-overlapping output', () => {
    const input = genericInput();
    for (const kind of ALL_KINDS) {
      const out = layoutDiagram(kind, input);
      // all input ids present exactly once
      expect(Object.keys(out.positions).sort()).toEqual(
        input.nodes.map((n) => n.id).sort(),
      );
      expect([...out.order].sort()).toEqual(input.nodes.map((n) => n.id).sort());
      // non-negative positions
      for (const id of input.nodes.map((n) => n.id)) {
        expect(pos(out, id).x).toBeGreaterThanOrEqual(0);
        expect(pos(out, id).y).toBeGreaterThanOrEqual(0);
      }
      // no overlap
      assertNoOverlap(input.nodes, out);
      // width/height at least the largest node extent
      const maxW = Math.max(...input.nodes.map((n) => n.w));
      const maxH = Math.max(...input.nodes.map((n) => n.h));
      expect(out.width).toBeGreaterThanOrEqual(maxW);
      expect(out.height).toBeGreaterThanOrEqual(maxH);
    }
  });

  it('2. layout is deterministic and handles empty input', () => {
    const input = genericInput();
    for (const kind of ALL_KINDS) {
      const a = layoutDiagram(kind, input);
      const b = layoutDiagram(kind, input);
      expect(a).toEqual(b);
    }
    expect(layoutDiagram('hierarchy', { nodes: [], edges: [] })).toEqual({
      positions: {},
      width: 0,
      height: 0,
      order: [],
    });
  });

  it('3. hierarchy: root above children, children share a level', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'root', w: 120, h: 48 },
      { id: 'c1', w: 100, h: 48 },
      { id: 'c2', w: 100, h: 48 },
      { id: 'g1', w: 100, h: 48 },
    ];
    const edges = [
      { from: 'root', to: 'c1' },
      { from: 'root', to: 'c2' },
      { from: 'c1', to: 'g1' },
    ];
    const out = layoutDiagram('hierarchy', { nodes, edges });
    expect(pos(out, 'root').y).toBeLessThan(pos(out, 'c1').y);
    expect(pos(out, 'root').y).toBeLessThan(pos(out, 'c2').y);
    expect(pos(out, 'c1').y).toBe(pos(out, 'c2').y);
    expect(pos(out, 'c1').y).toBeLessThan(pos(out, 'g1').y);
  });

  it('4. swimlane: lanes get distinct bands and cover their nodes', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'a', w: 100, h: 40, laneId: 'L1' },
      { id: 'b', w: 120, h: 40, laneId: 'L1' },
      { id: 'c', w: 90, h: 40, laneId: 'L2' },
      { id: 'd', w: 110, h: 40, laneId: 'L2' },
    ];
    const out = layoutDiagram('swimlane', { nodes, edges: [] });
    expect(out.lanes).toBeDefined();
    expect(out.lanes!.length).toBe(2);
    // different lanes → different y bands
    expect(pos(out, 'a').y).not.toBe(pos(out, 'c').y);
    // lane geometry covers its nodes
    for (const lane of out.lanes!) {
      for (const nid of lane.nodeIds) {
        const p = pos(out, nid);
        const n = nodes.find((x) => x.id === nid)!;
        expect(p.x).toBeGreaterThanOrEqual(lane.x);
        expect(p.y).toBeGreaterThanOrEqual(lane.y);
        expect(p.x + n.w).toBeLessThanOrEqual(lane.x + lane.w);
        expect(p.y + n.h).toBeLessThanOrEqual(lane.y + lane.h);
      }
    }
  });

  it('5. timeline: single row increasing x; vertical direction → increasing y', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'a', w: 100, h: 40 },
      { id: 'b', w: 120, h: 40 },
      { id: 'c', w: 90, h: 40 },
    ];
    const row = layoutDiagram('timeline', { nodes, edges: [] });
    expect(pos(row, 'a').y).toBe(pos(row, 'b').y);
    expect(pos(row, 'b').y).toBe(pos(row, 'c').y);
    expect(pos(row, 'a').x).toBeLessThan(pos(row, 'b').x);
    expect(pos(row, 'b').x).toBeLessThan(pos(row, 'c').x);

    const col = layoutDiagram('timeline', { nodes, edges: [], direction: 'vertical' });
    expect(pos(col, 'a').x).toBe(pos(col, 'b').x);
    expect(pos(col, 'b').x).toBe(pos(col, 'c').x);
    expect(pos(col, 'a').y).toBeLessThan(pos(col, 'b').y);
    expect(pos(col, 'b').y).toBeLessThan(pos(col, 'c').y);
  });

  it('6. radial: root at center, children on concentric circles', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'root', w: 100, h: 48 },
      { id: 'l1a', w: 80, h: 40 },
      { id: 'l1b', w: 80, h: 40 },
      { id: 'l1c', w: 80, h: 40 },
      { id: 'l2a', w: 80, h: 40 },
    ];
    const edges = [
      { from: 'root', to: 'l1a' },
      { from: 'root', to: 'l1b' },
      { from: 'root', to: 'l1c' },
      { from: 'l1a', to: 'l2a' },
    ];
    const out = layoutDiagram('radial', { nodes, edges });
    const centerOf = (id: string, w: number, h: number) => {
      const p = pos(out, id);
      return { x: p.x + w / 2, y: p.y + h / 2 };
    };
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(b.x - a.x, b.y - a.y);
    const rootC = centerOf('root', 100, 48);
    const d1 = ['l1a', 'l1b', 'l1c'].map((id) => dist(rootC, centerOf(id, 80, 40)));
    expect(Math.max(...d1) - Math.min(...d1)).toBeLessThan(1);
    const d2 = dist(rootC, centerOf('l2a', 80, 40));
    expect(d2).toBeGreaterThan(Math.max(...d1));
  });

  it('7. funnel: stacked top→bottom, centered, non-increasing widths', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'a', w: 200, h: 48 },
      { id: 'b', w: 160, h: 48 },
      { id: 'c', w: 120, h: 48 },
      { id: 'd', w: 80, h: 48 },
    ];
    const out = layoutDiagram('funnel', { nodes, edges: [] });
    expect(pos(out, 'a').y).toBeLessThan(pos(out, 'b').y);
    expect(pos(out, 'b').y).toBeLessThan(pos(out, 'c').y);
    expect(pos(out, 'c').y).toBeLessThan(pos(out, 'd').y);
    const centerX = (n: DiagramNodeInput) => pos(out, n.id).x + n.w / 2;
    const c0 = centerX(nodes[0]!);
    for (const n of nodes.slice(1)) expect(centerX(n)).toBeCloseTo(c0, 5);
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i]!.w).toBeGreaterThanOrEqual(nodes[i + 1]!.w);
    }
    expect(out.order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('8. cycle: order follows the edge chain into a closed loop', () => {
    const nodes: DiagramNodeInput[] = [
      { id: 'A', w: 100, h: 48 },
      { id: 'B', w: 100, h: 48 },
      { id: 'C', w: 100, h: 48 },
      { id: 'D', w: 100, h: 48 },
    ];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'A' },
    ];
    const out = layoutDiagram('cycle', { nodes, edges });
    const order = out.order;
    expect(order.length).toBe(4);
    const edgeSet = new Set(edges.map((e) => `${e.from}->${e.to}`));
    for (let i = 0; i < order.length; i++) {
      const from = order[i]!;
      const to = order[(i + 1) % order.length]!;
      expect(edgeSet.has(`${from}->${to}`)).toBe(true);
    }
  });
});

describe('buildDiagramElements', () => {
  it('9. builds a valid slide of native node/edge/diagram objects', () => {
    const theme = getTheme(DEFAULT_THEME_ID);
    const metas: DiagramNodeMeta[] = [
      { id: 'n1', label: '步骤一' },
      { id: 'n2', label: 'Step 2' },
      { id: 'n3', label: '第三步骤' },
    ];
    const edges: DiagramEdgeMeta[] = [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
    ];
    const built = buildDiagramElements({
      layout: 'hierarchy',
      direction: 'vertical',
      nodes: metas,
      edges,
      x: 40,
      y: 40,
      w: 600,
      h: 400,
      theme,
      diagramId: 'dgm1',
    });

    const issues = validateSlide({
      id: 'x',
      elements: [...built.nodes, ...built.edges, built.diagram],
      qaStatus: 'pending',
    });
    expect(issues).toEqual([]);

    const childSet = new Set(built.diagram.childIds);
    for (const n of built.nodes) expect(childSet.has(n.id)).toBe(true);
    for (const e of built.edges) expect(childSet.has(e.id)).toBe(true);

    const nodeIds = new Set(built.nodes.map((n) => n.id));
    for (const e of built.edges) {
      expect(nodeIds.has(e.fromId!)).toBe(true);
      expect(nodeIds.has(e.toId!)).toBe(true);
    }
  });
});

describe('reflowDiagram', () => {
  it('10. reflows nodes back to consistent positions without mutating the deck', () => {
    const theme = getTheme(DEFAULT_THEME_ID);
    const metas: DiagramNodeMeta[] = [
      { id: 'n1', label: 'A' },
      { id: 'n2', label: 'B' },
      { id: 'n3', label: 'C' },
    ];
    const edges: DiagramEdgeMeta[] = [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
    ];
    const built = buildDiagramElements({
      layout: 'hierarchy',
      direction: 'vertical',
      nodes: metas,
      edges,
      x: 40,
      y: 40,
      w: 500,
      h: 400,
      theme,
      diagramId: 'dgm1',
    });

    const slide = {
      id: 's1',
      elements: [...built.nodes, ...built.edges, built.diagram],
      qaStatus: 'pending' as const,
    };
    const deck = createDeck({ id: 'deck1', slides: [slide] });

    // Simulate a manual edit: drag node n1 far away.
    deck.slides[0]!.elements = deck.slides[0]!.elements.map((el) =>
      el.id === 'n1' ? { ...el, x: 999, y: 999 } : el,
    );
    const before = structuredClone(deck);

    const result = reflowDiagram(deck, 's1', 'dgm1');

    // The moved node snaps back to the layout-computed position.
    const resultN1 = result.slides[0]!.elements.find((el) => el.id === 'n1')!;
    const builtN1 = built.nodes.find((n) => n.id === 'n1')!;
    expect(resultN1.x).toBeCloseTo(builtN1.x, 6);
    expect(resultN1.y).toBeCloseTo(builtN1.y, 6);
    expect(resultN1.x).not.toBe(999);

    // Immutability: the input deck was never mutated.
    expect(deck).toEqual(before);

    // Connector endpoints match their node centers.
    const els = result.slides[0]!.elements;
    for (const e of els) {
      if (e.type !== 'connector') continue;
      const from = els.find((x) => x.id === e.fromId)!;
      const to = els.find((x) => x.id === e.toId)!;
      expect(e.start.x).toBeCloseTo(from.x + from.w / 2, 6);
      expect(e.start.y).toBeCloseTo(from.y + from.h / 2, 6);
      expect(e.end.x).toBeCloseTo(to.x + to.w / 2, 6);
      expect(e.end.y).toBeCloseTo(to.y + to.h / 2, 6);
    }
  });
});
