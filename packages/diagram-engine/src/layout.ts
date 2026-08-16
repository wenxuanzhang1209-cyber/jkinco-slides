import type { DiagramLayoutKind } from '@jkinco/scene-schema';

export interface DiagramNodeInput {
  id: string;
  w: number;
  h: number;
  level?: number;
  laneId?: string;
}

export interface DiagramEdgeInput {
  from: string;
  to: string;
}

export interface DiagramLayoutInput {
  nodes: DiagramNodeInput[];
  edges: DiagramEdgeInput[];
  direction?: 'vertical' | 'horizontal';
  /** Default 48 (sibling gap). */
  nodeGap?: number;
  /** Default 88 (level gap). */
  levelGap?: number;
}

export interface DiagramLaneGeometry {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nodeIds: string[];
}

export interface DiagramLayoutOutput {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  lanes?: DiagramLaneGeometry[];
  order: string[];
}

type Position = { x: number; y: number };
type Positions = Record<string, Position>;

interface Graph {
  inDegree: Map<string, number>;
  outNeighbors: Map<string, string[]>;
}

function byIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildGraph(nodes: DiagramNodeInput[], edges: DiagramEdgeInput[]): Graph {
  const inDegree = new Map<string, number>();
  const outNeighbors = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outNeighbors.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    outNeighbors.get(e.from)!.push(e.to);
  }
  for (const list of outNeighbors.values()) list.sort(byIdAsc);
  return { inDegree, outNeighbors };
}

/**
 * Deterministic BFS layering that covers every node, including disconnected
 * components and cycles (which fall back to a single-source walk).
 */
function computeLevels(
  nodes: DiagramNodeInput[],
  outNeighbors: Map<string, string[]>,
  inDegree: Map<string, number>,
): Map<string, number> {
  const level = new Map<string, number>();
  let queue: string[] = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .sort(byIdAsc);
  if (queue.length === 0) queue = [nodes[0]!.id];
  for (const r of queue) level.set(r, 0);

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const d = level.get(id)!;
    for (const nb of outNeighbors.get(id) ?? []) {
      if (!level.has(nb)) {
        level.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }

  // Handle any remaining unvisited nodes (disconnected / cyclic components).
  let maxLevel = Math.max(0, ...level.values());
  let unvisited = nodes
    .filter((n) => !level.has(n.id))
    .map((n) => n.id)
    .sort(byIdAsc);
  while (unvisited.length > 0) {
    maxLevel += 1;
    const root = unvisited[0]!;
    level.set(root, maxLevel);
    const q = [root];
    let h2 = 0;
    while (h2 < q.length) {
      const id = q[h2++]!;
      const d = level.get(id)!;
      for (const nb of outNeighbors.get(id) ?? []) {
        if (!level.has(nb)) {
          level.set(nb, d + 1);
          q.push(nb);
        }
      }
    }
    unvisited = nodes
      .filter((n) => !level.has(n.id))
      .map((n) => n.id)
      .sort(byIdAsc);
  }
  return level;
}

/**
 * Normalize every node/lane position to be non-negative, then compute the
 * total bounding box plus a trailing margin.
 */
function finalize(
  positions: Positions,
  nodes: DiagramNodeInput[],
  nodeGap: number,
  order: string[],
  lanes?: DiagramLaneGeometry[],
): DiagramLayoutOutput {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    const p = positions[n.id]!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  if (lanes) {
    for (const l of lanes) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
    }
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  for (const n of nodes) {
    positions[n.id]!.x -= minX;
    positions[n.id]!.y -= minY;
  }
  if (lanes) {
    for (const l of lanes) {
      l.x -= minX;
      l.y -= minY;
    }
  }

  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    const p = positions[n.id]!;
    maxX = Math.max(maxX, p.x + n.w);
    maxY = Math.max(maxY, p.y + n.h);
  }
  if (lanes) {
    for (const l of lanes) {
      maxX = Math.max(maxX, l.x + l.w);
      maxY = Math.max(maxY, l.y + l.h);
    }
  }

  return {
    positions,
    width: maxX + nodeGap,
    height: maxY + nodeGap,
    lanes,
    order,
  };
}

type Comparator = (a: string, b: string) => number;

