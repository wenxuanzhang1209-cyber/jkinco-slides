/**
 * Core Scene Graph schema (§3, §37).
 *
 * Every element knows *why it exists* (role, semantic, intent) and is a real,
 * individually editable object. All engines (editor, AI, import, export,
 * collaboration, QA) share this single schema.
 */

export type ElementType =
  | 'text'
  | 'shape'
  | 'image'
  | 'connector'
  | 'chart'
  | 'table'
  | 'diagram'
  | 'group'
  | 'media';

/** Semantic role of an element on the slide. */
export type SemanticRole =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bullet'
  | 'key_message'
  | 'metric'
  | 'metric_label'
  | 'caption'
  | 'footnote'
  | 'page_number'
  | 'source'
  | 'quote'
  | 'author'
  | 'section_label'
  | 'diagram_node'
  | 'diagram_edge'
  | 'diagram_label'
  | 'chart_title'
  | 'column_header'
  | 'logo';

/** Semantic metadata: why the element exists, where its content came from. */
export interface SemanticInfo {
  /** What the element communicates, e.g. "项目总体架构". */
  intent?: string;
  /** Topic this element belongs to (§3 example). */
  topic?: string;
  /** 0..1 — how important the element is for the slide message. */
  importance?: number;
  /** Ids of source documents this content was derived from (§33). */
  sourceIds?: string[];
  /** Whether AI is allowed to edit this element directly. */
  aiEditable?: boolean;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  role?: SemanticRole;
  /** Human readable name shown in layers / outline. */
  name?: string;
  /** Position and size in slide logical coordinates (pt). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees, clockwise, around element center. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /** Stacking order; higher renders on top. Unique per slide. */
  zIndex: number;
  /** Back-reference to owning group/diagram, maintained by the engine. */
  groupId?: string;
  semantic?: SemanticInfo;
}

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
}

export interface Paragraph {
  runs: Run[];
  align?: TextAlign;
  bullet?: boolean;
  bulletChar?: string;
  /** Indent level 0..n */
  indent?: number;
  spacingBefore?: number;
  lineSpacing?: number;
}

/** Structural rich text model — the only text representation in the system. */
export interface RichText {
  paragraphs: Paragraph[];
}

export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: TextAlign;
  lineSpacing?: number;
  letterSpacing?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: RichText;
  style: TextStyle;
  verticalAlign?: VerticalAlign;
  /** When true, engine may shrink font as the last resort to avoid overflow (§5.3). */
  autoFit?: boolean;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'line'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'chevron'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'star'
  | 'parallelogram'
  | 'trapezoid'
  | 'pill';

export interface FillStyle {
  type: 'solid' | 'none';
  color?: string;
  opacity?: number;
}

