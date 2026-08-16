import type {
  ArrowHead,
  ConnectorElement,
  RichText,
  SemanticRole,
  ShapeElement,
  SlideElement,
  SlideIntent,
  TableElement,
  TextAlign,
  TextElement,
  Theme,
} from '@jkinco/scene-schema';
import {
  SLIDE_H,
  SLIDE_W,
  clamp,
  createChart,
  createConnector,
  createImage,
  createShape,
  createText,
  textFromLines,
  textFromPlain,
} from '@jkinco/scene-schema';
import type { ContentBlocks } from './content';
import { computeDensity } from './density';
import type { LayoutPattern } from './patterns';

// ---------------------------------------------------------------------------
// Geometry constants (logical 960 × 540 pt)
// ---------------------------------------------------------------------------

const MARGIN = 40;
const CONTENT_W = SLIDE_W - MARGIN * 2; // 880
const TITLE_Y = 40;
const FOOTER_Y = 512;
const FOOTER_H = 28;
const GAP = 24;

// ---------------------------------------------------------------------------
// Style variants — planLayouts varies pattern *and* variant
// ---------------------------------------------------------------------------

interface Variant {
  align: TextAlign;
  accentPlacement: 'left' | 'right' | 'center';
  background: 'white' | 'tint';
}

const VARIANTS: Variant[] = [
  { align: 'left', accentPlacement: 'left', background: 'white' },
  { align: 'center', accentPlacement: 'right', background: 'white' },
  { align: 'left', accentPlacement: 'right', background: 'tint' },
  { align: 'center', accentPlacement: 'left', background: 'tint' },
];