/** Shared layered (rows of levels) layout used by hierarchy / dag. */
function layered(
  nodes: DiagramNodeInput[],
  byId: Map<string, DiagramNodeInput>,
  direction: 'vertical' | 'horizontal',
  nodeGap: number,
  levelGap: number,
  levelOf: Map<string, number>,
  compare: Comparator,
): DiagramLayoutOutput {
  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = Math.max(0, levelOf.get(n.id) ?? 0);
    const arr = byLevel.get(l) ?? [];
    arr.push(n.id);
    byLevel.set(l, arr);
  }
  const levelKeys = [...byLevel.keys()].sort((a, b) => a - b);
  const levelIds: string[][] = levelKeys.map((l) => {
    const ids = byLevel.get(l)!;
    ids.sort(compare);
    return ids;
  });

  const crossOf = (id: string): number => {
    const n = byId.get(id)!;
    return direction === 'horizontal' ? n.h : n.w;
  };
  const mainOf = (id: string): number => {
    const n = byId.get(id)!;
    return direction === 'horizontal' ? n.w : n.h;
  };

  let maxCross = 0;
  for (const ids of levelIds) {
    let cross = 0;
    for (const id of ids) cross += crossOf(id);
    cross += nodeGap * (ids.length - 1);
    maxCross = Math.max(maxCross, cross);
  }

  const positions: Positions = {};
  const order: string[] = [];
  let cursor = 0;
  for (const ids of levelIds) {
    let cross = 0;
    for (const id of ids) cross += crossOf(id);
    cross += nodeGap * (ids.length - 1);
    let offset = (maxCross - cross) / 2;
    let mainExtent = 0;
    for (const id of ids) {
      const n = byId.get(id)!;
      if (direction === 'horizontal') {
        positions[id] = { x: cursor, y: offset };
        offset += n.h + nodeGap;
      } else {
        positions[id] = { x: offset, y: cursor };
        offset += n.w + nodeGap;
      }
      mainExtent = Math.max(mainExtent, mainOf(id));
      order.push(id);
    }
    cursor += mainExtent + levelGap;
  }

  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// hierarchy — top-down (or left-right) tree, layered by BFS depth
// ---------------------------------------------------------------------------
function hierarchy(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  levelGap: number,
): DiagramLayoutOutput {
  const dir = direction ?? 'vertical';
  const { inDegree, outNeighbors } = buildGraph(nodes, edges);
  const levels = computeLevels(nodes, outNeighbors, inDegree);
  return layered(nodes, byId, dir, nodeGap, levelGap, levels, byIdAsc);
}

// ---------------------------------------------------------------------------
// dag — layered like hierarchy; stable order by edge count then id
// ---------------------------------------------------------------------------
function dag(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  levelGap: number,
): DiagramLayoutOutput {
  const dir = direction ?? 'vertical';
  const { inDegree, outNeighbors } = buildGraph(nodes, edges);
  const levels = computeLevels(nodes, outNeighbors, inDegree);
  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const compare: Comparator = (a, b) => {
    const da = degree.get(a) ?? 0;
    const db = degree.get(b) ?? 0;
    if (da !== db) return db - da;
    return byIdAsc(a, b);
  };
  return layered(nodes, byId, dir, nodeGap, levelGap, levels, compare);
}

// ---------------------------------------------------------------------------
// swimlane — nodes grouped by laneId into horizontal lanes stacked vertically
// ---------------------------------------------------------------------------
function swimlane(
  nodes: DiagramNodeInput[],
  _edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  _levelGap: number,
): DiagramLayoutOutput {
  const HEADER = 36;
  const DEFAULT_LANE = '\u0000default';

  const laneOrder: string[] = [];
  const laneNodes = new Map<string, string[]>();
  const laneLabels = new Map<string, string>();
  for (const n of nodes) {
    const raw = n.laneId ?? DEFAULT_LANE;
    const laneId = raw === '' ? DEFAULT_LANE : raw;
    if (!laneNodes.has(laneId)) {
      laneNodes.set(laneId, []);
      laneOrder.push(laneId);
    }
    laneNodes.get(laneId)!.push(n.id);
    laneLabels.set(laneId, laneId === DEFAULT_LANE ? '' : laneId);
  }
  for (const ids of laneNodes.values()) ids.sort(byIdAsc);

  let maxRowWidth = 0;
  let maxRowHeight = 0;
  for (const laneId of laneOrder) {
    const ids = laneNodes.get(laneId)!;
    let w = 0;
    let h = 0;
    for (const id of ids) {
      const n = byId.get(id)!;
      w += n.w;
      h = Math.max(h, n.h);
    }
    w += nodeGap * (ids.length - 1);
    maxRowWidth = Math.max(maxRowWidth, w);
    maxRowHeight = Math.max(maxRowHeight, h);
  }

  const positions: Positions = {};
  const lanes: DiagramLaneGeometry[] = [];
  const order: string[] = [];
  let yCursor = 0;
  for (const laneId of laneOrder) {
    const ids = laneNodes.get(laneId)!;
    let rowW = 0;
    for (const id of ids) rowW += byId.get(id)!.w;
    rowW += nodeGap * (ids.length - 1);
    const startX = (maxRowWidth - rowW) / 2;
    let x = startX;
    for (const id of ids) {
      const n = byId.get(id)!;
      positions[id] = {
        x,
        y: yCursor + HEADER + (maxRowHeight - n.h) / 2,
      };
      x += n.w + nodeGap;
      order.push(id);
    }
    lanes.push({
      id: laneId === DEFAULT_LANE ? '' : laneId,
      label: laneLabels.get(laneId)!,
      x: 0,
      y: yCursor,
      w: maxRowWidth,
      h: HEADER + maxRowHeight,
      nodeIds: [...ids],
    });
    yCursor += HEADER + maxRowHeight + nodeGap;
  }

  return finalize(positions, nodes, nodeGap, order, lanes);
}

