import type {
  ConnectorElement,
  DiagramEdgeMeta,
  DiagramElement,
  DiagramNodeMeta,
  ShapeElement,
  ShapeKind,
  Theme,
} from '@jkinco/scene-schema';
import { createConnector, createDiagram, createShape, textFromPlain, uid } from '@jkinco/scene-schema';
import { layoutDiagram } from './layout';
import type { DiagramEdgeInput, DiagramNodeInput } from './layout';

export interface BuildDiagramSpec {
  layout: DiagramElement['layout'];
  direction: DiagramElement['direction'];
  nodes: DiagramNodeMeta[];
  edges: DiagramEdgeMeta[];
  lanes?: DiagramElement['lanes'];
  groups?: DiagramElement['groups'];
  x: number;
  y: number;
  w: number;
  h: number;
  theme: Theme;
  diagramId?: string;
}

export interface BuildDiagramResult {
  nodes: ShapeElement[];
  edges: ConnectorElement[];
  diagram: DiagramElement;
}

const FONT_SIZE = 16;
const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 120;
const MIN_H = 48;
const MAX_W = 260;
const MAX_H = 80;
const DEFAULT_NODE_GAP = 48;
const DEFAULT_LEVEL_GAP = 88;

function isCJK(ch: string): boolean {
  return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
}

/** Measure a plain-text label into a node box (CJK ≈ 16pt, latin ≈ 0.55×16). */
export function measureLabel(label: string): { w: number; h: number } {
  const lines = label.split('\n');
  let maxLineW = 0;
  for (const line of lines) {
    let w = 0;
    for (const ch of line) {
      w += isCJK(ch) ? FONT_SIZE : 0.55 * FONT_SIZE;
    }
    maxLineW = Math.max(maxLineW, w);
  }
  let w = maxLineW + PAD_X * 2;
  let h = lines.length * FONT_SIZE + PAD_Y * 2;
  w = Math.max(MIN_W, Math.min(MAX_W, w));
  h = Math.max(MIN_H, Math.min(MAX_H, h));
  return { w, h };
}

export function buildDiagramElements(spec: BuildDiagramSpec): BuildDiagramResult {
  const { layout, direction, nodes: metas, edges: edgeMetas, lanes, groups, x, y, theme, diagramId } = spec;

  // Measure every node label once.
  const sizes = new Map<string, { w: number; h: number }>();
  for (const meta of metas) sizes.set(meta.id, measureLabel(meta.label ?? ''));

  // Derive lane membership from DiagramLane[].nodeIds (swimlane input).
  const nodeInputs: DiagramNodeInput[] = metas.map((meta) => {
    const size = sizes.get(meta.id)!;
    let laneId: string | undefined;
    if (lanes) {
      const lane = lanes.find((l) => l.nodeIds.includes(meta.id));
      if (lane) laneId = lane.id;
    }
    return { id: meta.id, w: size.w, h: size.h, level: meta.level, laneId };
  });
  const edgeInputs: DiagramEdgeInput[] = edgeMetas.map((e) => ({ from: e.from, to: e.to }));

  const layoutResult = layoutDiagram(layout, {
    nodes: nodeInputs,
    edges: edgeInputs,
    direction,
    nodeGap: DEFAULT_NODE_GAP,
    levelGap: DEFAULT_LEVEL_GAP,
  });

  // Only keep edges that reference two distinct, real nodes (mirrors layout).
  const validEdgeMetas = edgeMetas.filter(
    (e) => sizes.has(e.from) && sizes.has(e.to) && e.from !== e.to,
  );

  const nodeEls: ShapeElement[] = metas.map((meta, i) => {
    const size = sizes.get(meta.id)!;
    const pos = layoutResult.positions[meta.id]!;
    const shape: ShapeKind = meta.shape ?? 'roundRect';
    return createShape(shape, x + pos.x, y + pos.y, size.w, size.h, {
      id: meta.id,
      role: 'diagram_node',
      name: meta.label,
      fill: { type: 'solid', color: meta.fill ?? theme.diagram.nodeFill, opacity: 1 },
      stroke: { color: meta.stroke ?? theme.diagram.nodeStroke, width: theme.borderWidth, style: 'solid' },
      radius: theme.diagram.radius,
      text: textFromPlain(meta.label ?? ''),
      textStyle: { align: 'center', fontSize: FONT_SIZE },
      zIndex: validEdgeMetas.length + i,
    });
  });

  const nodeById = new Map(nodeEls.map((el) => [el.id, el]));

  const edgeEls: ConnectorElement[] = validEdgeMetas.map((edge, i) => {
    const from = nodeById.get(edge.from)!;
    const to = nodeById.get(edge.to)!;
    const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    const el = createConnector(start, end, {
      id: edge.id,
      role: 'diagram_edge',
      name: edge.label,
      fromId: edge.from,
      toId: edge.to,
      kind: 'elbow',
      endArrow: edge.arrow === false ? 'none' : 'arrow',
      stroke: {
        color: theme.diagram.edgeColor,
        width: theme.diagram.edgeWidth,
        style: edge.dashed ? 'dashed' : 'solid',
      },
      label: edge.label ? textFromPlain(edge.label) : undefined,
      zIndex: i,
    });
    // Guarantee a positive bounding box even for perfectly vertical/horizontal edges.
    if (el.w === 0) el.w = 1;
    if (el.h === 0) el.h = 1;
    return el;
  });

  const diagramEl = createDiagram(layout, direction, metas, validEdgeMetas, x, y, spec.w, spec.h, {
    id: diagramId ?? uid('dgm'),
    childIds: [...nodeEls.map((n) => n.id), ...edgeEls.map((e) => e.id)],
    lanes,
    groups,
    nodeGap: DEFAULT_NODE_GAP,
    levelGap: DEFAULT_LEVEL_GAP,
    zIndex: validEdgeMetas.length + nodeEls.length,
  });

  return { nodes: nodeEls, edges: edgeEls, diagram: diagramEl };
}