export const INTENT_PATTERNS: Record<SlideIntent, LayoutPattern[]> = {
  explain: ['title-visual', '3-column', '2x2'],
  compare: ['comparison', '3-column', 'chart-insight'],
  prove: ['chart-insight', 'kpi-grid', 'title-visual'],
  decide: ['kpi-grid', 'comparison', 'hero'],
  update: ['kpi-grid', 'timeline', 'title-visual'],
  timeline: ['timeline', 'process', 'hero'],
  architecture: ['architecture', 'process', '2x2'],
  process: ['process', 'timeline', 'architecture'],
  kpi: ['kpi-grid', 'chart-insight', 'hero'],
  data_story: ['chart-insight', 'kpi-grid', 'comparison'],
  quote: ['hero', 'title-visual', '3-column'],
  summary: ['title-visual', '3-column', 'hero'],
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LayoutCandidate {
  id: string;
  pattern: LayoutPattern;
  intent: SlideIntent;
  score: number;
  breakdown: Record<string, number>;
  elements: SlideElement[];
}

// ---------------------------------------------------------------------------
// Font sizing (clamped to the theme + budget ranges)
// ---------------------------------------------------------------------------

function titleFontSize(theme: Theme): number {
  return clamp(theme.title.fontSize, 28, 40);
}

function bodyFontSize(theme: Theme): number {
  return clamp(theme.body.fontSize, 22, 26);
}

function keyFontSize(theme: Theme): number {
  return clamp(theme.keyNumber.fontSize, 32, 64);
}

const HEADING_ROLES = new Set(['title', 'subtitle', 'key_message']);

function headingFont(theme: Theme): string {
  return theme.fonts.heading;
}

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------

interface TextOpts {
  role?: SemanticRole;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: TextAlign;
  importance?: number;
  autoFit?: boolean;
}

function mkText(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string | RichText,
  theme: Theme,
  o: TextOpts = {},
): TextElement {
  const role = o.role;
  return createText(x, y, w, h, text, {
    id,
    role,
    name: role,
    style: {
      fontSize: o.fontSize ?? bodyFontSize(theme),
      color: o.color ?? theme.colors.text,
      bold: o.bold,
      align: o.align ?? 'left',
      lineSpacing: 1.4,
      fontFamily: role && HEADING_ROLES.has(role) ? headingFont(theme) : theme.fonts.body,
    },
    autoFit: o.autoFit,
    semantic: o.importance !== undefined ? { importance: o.importance } : undefined,
  });
}

/** Round-rect card with a big metric value + small label embedded as rich text. */
function metricCard(id: string, x: number, y: number, w: number, h: number, metric: { value: string; label: string }, theme: Theme, add: (el: SlideElement) => void): void {
  const text: RichText = {
    paragraphs: [
      { runs: [{ text: metric.value, bold: true, color: theme.colors.primary, fontSize: keyFontSize(theme) }] },
      { runs: [{ text: metric.label, color: theme.colors.textSecondary, fontSize: bodyFontSize(theme) }], spacingBefore: 8 },
    ],
  };
  add(
    createShape('roundRect', x, y, w, h, {
      id,
      role: 'metric',
      name: '指标卡',
      fill: { type: 'solid', color: theme.colors.slideBackground, opacity: 1 },
      stroke: { color: theme.colors.border, width: theme.borderWidth, style: 'solid' },
      radius: theme.radius,
      text,
      textStyle: { fontSize: bodyFontSize(theme), color: theme.colors.text, align: 'left' },
      semantic: { importance: 0.8 },
    }),
  );
}

/** A connector with a strictly positive bounding box (validate requires w>0, h>0). */
function connector(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  o: { fromId?: string; toId?: string; endArrow?: ArrowHead } = {},
  add: (el: SlideElement) => void,
): void {
  const c = createConnector(start, end, {
    id,
    kind: 'straight',
    startArrow: 'none',
    endArrow: o.endArrow ?? 'arrow',
    fromId: o.fromId,
    toId: o.toId,
  });
  add({ ...c, w: Math.max(c.w, 1), h: Math.max(c.h, 1) } as ConnectorElement);
}

/** Bullet list → bullet rich text (empty-safe). */
function toBullets(lines: string[]): RichText {
  if (lines.length === 0) return textFromPlain('');
  return textFromLines(lines.map((l) => `- ${l}`));
}

/** A small custom table sized to a region (factory's fixed 880pt width does not fit side columns). */
function sizedTable(id: string, x: number, y: number, w: number, h: number, rows: string[][], theme: Theme): TableElement {
  const rowCount = Math.max(rows.length, 1);
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const colW = Math.floor(w / colCount);
  const rowH = Math.floor(h / rowCount);
  const cells = rows.map((row) =>
    Array.from({ length: colCount }, (_, c) => ({
      text: textFromPlain(row[c] ?? ''),
      align: 'center' as TextAlign,
    })),
  );
  return {
    id,
    type: 'table',
    name: '表格',
    x,
    y,
    w: colW * colCount,
    h: rowH * rowCount,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    zIndex: 0,
    colWidths: Array.from({ length: colCount }, () => colW),
    rowHeights: Array.from({ length: rowCount }, () => rowH),
    cells,
    headerRow: true,
    bandedRows: true,
    border: { color: theme.colors.border, width: 1, style: 'solid' },
  };
}

/** Build the right-column visual for title-visual (chart / table / image / placeholder). */
function addVisual(id: () => string, x: number, y: number, w: number, h: number, blocks: ContentBlocks, theme: Theme, add: (el: SlideElement) => void): void {
  if (blocks.chart && blocks.chart.series.length > 0 && blocks.chart.categories.length > 0) {
    add(createChart('bar', x, y, w, h, blocks.chart.categories, blocks.chart.series, { id: id() }));
  } else if (blocks.table && blocks.table.length > 0) {
    add(sizedTable(id(), x, y, w, h, blocks.table, theme));
  } else if (blocks.image && blocks.image.src) {
    add(createImage(x, y, w, h, blocks.image.src, { id: id(), alt: blocks.image.alt, objectFit: 'cover' }));
  } else {
    add(
      createShape('roundRect', x, y, w, h, {
        id: id(),
        fill: { type: 'solid', color: theme.colors.background, opacity: 1 },
        stroke: { color: theme.colors.border, width: theme.borderWidth, style: 'solid' },
        radius: theme.radius,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Pattern builders — each receives the content region (already below the title)
// ---------------------------------------------------------------------------

type Build = (
  blocks: ContentBlocks,
  theme: Theme,
  v: Variant,
  id: () => string,
  add: (el: SlideElement) => void,
  region: { x: number; y: number; w: number; h: number },
) => void;

const FALLBACK_METRICS = [
  { value: '—', label: '指标一' },
  { value: '—', label: '指标二' },
  { value: '—', label: '指标三' },
  { value: '—', label: '指标四' },
];

const buildHero: Build = (blocks, theme, v, id, add, region) => {
  let y = region.y;
  if (blocks.subtitle) {
    add(mkText(id(), region.x, y, region.w, 36, blocks.subtitle, theme, { role: 'subtitle', fontSize: theme.subtitle.fontSize, color: theme.colors.textSecondary, align: v.align, importance: 0.7 }));
    y += 36 + GAP;
  }
  const barW = v.accentPlacement === 'center' ? 40 : 200;
  const barX =
    v.accentPlacement === 'center'
      ? region.x + (region.w - barW) / 2
      : v.accentPlacement === 'left'
        ? region.x
        : region.x + region.w - barW;
  const barColor = theme.cover.accentBarColor ?? theme.colors.accent;
  add(createShape('rect', barX, y, barW, 6, { id: id(), fill: { type: 'solid', color: barColor, opacity: 1 }, stroke: { color: barColor, width: 0, style: 'solid' } }));
  y += 6 + GAP;
  if (blocks.keyMessage) {
    add(mkText(id(), region.x, y, region.w, 96, blocks.keyMessage, theme, { role: 'key_message', fontSize: titleFontSize(theme) - 4, color: theme.colors.text, bold: true, align: v.align, importance: 0.92 }));
    y += 96 + GAP;
  }
  if (blocks.bullets && blocks.bullets.length > 0) {
    add(mkText(id(), region.x, y, region.w, Math.max(0, region.y + region.h - y), toBullets(blocks.bullets), theme, { role: 'bullet', fontSize: bodyFontSize(theme), align: v.align, importance: 0.5 }));
  }
};

const buildTitleVisual: Build = (blocks, theme, v, id, add, region) => {
  const keyH = blocks.keyMessage ? 48 : 0;
  if (blocks.keyMessage) {
    add(mkText(id(), region.x, region.y, region.w, keyH, blocks.keyMessage, theme, { role: 'key_message', fontSize: bodyFontSize(theme) + 2, color: theme.colors.text, bold: true, align: v.align, importance: 0.92 }));
  }
  const bodyTop = region.y + keyH + (keyH ? 16 : 0);
  const bodyH = Math.max(0, region.y + region.h - bodyTop);
  const hasVisual = Boolean(
    (blocks.chart && blocks.chart.series.length > 0) ||
      (blocks.table && blocks.table.length > 0) ||
      (blocks.diagram && blocks.diagram.nodes.length > 0) ||
      blocks.image,
  );
  if (hasVisual) {
    const leftW = 360;
    const rightX = region.x + leftW + GAP;
    const rightW = region.w - leftW - GAP;
    add(mkText(id(), region.x, bodyTop, leftW, bodyH, toBullets(blocks.bullets ?? []), theme, { role: 'bullet', importance: 0.5 }));
    addVisual(id, rightX, bodyTop, rightW, bodyH, blocks, theme, add);
  } else {
    add(mkText(id(), region.x, bodyTop, region.w, bodyH, toBullets(blocks.bullets ?? []), theme, { role: 'bullet', importance: 0.5 }));
  }
};

const build3Column: Build = (blocks, theme, _v, id, add, region) => {
  const colW = 277;
  const gap = GAP;
  const bullets = blocks.bullets ?? [];
  const metrics = blocks.metrics ?? [];
  if (bullets.length >= 3) {
    const cols: string[][] = [[], [], []];
    bullets.forEach((b, i) => cols[i % 3]!.push(b));
    for (let c = 0; c < 3; c++) {
      const x = region.x + c * (colW + gap);
      add(mkText(id(), x, region.y, colW, region.h, toBullets(cols[c]!), theme, { role: 'bullet', importance: 0.5 }));
    }
  } else {
    const cards = metrics.length >= 3 ? metrics.slice(0, 3) : FALLBACK_METRICS.slice(0, 3);
    for (let c = 0; c < 3; c++) {
      const x = region.x + c * (colW + gap);
      metricCard(id(), x, region.y, colW, region.h, cards[c]!, theme, add);
    }
  }
};

const build2x2: Build = (blocks, theme, _v, id, add, region) => {
  const cellW = 428;
  const cellH = 176;
  const gap = GAP;
  const metrics = blocks.metrics ?? [];
  const bullets = blocks.bullets ?? [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = region.x + c * (cellW + gap);
      const y = region.y + r * (cellH + gap);
      const idx = r * 2 + c;
      if (metrics.length >= 4) {
        metricCard(id(), x, y, cellW, cellH, metrics[idx]!, theme, add);
      } else {
        add(mkText(id(), x + 16, y + 16, cellW - 32, cellH - 32, bullets[idx] ?? '', theme, { role: 'bullet', importance: 0.5 }));
      }
    }
  }
};

const buildProcess: Build = (blocks, theme, _v, id, add, region) => {
  let labels = (blocks.diagram && blocks.diagram.nodes.length > 0 ? blocks.diagram.nodes : blocks.bullets ?? []).filter((s) => s.length > 0);
  if (labels.length === 0) labels = ['步骤一', '步骤二', '步骤三'];
  const n = labels.length;
  const gap = 40;
  const w = Math.max(1, Math.floor((region.w - (n - 1) * gap) / n));
  const h = Math.min(140, region.h - 40);
  const y = region.y + Math.max(0, (region.h - h) / 2);
  const nodeIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = region.x + i * (w + gap);
    const elId = id();
    nodeIds.push(elId);
    add(
      createShape('chevron', x, y, w, h, {
        id: elId,
        role: 'diagram_node',
        name: '流程节点',
        fill: { type: 'solid', color: theme.colors.primaryLight, opacity: 1 },
        stroke: { color: theme.colors.primary, width: theme.borderWidth, style: 'solid' },
        text: textFromPlain(labels[i]!),
        textStyle: { fontSize: bodyFontSize(theme), color: theme.colors.text, align: 'center' },
        semantic: { importance: 0.5 },
      }),
    );
  }
  for (let i = 0; i < n - 1; i++) {
    const fromX = region.x + i * (w + gap) + w;
    const toX = region.x + (i + 1) * (w + gap);
    const cy = y + h / 2;
    connector(id(), { x: fromX, y: cy }, { x: toX, y: cy }, { fromId: nodeIds[i], toId: nodeIds[i + 1], endArrow: 'arrow' }, add);
  }
};

const buildArchitecture: Build = (blocks, theme, _v, id, add, region) => {
  const nodes = blocks.diagram?.nodes ?? [];
  if (nodes.length === 0) {
    // fall back to a simple 2-layer diagram
    const fallback: string[] = ['数据层', '应用层', '展示层'];
    buildArchitecture({ ...blocks, diagram: { nodes: fallback, edges: [], levels: [0, 1, 1] } }, theme, _v, id, add, region);
    return;
  }
  const levels = blocks.diagram?.levels ?? nodes.map(() => 0);
  const byLevel = new Map<number, string[]>();
  nodes.forEach((node, i) => {
    const lvl = levels[i] ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(node);
  });
  const levelKeys = [...byLevel.keys()].sort((a, b) => a - b);
  const layerGap = 48;
  const layerH = Math.max(40, Math.floor((region.h - (levelKeys.length - 1) * layerGap) / levelKeys.length));
  let y = region.y;
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  levelKeys.forEach((lvl, li) => {
    const group = byLevel.get(lvl)!;
    const n = group.length;
    const gap = GAP;
    const w = Math.max(1, Math.floor((region.w - (n - 1) * gap) / n));
    group.forEach((label, i) => {
      const x = region.x + i * (w + gap);
      const elId = id();
      boxes.set(`${li}:${i}`, { x, y, w, h: layerH });
      add(
        createShape('roundRect', x, y, w, layerH, {
          id: elId,
          role: 'diagram_node',
          name: '架构节点',
          fill: { type: 'solid', color: theme.colors.slideBackground, opacity: 1 },
          stroke: { color: theme.colors.primary, width: theme.borderWidth, style: 'solid' },
          radius: theme.radius,
          text: textFromPlain(label),
          textStyle: { fontSize: bodyFontSize(theme), color: theme.colors.text, align: 'center' },
          semantic: { importance: 0.5 },
        }),
      );
    });
    y += layerH + layerGap;
  });
  for (let li = 0; li < levelKeys.length - 1; li++) {
    const upper = byLevel.get(levelKeys[li]!)!;
    const lower = byLevel.get(levelKeys[li + 1]!)!;
    const from = boxes.get(`${li}:0`)!;
    const to = boxes.get(`${li + 1}:0`)!;
    connector(id(), { x: from.x + from.w / 2, y: from.y + from.h }, { x: to.x + to.w / 2, y: to.y }, { endArrow: 'arrow' }, add);
    void upper;
    void lower;
  }
};

const buildTimeline: Build = (blocks, theme, _v, id, add, region) => {
  let labels = (blocks.diagram && blocks.diagram.nodes.length > 0 ? blocks.diagram.nodes : blocks.bullets ?? []).filter((s) => s.length > 0);
  if (labels.length === 0) labels = ['里程碑一', '里程碑二', '里程碑三'];
  const n = labels.length;
  const midY = region.y + region.h / 2;
  add(createShape('rect', region.x, midY - 2, region.w, 4, { id: id(), fill: { type: 'solid', color: theme.colors.border, opacity: 1 }, stroke: { color: theme.colors.border, width: 0, style: 'solid' } }));
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? region.x + region.w / 2 : region.x + (region.w * i) / (n - 1);
    add(createShape('ellipse', x - 8, midY - 8, 16, 16, { id: id(), role: 'diagram_node', fill: { type: 'solid', color: theme.colors.primary, opacity: 1 }, stroke: { color: theme.colors.primary, width: 1, style: 'solid' }, semantic: { importance: 0.5 } }));
    const above = i % 2 === 0;
    const ly = above ? midY - 64 : midY + 24;
    add(mkText(id(), x - 90, ly, 180, 40, labels[i]!, theme, { role: 'diagram_node', fontSize: bodyFontSize(theme), align: 'center', importance: 0.5 }));
  }
};

const buildComparison: Build = (blocks, theme, _v, id, add, region) => {
  const bullets = blocks.bullets ?? [];
  const mid = Math.ceil(bullets.length / 2);
  const left = bullets.slice(0, mid);
  const right = bullets.slice(mid);
  add(createShape('rect', 479, region.y, 2, region.h, { id: id(), fill: { type: 'solid', color: theme.colors.border, opacity: 1 }, stroke: { color: theme.colors.border, width: 0, style: 'solid' } }));
  add(mkText(id(), region.x, region.y, 415, region.h, toBullets(left), theme, { role: 'bullet', importance: 0.5 }));
  add(mkText(id(), 505, region.y, 415, region.h, toBullets(right), theme, { role: 'bullet', importance: 0.5 }));
};

const buildChartInsight: Build = (blocks, theme, _v, id, add, region) => {
  const chartW = 520;
  const panelX = region.x + chartW + GAP;
  const panelW = region.w - chartW - GAP;
  if (blocks.chart && blocks.chart.series.length > 0 && blocks.chart.categories.length > 0) {
    add(createChart('bar', region.x, region.y, chartW, region.h, blocks.chart.categories, blocks.chart.series, { id: id() }));
  } else {
    add(createShape('roundRect', region.x, region.y, chartW, region.h, { id: id(), fill: { type: 'solid', color: theme.colors.background, opacity: 1 }, stroke: { color: theme.colors.border, width: theme.borderWidth, style: 'solid' }, radius: theme.radius }));
  }
  const keyH = 100;
  if (blocks.keyMessage) {
    add(mkText(id(), panelX, region.y, panelW, keyH, blocks.keyMessage, theme, { role: 'key_message', fontSize: bodyFontSize(theme) + 2, color: theme.colors.text, bold: true, importance: 0.92 }));
  }
  const metrics = (blocks.metrics ?? []).slice(0, 2);
  const mh = 120;
  metrics.forEach((m, i) => {
    metricCard(id(), panelX, region.y + keyH + GAP + i * (mh + 16), panelW, mh, m, theme, add);
  });
};

const buildKpiGrid: Build = (blocks, theme, _v, id, add, region) => {
  const metrics = blocks.metrics ?? [];
  if (metrics.length === 0) {
    metricCard(id(), region.x, region.y, region.w, region.h, FALLBACK_METRICS[0]!, theme, add);
    return;
  }
  if (metrics.length >= 4) {
    const cellW = 428;
    const cellH = 176;
    const gap = GAP;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const idx = r * 2 + c;
        const x = region.x + c * (cellW + gap);
        const y = region.y + r * (cellH + gap);
        metricCard(id(), x, y, cellW, cellH, metrics[idx]!, theme, add);
      }
    }
  } else {
    const n = metrics.length;
    const gap = GAP;
    const w = Math.max(1, Math.floor((region.w - (n - 1) * gap) / n));
    const h = Math.min(region.h, 200);
    const y = region.y + Math.max(0, (region.h - h) / 2);
    metrics.slice(0, n).forEach((m, i) => {
      metricCard(id(), region.x + i * (w + gap), y, w, h, m, theme, add);
    });
  }
};

const BUILDERS: Record<LayoutPattern, Build> = {
  hero: buildHero,
  'title-visual': buildTitleVisual,
  '3-column': build3Column,
  '2x2': build2x2,
  process: buildProcess,
  architecture: buildArchitecture,
  timeline: buildTimeline,
  comparison: buildComparison,
  'chart-insight': buildChartInsight,
  'kpi-grid': buildKpiGrid,
};

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function buildFooter(blocks: ContentBlocks, theme: Theme, id: () => string, add: (el: SlideElement) => void): void {
  if (blocks.footer) {
    add(mkText(id(), MARGIN, FOOTER_Y, 660, FOOTER_H, blocks.footer, theme, { role: 'footnote', fontSize: theme.footer.fontSize, color: theme.colors.textMuted, importance: 0.2 }));
  }
  if (blocks.pageNumber !== undefined) {
    const total = blocks.totalPages !== undefined ? ` / ${blocks.totalPages}` : '';
    add(mkText(id(), 700, FOOTER_Y, 220, FOOTER_H, `${blocks.pageNumber}${total}`, theme, { role: 'page_number', fontSize: theme.footer.fontSize, color: theme.colors.textMuted, align: 'right', importance: 0.2 }));
  }
}

// ---------------------------------------------------------------------------
// Constraint solver (Layer 2) — deterministic
// ---------------------------------------------------------------------------

/**
 * Solve a concrete layout for a pattern. `variant` (0..3) selects the style
 * variant (alignment / accent placement / background); it defaults to 0 so the
 * public 3-arg signature stays `solve(blocks, pattern, theme)`.
 */
export function solve(blocks: ContentBlocks, pattern: LayoutPattern, theme: Theme, variant = 0): SlideElement[] {
  const v = VARIANTS[variant % VARIANTS.length] ?? VARIANTS[0]!;
  let n = 0;
  const id = () => `el_${pattern}_${variant}_${n++}`;
  const els: SlideElement[] = [];
  const add = (el: SlideElement) => els.push(el);

  const hasTitle = Boolean(blocks.title);
  const titleH = titleFontSize(theme) + 16;
  if (hasTitle) {
    add(mkText(id(), MARGIN, TITLE_Y, CONTENT_W, titleH, blocks.title!, theme, { role: 'title', fontSize: titleFontSize(theme), color: theme.colors.text, bold: true, align: v.align, importance: 1.0 }));
  }
  const titleBottom = hasTitle ? TITLE_Y + titleH : TITLE_Y;

  const footerPresent = Boolean(blocks.footer || blocks.pageNumber !== undefined);
  const contentTop = titleBottom + GAP;
  const contentBottom = footerPresent ? FOOTER_Y - GAP : SLIDE_H - MARGIN; // 488 or 500
  const region = { x: MARGIN, y: contentTop, w: CONTENT_W, h: Math.max(0, contentBottom - contentTop) };

  BUILDERS[pattern](blocks, theme, v, id, add, region);

  if (footerPresent) buildFooter(blocks, theme, id, add);

  // Dense, unique, contiguous z-indexes (validateSlide requires it).
  return els.map((el, i) => ({ ...el, zIndex: i }));
}

// ---------------------------------------------------------------------------
// Quality Scorer (Layer 3)
// ---------------------------------------------------------------------------

function textFontSize(el: SlideElement): number | undefined {
  if (el.type === 'text') return el.style.fontSize;
  if (el.type === 'shape' && el.text) return el.textStyle?.fontSize;
  return undefined;
}

function elementColors(el: SlideElement): string[] {
  const out: string[] = [];
  if (el.type === 'text' && el.style.color) out.push(el.style.color);
  if (el.type === 'shape') {
    if (el.fill.type === 'solid' && el.fill.color) out.push(el.fill.color);
    if (el.stroke.color) out.push(el.stroke.color);
    if (el.textStyle?.color) out.push(el.textStyle.color);
  }
  if (el.type === 'connector' && el.stroke.color) out.push(el.stroke.color);
  return out;
}

function normalizeColor(c: string): string {
  let h = c.trim().replace(/^#/, '').toUpperCase();
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return h;
}

function themePalette(theme: Theme): Set<string> {
  const c = theme.colors;
  const list = [
    c.primary,
    c.primaryDark,
    c.primaryLight,
    c.secondary,
    c.accent,
    c.background,
    c.slideBackground,
    c.text,
    c.textSecondary,
    c.textMuted,
    c.border,
    ...c.neutrals,
    ...c.chartPalette,
  ];
  return new Set(list.filter((x): x is string => Boolean(x)).map(normalizeColor));
}

function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}

function rectGap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const hGap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const vGap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  if (hGap > 0) return hGap;
  if (vGap > 0) return vGap;
  return Math.max(hGap, vGap);
}