// ---------------------------------------------------------------------------
// timeline — single row (default) / single column (direction 'vertical')
// ---------------------------------------------------------------------------
function timeline(
  nodes: DiagramNodeInput[],
  _edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  _levelGap: number,
): DiagramLayoutOutput {
  const dir = direction ?? 'horizontal';
  const order = nodes.map((n) => n.id);
  const positions: Positions = {};
  let cursor = 0;
  for (const id of order) {
    const n = byId.get(id)!;
    if (dir === 'horizontal') {
      positions[id] = { x: cursor, y: 0 };
      cursor += n.w + nodeGap;
    } else {
      positions[id] = { x: 0, y: cursor };
      cursor += n.h + nodeGap;
    }
  }
  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// radial — root at center, children on concentric circles by BFS depth
// ---------------------------------------------------------------------------
function radial(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  levelGap: number,
): DiagramLayoutOutput {
  const { inDegree, outNeighbors } = buildGraph(nodes, edges);
  const levels = computeLevels(nodes, outNeighbors, inDegree);
  const maxLevel = Math.max(0, ...levels.values());

  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = levels.get(n.id) ?? 0;
    const arr = byLevel.get(l) ?? [];
    arr.push(n.id);
    byLevel.set(l, arr);
  }
  for (const ids of byLevel.values()) ids.sort(byIdAsc);

  const positions: Positions = {};
  const roots = byLevel.get(0) ?? [];

  if (roots.length === 1) {
    const n = byId.get(roots[0]!)!;
    positions[roots[0]!] = { x: -n.w / 2, y: -n.h / 2 };
  } else {
    let x = -((roots.length - 1) * nodeGap) / 2;
    for (const id of roots) {
      const n = byId.get(id)!;
      positions[id] = { x, y: -n.h / 2 };
      x += n.w + nodeGap;
    }
  }

  let rootHalfDiag = 0;
  for (const id of roots) {
    const n = byId.get(id)!;
    rootHalfDiag = Math.max(rootHalfDiag, Math.hypot(n.w, n.h) / 2);
  }
  let ringRadius = rootHalfDiag + levelGap;

  for (let l = 1; l <= maxLevel; l++) {
    const ids = byLevel.get(l) ?? [];
    if (ids.length === 0) continue;
    const count = ids.length;
    let maxDiag = 0;
    for (const id of ids) {
      const n = byId.get(id)!;
      maxDiag = Math.max(maxDiag, Math.hypot(n.w, n.h));
    }
    const needed = count > 1 ? (maxDiag + nodeGap) / (2 * Math.sin(Math.PI / count)) : 0;
    const r = Math.max(ringRadius, needed);
    for (let i = 0; i < count; i++) {
      const id = ids[i]!;
      const n = byId.get(id)!;
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      positions[id] = { x: r * Math.cos(angle) - n.w / 2, y: r * Math.sin(angle) - n.h / 2 };
    }
    ringRadius = r + maxDiag / 2 + levelGap;
  }

  const order = [...byLevel.keys()]
    .sort((a, b) => a - b)
    .flatMap((l) => byLevel.get(l)!);
  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// matrix — grid ceil(sqrt(n)) cols, or level-based rows when levels provided
// ---------------------------------------------------------------------------
function matrix(
  nodes: DiagramNodeInput[],
  byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  levelGap: number,
): DiagramLayoutOutput {
  const n = nodes.length;
  const hasLevels = nodes.some((nd) => nd.level !== undefined);

  const rows: string[][] = [];
  if (hasLevels) {
    const byLevel = new Map<number, string[]>();
    for (const nd of nodes) {
      const l = Math.max(0, nd.level ?? 0);
      const arr = byLevel.get(l) ?? [];
      arr.push(nd.id);
      byLevel.set(l, arr);
    }
    const keys = [...byLevel.keys()].sort((a, b) => a - b);
    for (const k of keys) rows.push(byLevel.get(k)!.sort(byIdAsc));
  } else {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    for (let i = 0; i < n; i++) {
      const rowIdx = Math.floor(i / cols);
      if (!rows[rowIdx]) rows[rowIdx] = [];
      rows[rowIdx]!.push(nodes[i]!.id);
    }
  }

  let maxW = 0;
  let maxH = 0;
  for (const nd of nodes) {
    maxW = Math.max(maxW, nd.w);
    maxH = Math.max(maxH, nd.h);
  }
  const cellW = maxW + nodeGap;
  const cellH = maxH + (hasLevels ? levelGap : nodeGap);

  const positions: Positions = {};
  const order: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const id = row[c]!;
      const nd = byId.get(id)!;
      positions[id] = {
        x: c * cellW + (cellW - nd.w) / 2,
        y: r * cellH + (cellH - nd.h) / 2,
      };
      order.push(id);
    }
  }
  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// architecture — layered, levels from node.level ?? BFS, children centered