export interface StrokeStyle {
  color: string;
  width: number;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface ShadowStyle {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: FillStyle;
  stroke: StrokeStyle;
  /** Corner radius for roundRect (pt). */
  radius?: number;
  /** Optional text rendered inside the shape. */
  text?: RichText;
  textStyle?: TextStyle;
  shadow?: ShadowStyle | null;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Normalized crop rect, each value in 0..1. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  /** data: URL, blob URL or http(s) URL. */
  src: string;
  objectFit: 'cover' | 'contain' | 'fill';
  crop?: CropRect;
  radius?: number;
  alt?: string;
  filter?: string;
  /** Copyright / source attribution (§32). */
  sourceName?: string;
  sourceUrl?: string;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export type ArrowHead = 'none' | 'arrow' | 'dot' | 'diamond';
export type Anchor = 'auto' | 'center' | 'top' | 'right' | 'bottom' | 'left';

export interface ConnectorElement extends BaseElement {
  type: 'connector';
  /** Optional node bindings — edges follow nodes when they move. */
  fromId?: string;
  toId?: string;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  /** Absolute anchor points in slide coordinates. */
  start: Point;
  end: Point;
  kind: 'straight' | 'elbow' | 'curve';
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  stroke: StrokeStyle;
  label?: RichText;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

export type ChartType =
  | 'bar'
  | 'column'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'scatter'
  | 'funnel';

export interface ChartSeries {
  name: string;
  data: Array<number | null>;
  color?: string;
}

export interface ChartElement extends BaseElement {
  type: 'chart';
  chartType: ChartType;
  /** Dataset id from the data layer (§12). */
  dataSource?: string;
  categories: string[];
  series: ChartSeries[];
  unit?: string;
  /** Data story annotation, e.g. highlight 2026Q2 → "同比增长32%". */
  story?: { highlight?: string; message?: string };
  title?: RichText;
  legend?: { show: boolean; position?: 'top' | 'bottom' | 'left' | 'right' };
  axis?: { show: boolean };
  sourceUrl?: string;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface TableCell {
  text: RichText;
  fill?: string;
  align?: TextAlign;
  bold?: boolean;
  color?: string;
  colspan?: number;
  rowspan?: number;
}

export interface TableElement extends BaseElement {
  type: 'table';
  /** Column widths in pt; must sum to element w. */
  colWidths: number[];
  /** Row heights in pt; must sum to element h. */
  rowHeights: number[];
  cells: TableCell[][];
  headerRow?: boolean;
  bandedRows?: boolean;
  border?: StrokeStyle;
  source?: { name: string; sheet?: string; range?: string };
}

// ---------------------------------------------------------------------------
// Diagrams (§11) — native diagram objects, never PNG
// ---------------------------------------------------------------------------

export type DiagramLayoutKind =
  | 'hierarchy'
  | 'dag'
  | 'swimlane'
  | 'timeline'
  | 'radial'
  | 'matrix'
  | 'architecture'
  | 'funnel'
  | 'cycle'
  | 'pyramid';

export interface DiagramNodeMeta {
  id: string;
  label?: string;
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  /** Hierarchy level for layered layouts. */
  level?: number;
}

export interface DiagramEdgeMeta {
  id: string;
  from: string;
  to: string;
  label?: string;
  arrow?: boolean;
  dashed?: boolean;
}

export interface DiagramLane {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface DiagramGroupMeta {
  id: string;
  label?: string;
  nodeIds: string[];
  fill?: string;
}

/**
 * A diagram is a group container: `childIds` reference the node ShapeElements
 * and edge ConnectorElements that live on the same slide as first-class,
 * individually editable objects. `nodes`/`edges` carry the graph structure.
 */
export interface DiagramElement extends BaseElement {
  type: 'diagram';
  layout: DiagramLayoutKind;
  direction: 'vertical' | 'horizontal';
  nodes: DiagramNodeMeta[];
  edges: DiagramEdgeMeta[];
  lanes?: DiagramLane[];
  groups?: DiagramGroupMeta[];
  childIds: string[];
  /** Gap between sibling nodes (pt). */
  nodeGap?: number;
  /** Gap between levels (pt). */
  levelGap?: number;
}

// ---------------------------------------------------------------------------
// Groups / media
// ---------------------------------------------------------------------------

export interface GroupElement extends BaseElement {
  type: 'group';
  childIds: string[];
}

export interface MediaElement extends BaseElement {
  type: 'media';
  mediaType: 'video' | 'audio';
  src: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
}

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | ConnectorElement
  | ChartElement
  | TableElement
  | DiagramElement
  | GroupElement
  | MediaElement;

export type ConcreteElementType = SlideElement['type'];

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

export type SlidePurpose =
  | 'cover'
  | 'agenda'
  | 'section'
  | 'situation'
  | 'portfolio_overview'
  | 'platform'
  | 'research'
  | 'architecture'
  | 'process'
  | 'timeline'
  | 'comparison'
  | 'kpi'
  | 'data_story'
  | 'table'
  | 'quote'
  | 'summary'
  | 'thanks'
  | 'content'
  | 'blank';

/** One main communication goal per slide (§4.3). */
export type SlideIntent =
  | 'explain'
  | 'compare'
  | 'prove'
  | 'decide'
  | 'update'
  | 'timeline'
  | 'architecture'
  | 'process'
  | 'kpi'
  | 'data_story'
  | 'quote'
  | 'summary';

export type SlideBackground =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle?: number };

export interface Slide {
  id: string;
  name?: string;
  elements: SlideElement[];
  notes?: string;
  purpose?: SlidePurpose;
  intent?: SlideIntent;
  /** Chapter / section name for grouping in the rail. */
  section?: string;
  background?: SlideBackground;
  layoutId?: string;
  qaStatus?: 'pending' | 'ready' | 'issues';
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Theme / Style DNA
// ---------------------------------------------------------------------------

export interface StyleDna {
  name?: string;
  palette: {
    primary: string;
    secondary: string;
    accent?: string;
    neutrals: string[];
  };
  fonts: { heading: string; body: string };
  radius: number;
  borderWidth: number;
  spacing: number;
  coverGrammar?: {
    titleAlign?: TextAlign;
    accentPlacement?: 'left' | 'right' | 'top' | 'bottom' | 'none';
  };
  sectionGrammar?: { marker?: 'number' | 'bar' | 'none'; align?: TextAlign };
  titleGrammar?: { fontSize: number; color: string; bold: boolean; align: TextAlign };
  footerGrammar?: { showPageNumber?: boolean; showLogo?: boolean; fontSize?: number; color?: string };
  diagramDefaults?: { fill: string; stroke: string; radius: number; arrowColor: string };
  chartDefaults?: { palette: string[] };
  extractedFrom?: string[];
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

export interface ContentBudget {
  titleMax: number;
  subtitleMax: number;
  bodyTarget: number;
  bodyHard: number;
  bulletsDefault: number;
  bulletsMax: number;
  bulletChars: number;
  modulesMax: number;
  chartsMax: number;
  emphasisColorsMax: number;
  bodyMinFont: number;
  bodyFontRange: [number, number];
  keyNumberRange: [number, number];
  titleFontRange: [number, number];
}

export interface DeckSettings {
  language?: 'zh' | 'en';
  densityLimit?: number;
  budget?: ContentBudget;
  /** §29 — Free (PowerPoint/Figma) vs Smart auto-layout. */
  smartLayout?: 'free' | 'smart';
}

export interface NamedVersion {
  id: string;
  name: string;
  at: string;
}

export interface DeckMeta {
  createdAt: string;
  updatedAt: string;
  author?: string;
  version: number;
  namedVersions?: NamedVersion[];
  sourceIds?: string[];
}

export interface Deck {
  id: string;
  title: string;
  deckGoal?: string;
  audience?: string;
  slides: Slide[];
  themeId: string;
  styleDna?: StyleDna;
  settings: DeckSettings;
  meta: DeckMeta;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type StyleKind =
  | 'corporate-classic'
  | 'corporate-modern'
  | 'research'
  | 'executive'
  | 'technical'
  | 'minimal';

export interface ThemeColors {
  primary: string;
  primaryDark?: string;
  primaryLight?: string;
  secondary: string;
  accent: string;
  background: string;
  slideBackground: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  neutrals: string[];
  chartPalette: string[];
}

export interface ThemeFonts {
  heading: string;
  body: string;
  mono?: string;
}

export interface Theme {
  id: string;
  name: string;
  kind: StyleKind;
  colors: ThemeColors;
  fonts: ThemeFonts;
  radius: number;
  borderWidth: number;
  spacing: number;
  shadow: ShadowStyle | null;
  title: { fontSize: number; color: string; bold: boolean; align: TextAlign };
  subtitle: { fontSize: number; color: string };
  body: { fontSize: number; color: string; lineSpacing: number };
  keyNumber: { fontSize: number; color: string; bold: boolean };
  footer: { fontSize: number; color: string; showPageNumber: boolean };
  diagram: {
    nodeFill: string;
    nodeStroke: string;
    edgeColor: string;
    radius: number;
    edgeWidth: number;
    arrow: ArrowHead;
  };
  chart: { palette: string[]; textColor: string };
  cover: { titleFontSize: number; accentBar: boolean; accentBarColor: string };
}

// ---------------------------------------------------------------------------
// Data layer (§12)
// ---------------------------------------------------------------------------

export interface DataSet {
  id: string;
  name: string;
  /** CSV / JSON-derived tabular data. */
  columns: string[];
  rows: Array<Array<string | number | null>>;
  source?: { kind: 'xlsx' | 'csv' | 'json' | 'manual' | 'api' | 'sql'; name?: string; url?: string };
}

export interface DataSetLibrary {
  datasets: Record<string, DataSet>;
}