function signatures(elements: SlideElement[]): Set<string> {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return new Set(elements.map((e) => `${e.type}:${r1(e.x)},${r1(e.y)},${r1(e.w)},${r1(e.h)}`));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scoreLayout(
  elements: SlideElement[],
  theme: Theme,
  existing?: SlideElement[],
): { score: number; breakdown: Record<string, number> } {
  const nonConnectors = elements.filter((e) => e.type !== 'connector');
  const total = nonConnectors.length;

  // Hierarchy — distinct font sizes (3 levels = full marks).
  const fontSizes = new Set<number>();
  for (const el of elements) {
    const fs = textFontSize(el);
    if (fs !== undefined) fontSizes.add(fs);
  }
  const hierarchy = Math.min(15, fontSizes.size * 5);

  // Alignment — fraction of elements sharing an x or y edge with another.
  let aligned = 0;
  for (const a of nonConnectors) {
    const shares = nonConnectors.some(
      (b) => b !== a && (near(a.x, b.x) || near(a.x + a.w, b.x + b.w) || near(a.y, b.y) || near(a.y + a.h, b.y + b.h)),
    );
    if (shares) aligned += 1;
  }
  const alignment = total === 0 ? 0 : (aligned / total) * 15;

  // Spacing — fraction of pairs separated by at least the minimum gap.
  const minGap = 24;
  let gapOk = 0;
  let gapTotal = 0;
  for (let i = 0; i < total; i++) {
    for (let j = i + 1; j < total; j++) {
      gapTotal += 1;
      if (rectGap(nonConnectors[i]!, nonConnectors[j]!) >= minGap) gapOk += 1;
    }
  }
  const spacing = gapTotal === 0 ? 15 : (gapOk / gapTotal) * 15;

  // Balance — visual weight (area) across the left/right halves.
  let leftW = 0;
  let rightW = 0;
  for (const el of nonConnectors) {
    const cx = el.x + el.w / 2;
    const area = el.w * el.h;
    if (cx < SLIDE_W / 2) leftW += area;
    else rightW += area;
  }
  const totalWeight = leftW + rightW;
  const balance = totalWeight === 0 ? 15 : (1 - Math.abs(leftW - rightW) / totalWeight) * 15;

  // Density — lower density is better.
  const densityScore = computeDensity({ id: 'score', elements }).score;
  const density = clamp(((100 - densityScore) / 100) * 15, 0, 15);

  // Contrast — fraction of elements using the accent/primary/secondary palette.
  const accentSet = new Set([theme.colors.primary, theme.colors.secondary, theme.colors.accent].map(normalizeColor));
  let accented = 0;
  for (const el of elements) {
    if (elementColors(el).some((c) => accentSet.has(normalizeColor(c)))) accented += 1;
  }
  const contrast = elements.length === 0 ? 0 : (accented / elements.length) * 15;

  // Brand match — fraction of elements using the theme palette (0..10).
  const palette = themePalette(theme);
  let onBrand = 0;
  for (const el of elements) {
    const colors = elementColors(el);
    if (colors.length > 0 && colors.every((c) => palette.has(normalizeColor(c)))) onBrand += 1;
  }
  const brandMatch = elements.length === 0 ? 0 : (onBrand / elements.length) * 10;

  // Similarity penalty — geometry Jaccard overlap vs existing elements (0..10).
  const similarityPenalty = existing && existing.length > 0 ? jaccard(signatures(elements), signatures(existing)) * 10 : 0;

  const raw =
    hierarchy + alignment + spacing + balance + density + contrast + brandMatch - similarityPenalty;
  const score = Math.round(clamp(raw, 0, 100) * 100) / 100;

  return {
    score,
    breakdown: {
      hierarchy: Math.round(hierarchy * 100) / 100,
      alignment: Math.round(alignment * 100) / 100,
      spacing: Math.round(spacing * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      density: Math.round(density * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      brandMatch: Math.round(brandMatch * 100) / 100,
      similarityPenalty: Math.round(similarityPenalty * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Planning / best layout
// ---------------------------------------------------------------------------

export function planLayouts(
  intent: SlideIntent,
  blocks: ContentBlocks,
  theme: Theme,
  opts: { count?: number; existing?: SlideElement[] } = {},
): LayoutCandidate[] {
  const count = clamp(opts.count ?? 3, 3, 8);
  const patterns = INTENT_PATTERNS[intent] ?? (['title-visual', '3-column', 'hero'] as LayoutPattern[]);

  const candidates: LayoutCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const pattern = patterns[i % patterns.length]!;
    const variant = i % VARIANTS.length;
    const elements = solve(blocks, pattern, theme, variant);
    const scored = scoreLayout(elements, theme, opts.existing);
    candidates.push({
      id: `cand_${intent}_${pattern}_${variant}`,
      pattern,
      intent,
      score: scored.score,
      breakdown: scored.breakdown,
      elements,
    });
  }

  candidates.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return candidates;
}

export function bestLayout(intent: SlideIntent, blocks: ContentBlocks, theme: Theme): LayoutCandidate {
  return planLayouts(intent, blocks, theme, { count: 3 })[0]!;
}
