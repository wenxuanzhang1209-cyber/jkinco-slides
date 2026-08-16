import type {
  ConnectorElement,
  Deck,
  DiagramElement,
  ShapeElement,
  Slide,
} from '@jkinco/scene-schema';
import { layoutDiagram } from './layout';
import type { DiagramEdgeInput, DiagramNodeInput } from './layout';

/**
 * Re-run the layout for a diagram in-place (immutably): node positions are
 * recomputed, connector endpoints snap back to node centers, and the slide's
 * qaStatus is reset to 'pending'. The diagram container geometry is preserved.
 *
 * If the slide or diagram is not found, the deck is returned unchanged.
 */
export function reflowDiagram(deck: Deck, slideId: string, diagramId: string): Deck {
  const slide = deck.slides.find((s) => s.id === slideId);
  if (!slide) return deck;

  const diagram = slide.elements.find(
    (e): e is DiagramElement => e.type === 'diagram' && e.id === diagramId,
  );
  if (!diagram) return deck;

  const childSet = new Set(diagram.childIds);
  const nodeEls = slide.elements.filter((e): e is ShapeElement => e.type === 'shape' && childSet.has(e.id));
  const nodeById = new Map(nodeEls.map((el) => [el.id, el]));

  // Resolve lane membership for swimlane layouts from diagram.lanes.
  const nodeInputs: DiagramNodeInput[] = diagram.nodes.map((meta) => {
    const el = nodeById.get(meta.id);
    let laneId: string | undefined;
    if (diagram.lanes) {
      const lane = diagram.lanes.find((l) => l.nodeIds.includes(meta.id));
      if (lane) laneId = lane.id;
    }
    return {
      id: meta.id,
      w: el?.w ?? 120,
      h: el?.h ?? 48,
      level: meta.level,
      laneId,
    };
  });
  const edgeInputs: DiagramEdgeInput[] = diagram.edges.map((e) => ({ from: e.from, to: e.to }));

  const result = layoutDiagram(diagram.layout, {
    nodes: nodeInputs,
    edges: edgeInputs,
    direction: diagram.direction,
    nodeGap: diagram.nodeGap ?? 48,
    levelGap: diagram.levelGap ?? 88,
  });

  // Absolute node positions (diagram-local layout + container offset).
  const newPos = new Map<string, { x: number; y: number }>();
  for (const meta of diagram.nodes) {
    const local = result.positions[meta.id];
    if (local) newPos.set(meta.id, { x: diagram.x + local.x, y: diagram.y + local.y });
  }

  // Node centers for connector endpoints.
  const nodeCenters = new Map<string, { x: number; y: number }>();
  for (const node of nodeEls) {
    const p = newPos.get(node.id);
    if (p) nodeCenters.set(node.id, { x: p.x + node.w / 2, y: p.y + node.h / 2 });
  }

  const elements = slide.elements.map((el) => {
    if (el.type === 'shape' && newPos.has(el.id)) {
      const p = newPos.get(el.id)!;
      return { ...el, x: p.x, y: p.y };
    }
    if (el.type === 'connector' && childSet.has(el.id)) {
      const start = el.fromId ? nodeCenters.get(el.fromId) : undefined;
      const end = el.toId ? nodeCenters.get(el.toId) : undefined;
      const s = start ?? el.start;
      const e = end ?? el.end;
      const nx = Math.min(s.x, e.x);
      const ny = Math.min(s.y, e.y);
      const nw = Math.max(Math.abs(e.x - s.x), 1);
      const nh = Math.max(Math.abs(e.y - s.y), 1);
      return { ...el, start: { ...s }, end: { ...e }, x: nx, y: ny, w: nw, h: nh };
    }
    return el;
  });

  const nextSlide: Slide = { ...slide, elements, qaStatus: 'pending' };
  return { ...deck, slides: deck.slides.map((s) => (s.id === slideId ? nextSlide : s)) };
}
