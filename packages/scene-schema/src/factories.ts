import { DEFAULT_CONTENT_BUDGET, SLIDE_H, SLIDE_W } from './constants';
import { DEFAULT_THEME_ID, getTheme } from './themes';
import { emptyText, textFromPlain } from './rich-text';
import type {
  ChartElement,
  ConnectorElement,
  ContentBudget,
  Deck,
  DiagramElement,
  GroupElement,
  ImageElement,
  MediaElement,
  RichText,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  SlidePurpose,
  TableCell,
  TableElement,
  TextElement,
  TextAlign,
} from './types';
import { normalizeZIndexes, uid } from './utils';

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

function base(id: string, type: SlideElement['type'], x: number, y: number, w: number, h: number) {
  return {
    id,
    type,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    zIndex: 0,
  };
}

export interface TextOptions {
  id?: string;
  role?: TextElement['role'];
  name?: string;
  style?: TextElement['style'];
  verticalAlign?: TextElement['verticalAlign'];
  autoFit?: boolean;
  semantic?: TextElement['semantic'];
  zIndex?: number;
}

export function createText(x: number, y: number, w: number, h: number, text: RichText | string, opts: TextOptions = {}): TextElement {
  const el = base(opts.id ?? uid('txt'), 'text', x, y, w, h) as TextElement;
  el.role = opts.role;
  el.name = opts.name;
  el.text = typeof text === 'string' ? textFromPlain(text) : text;
  el.style = opts.style ?? {};
  el.verticalAlign = opts.verticalAlign;
  el.autoFit = opts.autoFit;
  el.semantic = opts.semantic;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface ShapeOptions {
  id?: string;
  role?: ShapeElement['role'];
  name?: string;
  fill?: ShapeElement['fill'];
  stroke?: ShapeElement['stroke'];
  radius?: number;
  text?: RichText | string;
  textStyle?: ShapeElement['textStyle'];
  shadow?: ShapeElement['shadow'];
  semantic?: ShapeElement['semantic'];
  zIndex?: number;
}

export function createShape(
  shape: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: ShapeOptions = {},
): ShapeElement {
  const theme = getTheme(DEFAULT_THEME_ID);
  const el = base(opts.id ?? uid('shp'), 'shape', x, y, w, h) as ShapeElement;
  el.shape = shape;
  el.role = opts.role;
  el.name = opts.name;
  el.fill = opts.fill ?? { type: 'solid', color: theme.colors.primaryLight, opacity: 1 };
  el.stroke = opts.stroke ?? { color: theme.colors.primary, width: theme.borderWidth, style: 'solid' };
  el.radius = opts.radius ?? (shape === 'roundRect' || shape === 'pill' ? theme.radius : undefined);
  el.text = typeof opts.text === 'string' ? textFromPlain(opts.text) : opts.text;
  el.textStyle = opts.textStyle;
  el.shadow = opts.shadow;
  el.semantic = opts.semantic;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface ImageOptions {
  id?: string;
  role?: ImageElement['role'];
  name?: string;
  objectFit?: ImageElement['objectFit'];
  crop?: ImageElement['crop'];
  radius?: number;
  alt?: string;
  semantic?: ImageElement['semantic'];
  zIndex?: number;
}

export function createImage(x: number, y: number, w: number, h: number, src: string, opts: ImageOptions = {}): ImageElement {
  const el = base(opts.id ?? uid('img'), 'image', x, y, w, h) as ImageElement;
  el.role = opts.role;
  el.name = opts.name;
  el.src = src;
  el.objectFit = opts.objectFit ?? 'cover';
  el.crop = opts.crop;
  el.radius = opts.radius;
  el.alt = opts.alt;
  el.semantic = opts.semantic;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface ConnectorOptions {
  id?: string;
  role?: ConnectorElement['role'];
  name?: string;
  fromId?: string;
  toId?: string;
  fromAnchor?: ConnectorElement['fromAnchor'];
  toAnchor?: ConnectorElement['toAnchor'];
  kind?: ConnectorElement['kind'];
  startArrow?: ConnectorElement['startArrow'];
  endArrow?: ConnectorElement['endArrow'];
  stroke?: ConnectorElement['stroke'];
  label?: RichText | string;
  zIndex?: number;
}

export function createConnector(
  start: { x: number; y: number },
  end: { x: number; y: number },
  opts: ConnectorOptions = {},
): ConnectorElement {
  const theme = getTheme(DEFAULT_THEME_ID);
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  const el = base(opts.id ?? uid('cnn'), 'connector', x, y, w, h) as ConnectorElement;
  el.role = opts.role;
  el.name = opts.name;
  el.fromId = opts.fromId;
  el.toId = opts.toId;
  el.fromAnchor = opts.fromAnchor ?? 'auto';
  el.toAnchor = opts.toAnchor ?? 'auto';
  el.start = { ...start };
  el.end = { ...end };
  el.kind = opts.kind ?? 'elbow';
  el.startArrow = opts.startArrow ?? 'none';
  el.endArrow = opts.endArrow ?? 'arrow';
  el.stroke = opts.stroke ?? { color: theme.diagram.edgeColor, width: theme.diagram.edgeWidth, style: 'solid' };
  el.label = typeof opts.label === 'string' ? textFromPlain(opts.label) : opts.label;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface ChartOptions {
  id?: string;
  role?: ChartElement['role'];
  name?: string;
  unit?: string;
  story?: ChartElement['story'];
  title?: RichText | string;
  legend?: ChartElement['legend'];
  axis?: ChartElement['axis'];
  dataSource?: string;
  sourceUrl?: string;
  zIndex?: number;
}

export function createChart(
  chartType: ChartElement['chartType'],
  x: number,
  y: number,
  w: number,
  h: number,
  categories: string[],
  series: ChartElement['series'],
  opts: ChartOptions = {},
): ChartElement {
  const el = base(opts.id ?? uid('cht'), 'chart', x, y, w, h) as ChartElement;
  el.role = opts.role;
  el.name = opts.name;
  el.chartType = chartType;
  el.categories = categories;
  el.series = series;
  el.unit = opts.unit;
  el.story = opts.story;
  el.title = typeof opts.title === 'string' ? textFromPlain(opts.title) : opts.title;
  el.legend = opts.legend ?? { show: series.length > 1 };
  el.axis = opts.axis ?? { show: true };
  el.dataSource = opts.dataSource;
  el.sourceUrl = opts.sourceUrl;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface TableOptions {
  id?: string;
  role?: TableElement['role'];
  name?: string;
  headerRow?: boolean;
  bandedRows?: boolean;
  border?: TableElement['border'];
  source?: TableElement['source'];
  zIndex?: number;
}

/** Build a table from a 2D array of plain strings. */
export function createTable(
  x: number,
  y: number,
  rows: string[][],
  opts: TableOptions = {},
): TableElement {
  const id = opts.id ?? uid('tbl');
  const theme = getTheme(DEFAULT_THEME_ID);
  const rowCount = rows.length;
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const totalW = 880;
  const colW = Math.round(totalW / colCount);
  const rowH = 36;
  const cells: TableCell[][] = rows.map((row) =>
    Array.from({ length: colCount }, (_, c) => ({
      text: textFromPlain(row[c] ?? ''),
      align: 'center' as TextAlign,
      bold: opts.headerRow === true ? undefined : undefined,
    })),
  );
  const el = base(id, 'table', x, y, totalW, rowH * rowCount) as TableElement;
  el.role = opts.role;
  el.name = opts.name;
  el.colWidths = Array.from({ length: colCount }, () => colW);
  el.rowHeights = Array.from({ length: rowCount }, () => rowH);
  el.cells = cells;
  el.headerRow = opts.headerRow ?? false;
  el.bandedRows = opts.bandedRows ?? true;
  el.border = opts.border ?? { color: theme.colors.border, width: 1, style: 'solid' };
  el.source = opts.source;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export interface DiagramOptions {
  id?: string;
  role?: DiagramElement['role'];
  name?: string;
  childIds?: string[];
  lanes?: DiagramElement['lanes'];
  groups?: DiagramElement['groups'];
  nodeGap?: number;
  levelGap?: number;
  semantic?: DiagramElement['semantic'];
  zIndex?: number;
}

export function createDiagram(
  layout: DiagramElement['layout'],
  direction: DiagramElement['direction'],
  nodes: DiagramElement['nodes'],
  edges: DiagramElement['edges'],
  x: number,
  y: number,
  w: number,
  h: number,
  opts: DiagramOptions = {},
): DiagramElement {
  const el = base(opts.id ?? uid('dgm'), 'diagram', x, y, w, h) as DiagramElement;
  el.role = opts.role;
  el.name = opts.name;
  el.layout = layout;
  el.direction = direction;
  el.nodes = nodes;
  el.edges = edges;
  el.childIds = opts.childIds ?? [];
  el.lanes = opts.lanes;
  el.groups = opts.groups;
  el.nodeGap = opts.nodeGap;
  el.levelGap = opts.levelGap;
  el.semantic = opts.semantic;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export function createGroup(childIds: string[], x: number, y: number, w: number, h: number, opts: { id?: string; name?: string; zIndex?: number } = {}): GroupElement {
  const el = base(opts.id ?? uid('grp'), 'group', x, y, w, h) as GroupElement;
  el.name = opts.name ?? '分组';
  el.childIds = [...childIds];
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

export function createMedia(
  mediaType: MediaElement['mediaType'],
  x: number,
  y: number,
  w: number,
  h: number,
  src: string,
  opts: { id?: string; poster?: string; autoplay?: boolean; zIndex?: number } = {},
): MediaElement {
  const el = base(opts.id ?? uid('med'), 'media', x, y, w, h) as MediaElement;
  el.mediaType = mediaType;
  el.src = src;
  el.poster = opts.poster;
  el.autoplay = opts.autoplay ?? false;
  el.controls = true;
  el.zIndex = opts.zIndex ?? 0;
  return el;
}

// ---------------------------------------------------------------------------
// Slides / decks
// ---------------------------------------------------------------------------

export function createSlide(opts: {
  id?: string;
  name?: string;
  purpose?: SlidePurpose;
  intent?: Slide['intent'];
  elements?: SlideElement[];
  notes?: string;
  section?: string;
  background?: Slide['background'];
} = {}): Slide {
  const elements = normalizeZIndexes(opts.elements ?? []);
  return {
    id: opts.id ?? uid('sld'),
    name: opts.name,
    elements,
    notes: opts.notes,
    purpose: opts.purpose,
    intent: opts.intent,
    section: opts.section,
    background: opts.background ?? { type: 'none' },
    qaStatus: 'pending',
  };
}

export function createDeck(opts: {
  id?: string;
  title?: string;
  slides?: Slide[];
  themeId?: string;
  deckGoal?: string;
  audience?: string;
  settings?: Partial<Deck['settings']>;
} = {}): Deck {
  const now = new Date().toISOString();
  return {
    id: opts.id ?? uid('deck'),
    title: opts.title ?? '未命名演示文稿',
    deckGoal: opts.deckGoal,
    audience: opts.audience,
    slides: opts.slides ?? [],
    themeId: opts.themeId ?? DEFAULT_THEME_ID,
    settings: {
      language: 'zh',
      densityLimit: 85,
      budget: defaultBudget(),
      smartLayout: 'smart',
      ...opts.settings,
    },
    meta: {
      createdAt: now,
      updatedAt: now,
      version: 1,
      namedVersions: [],
      sourceIds: [],
    },
  };
}

export function defaultBudget(): ContentBudget {
  return { ...DEFAULT_CONTENT_BUDGET };
}

export { SLIDE_W, SLIDE_H };