// ---------------------------------------------------------------------------
function architecture(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  levelGap: number,
): DiagramLayoutOutput {
  const dir = direction ?? 'vertical';
  const { inDegree, outNeighbors } = buildGraph(nodes, edges);
  const bfs = computeLevels(nodes, outNeighbors, inDegree);
  const levelOf = new Map<string, number>();
  for (const n of nodes) levelOf.set(n.id, Math.max(0, n.level ?? (bfs.get(n.id) ?? 0)));

  // Children only count edges that go downward in the level ordering.
  const children = new Map<string, string[]>();
  for (const n of nodes) children.set(n.id, []);
  const hasParent = new Set<string>();
  for (const e of edges) {
    const fl = levelOf.get(e.from) ?? 0;
    const tl = levelOf.get(e.to) ?? 0;
    if (tl > fl) {
      children.get(e.from)!.push(e.to);
      hasParent.add(e.to);
    }
  }
  for (const list of children.values()) list.sort(byIdAsc);

  let roots = nodes
    .filter((n) => !hasParent.has(n.id))
    .map((n) => n.id)
    .sort(byIdAsc);
  if (roots.length === 0) roots = [nodes[0]!.id];

  const crossOf = (id: string): number => {
    const n = byId.get(id)!;
    return dir === 'horizontal' ? n.h : n.w;
  };

  // Tidy-tree cross-axis placement; shared children are claimed once.
  const cross = new Map<string, number>();
  let cursor = 0;
  const placed = new Set<string>();
  const layoutSubtree = (id: string): void => {
    if (placed.has(id)) return;
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      placed.add(id);
      cross.set(id, cursor);
      cursor += crossOf(id) + nodeGap;
      return;
    }
    for (const k of kids) layoutSubtree(k);
    placed.add(id);
    const firstId = kids[0]!;
    const lastId = kids[kids.length - 1]!;
    const first = cross.get(firstId)!;
    const last = cross.get(lastId)! + crossOf(lastId);
    const myCross = crossOf(id);
    cross.set(id, first + (last - first - myCross) / 2);
  };
  for (const r of roots) {
    layoutSubtree(r);
    cursor += nodeGap;
  }

  // Main-axis offsets per level.
  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = levelOf.get(n.id) ?? 0;
    const arr = byLevel.get(l) ?? [];
    arr.push(n.id);
    byLevel.set(l, arr);
  }
  const levelKeys = [...byLevel.keys()].sort((a, b) => a - b);
  const mainOfLevel = new Map<number, number>();
  let mainCursor = 0;
  for (const l of levelKeys) {
    mainOfLevel.set(l, mainCursor);
    const ids = byLevel.get(l)!;
    let ext = 0;
    for (const id of ids) ext = Math.max(ext, dir === 'horizontal' ? byId.get(id)!.w : byId.get(id)!.h);
    mainCursor += ext + levelGap;
  }

  const positions: Positions = {};
  for (const n of nodes) {
    const c = cross.get(n.id) ?? 0;
    const m = mainOfLevel.get(levelOf.get(n.id) ?? 0) ?? 0;
    if (dir === 'horizontal') positions[n.id] = { x: m, y: c };
    else positions[n.id] = { x: c, y: m };
  }

  const ordered = [...nodes].sort((a, b) => {
    const la = levelOf.get(a.id) ?? 0;
    const lb = levelOf.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    const ca = cross.get(a.id) ?? 0;
    const cb = cross.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return byIdAsc(a.id, b.id);
  });
  const order = ordered.map((n) => n.id);

  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// funnel / pyramid — vertically stacked, centered on a shared axis
// ---------------------------------------------------------------------------
function funnel(
  nodes: DiagramNodeInput[],
  _byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  _levelGap: number,
): DiagramLayoutOutput {
  return stackedVertically(nodes, nodeGap);
}

function pyramid(
  nodes: DiagramNodeInput[],
  _byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  _levelGap: number,
): DiagramLayoutOutput {
  return stackedVertically(nodes, nodeGap);
}

function stackedVertically(nodes: DiagramNodeInput[], nodeGap: number): DiagramLayoutOutput {
  const maxW = Math.max(...nodes.map((nd) => nd.w));
  const positions: Positions = {};
  const order = nodes.map((nd) => nd.id);
  let y = 0;
  for (const nd of nodes) {
    positions[nd.id] = { x: (maxW - nd.w) / 2, y };
    y += nd.h + nodeGap;
  }
  return finalize(positions, nodes, nodeGap, order);
}

// ---------------------------------------------------------------------------
// cycle — nodes on a circle in edge-following order from the first node
// ---------------------------------------------------------------------------
function cycle(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  byId: Map<string, DiagramNodeInput>,
  _direction: 'vertical' | 'horizontal' | undefined,
  nodeGap: number,
  _levelGap: number,
): DiagramLayoutOutput {
  const { outNeighbors } = buildGraph(nodes, edges);
  const order: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = nodes[0]!.id;
  while (current !== undefined && !visited.has(current)) {
    const cur = current;
    visited.add(cur);
    order.push(cur);
    const nbs: string[] = outNeighbors.get(cur) ?? [];
    current = nbs.find((nb) => !visited.has(nb));
  }
  for (const nd of nodes) {
    if (!visited.has(nd.id)) {
      visited.add(nd.id);
      order.push(nd.id);
    }
  }

  const count = order.length;
  let maxDiag = 0;
  for (const id of order) {
    const nd = byId.get(id)!;
    maxDiag = Math.max(maxDiag, Math.hypot(nd.w, nd.h));
  }
  let radius = 0;
  if (count >= 2) radius = (maxDiag + nodeGap) / (2 * Math.sin(Math.PI / count));

  const positions: Positions = {};
  for (let i = 0; i < count; i++) {
    const id = order[i]!;
    const nd = byId.get(id)!;
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions[id] = { x: radius * Math.cos(angle) - nd.w / 2, y: radius * Math.sin(angle) - nd.h / 2 };
  }
  return finalize(positions, nodes, nodeGap, order);
}

export function layoutDiagram(layout: DiagramLayoutKind, input: DiagramLayoutInput): DiagramLayoutOutput {
  const nodeGap = input.nodeGap ?? 48;
  const levelGap = input.levelGap ?? 88;

  const nodeMap = new Map<string, DiagramNodeInput>();
  for (const n of input.nodes) nodeMap.set(n.id, n);
  const nodes = [...nodeMap.values()];

  if (nodes.length === 0) {
    return { positions: {}, width: 0, height: 0, order: [] };
  }

  const validIds = new Set(nodes.map((n) => n.id));
  const edges = input.edges.filter(
    (e) => validIds.has(e.from) && validIds.has(e.to) && e.from !== e.to,
  );

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const direction = input.direction;

  switch (layout) {
    case 'hierarchy':
      return hierarchy(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'dag':
      return dag(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'swimlane':
      return swimlane(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'timeline':
      return timeline(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'radial':
      return radial(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'matrix':
      return matrix(nodes, byId, direction, nodeGap, levelGap);
    case 'architecture':
      return architecture(nodes, edges, byId, direction, nodeGap, levelGap);
    case 'funnel':
      return funnel(nodes, byId, direction, nodeGap, levelGap);
    case 'pyramid':
      return pyramid(nodes, byId, direction, nodeGap, levelGap);
    case 'cycle':
      return cycle(nodes, edges, byId, direction, nodeGap, levelGap);
  }
}
