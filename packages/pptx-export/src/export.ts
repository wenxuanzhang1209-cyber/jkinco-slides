/**
 * True PPTX export (§17) via PptxGenJS.
 *
 * Text stays text, shapes stay shapes, charts stay charts, tables stay
 * tables. Every element is mapped onto the closest native PptxGenJS object
 * rather than being rasterized.
 */
import PptxGenJS from 'pptxgenjs';
import { SLIDE_H_IN, SLIDE_W_IN, getTheme, textToPlain } from '@jkinco/scene-schema';
import type {
  ChartElement,
  ConnectorElement,
  Deck,
  ImageElement,
  MediaElement,
  RichText,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
  TextStyle,
  Theme,
} from '@jkinco/scene-schema';

export interface ExportOptions {
  theme?: Theme;
  includeNotes?: boolean; // default true
  fontFallback?: string; // default '"PingFang SC", "Microsoft YaHei", sans-serif'
  progress?: (done: number, total: number) => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** 1pt = 1/72 inch. PptxGenJS works in inches. */
const toIn = (pt: number): number => pt / 72;

/** PptxGenJS documents hex colors without the leading '#'. */
function stripHash(color?: string): string {
  if (!color) return '';
  return color.startsWith('#') ? color.slice(1) : color;
}

/** Return the first font family of a CSS font stack ("A", "B", sans-serif → A). */
function firstFont(stack?: string): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]!.trim();
  return first.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

function opacityToTransparency(opacity: number): number {
  const t = Math.round((1 - opacity) * 100);
  return Math.max(0, Math.min(100, t));
}

// ---------------------------------------------------------------------------
// Shape / chart / dash / arrow mappings
// ---------------------------------------------------------------------------

function shapeToPptx(kind: ShapeKind): PptxGenJS.SHAPE_NAME {
  switch (kind) {
    case 'rect': return 'rect';
    case 'roundRect': return 'roundRect';
    case 'pill': return 'roundRect';
    case 'ellipse': return 'ellipse';
    case 'line': return 'line';
    case 'triangle': return 'triangle';
    case 'rightTriangle': return 'rtTriangle';
    case 'diamond': return 'diamond';
    case 'pentagon': return 'pentagon';
    case 'hexagon': return 'hexagon';
    case 'chevron': return 'chevron';
    case 'arrowRight': return 'rightArrow';
    case 'arrowLeft': return 'leftArrow';
    case 'arrowUp': return 'upArrow';
    case 'arrowDown': return 'downArrow';
    case 'star': return 'star5';
    case 'parallelogram': return 'parallelogram';
    case 'trapezoid': return 'trapezoid';
    default: return 'rect';
  }
}

function dashToPptx(style: string | undefined): PptxGenJS.ShapeLineProps['dashType'] {
  switch (style) {
    case 'dashed': return 'dash';
    case 'dotted': return 'sysDot';
    default: return 'solid';
  }
}

function arrowHeadToPptx(a: ConnectorElement['startArrow']): PptxGenJS.ShapeLineProps['endArrowType'] {
  switch (a) {
    case 'arrow': return 'arrow';
    case 'dot': return 'oval';
    case 'diamond': return 'diamond';
    default: return 'none';
  }
}

function chartTypeToPptx(type: ChartElement['chartType']): PptxGenJS.CHART_NAME {
  switch (type) {
    case 'column': return 'bar';
    case 'bar': return 'bar';
    case 'line': return 'line';
    case 'area': return 'area';
    case 'pie': return 'pie';
    case 'doughnut': return 'doughnut';
    case 'radar': return 'radar';
    case 'scatter': return 'scatter';
    case 'funnel': return 'bar'; // no native funnel in PptxGenJS typings — fallback (see report)
    default: return 'bar';
  }
}

function legendPosToPptx(pos: string | undefined): PptxGenJS.IChartPropsLegend['legendPos'] {
  switch (pos) {
    case 'top': return 't';
    case 'bottom': return 'b';
    case 'left': return 'l';
    case 'right': return 'r';
    default: return 'b';
  }
}

// ---------------------------------------------------------------------------
// Rich text → PptxGenJS text runs
// ---------------------------------------------------------------------------

function richTextToRuns(rt: RichText | undefined, style: TextStyle, fontFallback: string): PptxGenJS.TextProps[] {
  const paragraphs = rt?.paragraphs ?? [];
  const runs: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((para, pi) => {
    const runsInPara = para.runs.length > 0 ? para.runs : [{ text: '' }];
    runsInPara.forEach((run, ri) => {
      const options: PptxGenJS.TextPropsOptions = {};
      if (pi > 0 && ri === 0) options.breakLine = true;
      if (run.bold ?? style.bold) options.bold = true;
      if (run.italic ?? style.italic) options.italic = true;
      if (run.underline ?? style.underline) options.underline = { style: 'sng' };
      const color = run.color ?? style.color;
      if (color) options.color = stripHash(color);
      const fontSize = run.fontSize ?? style.fontSize;
      if (fontSize) options.fontSize = fontSize;
      const fontFace = firstFont(run.fontFamily) ?? firstFont(style.fontFamily) ?? firstFont(fontFallback);
      if (fontFace) options.fontFace = fontFace;
      if (para.bullet) {
        options.bullet = para.bulletChar
          ? { characterCode: para.bulletChar.codePointAt(0)?.toString(16).toUpperCase() }
          : true;
      }
      if (para.indent !== undefined) options.indentLevel = para.indent;
      if (para.align) options.align = para.align;
      runs.push({ text: run.text, options });
    });
  });
  return runs;
}

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

function renderText(slide: PptxGenJS.Slide, el: TextElement, fontFallback: string): void {
  const runs = richTextToRuns(el.text, el.style, fontFallback);
  slide.addText(runs, {
    x: toIn(el.x),
    y: toIn(el.y),
    w: toIn(el.w),
    h: toIn(el.h),
    align: el.style.align,
    valign: el.verticalAlign ?? 'top',
    fontSize: el.style.fontSize,
    color: el.style.color ? stripHash(el.style.color) : undefined,
    fontFace: firstFont(el.style.fontFamily) ?? firstFont(fontFallback),
    transparency: opacityToTransparency(el.opacity),
    rotate: el.rotation,
  });
}

function renderShape(slide: PptxGenJS.Slide, el: ShapeElement, fontFallback: string): void {
  const fill: PptxGenJS.ShapeFillProps | undefined =
    el.fill.type === 'solid'
      ? { color: stripHash(el.fill.color), transparency: opacityToTransparency((el.fill.opacity ?? 1) * el.opacity) }
      : undefined;
  const line: PptxGenJS.ShapeLineProps = {
    color: stripHash(el.stroke.color),
    width: el.stroke.width,
    dashType: dashToPptx(el.stroke.style),
  };
  let rectRadius: number | undefined;
  if (el.shape === 'roundRect') rectRadius = (el.radius ?? 8) / 72;
  if (el.shape === 'pill') rectRadius = Math.min(el.w, el.h) / 2 / 72;

  const shapeName = shapeToPptx(el.shape);

  if (el.text && textToPlain(el.text).trim().length > 0) {
    // Shape with text: draw shape + text in one call.
    slide.addText(richTextToRuns(el.text, el.textStyle ?? {}, fontFallback), {
      shape: shapeName,
      x: toIn(el.x),
      y: toIn(el.y),
      w: toIn(el.w),
      h: toIn(el.h),
      fill,
      line,
      rectRadius,
      align: el.textStyle?.align,
      valign: 'middle',
      color: el.textStyle?.color ? stripHash(el.textStyle.color) : undefined,
      fontSize: el.textStyle?.fontSize,
      fontFace: firstFont(el.textStyle?.fontFamily) ?? firstFont(fontFallback),
      rotate: el.rotation,
    });
  } else {
    slide.addShape(shapeName, {
      x: toIn(el.x),
      y: toIn(el.y),
      w: toIn(el.w),
      h: toIn(el.h),
      fill,
      line,
      rectRadius,
      rotate: el.rotation,
    });
  }
}

function renderImage(slide: PptxGenJS.Slide, el: ImageElement): void {
  const w = toIn(el.w);
  const h = toIn(el.h);
  let sizing: PptxGenJS.ImageProps['sizing'];
  if (el.objectFit === 'contain') {
    sizing = { type: 'contain', w, h };
  } else if (el.objectFit === 'cover') {
    sizing = { type: 'cover', w, h };
  } else {
    sizing = undefined; // fill → stretch (default)
  }
  if (el.crop) {
    sizing = { type: 'crop', w, h, x: el.crop.x * w, y: el.crop.y * h };
  }

  const base = {
    x: toIn(el.x),
    y: toIn(el.y),
    w,
    h,
    sizing,
    transparency: opacityToTransparency(el.opacity),
    rotate: el.rotation,
  };

  if (el.src.startsWith('data:')) {
    slide.addImage({ data: el.src, ...base });
  } else if (/^(https?:\/\/|blob:)/.test(el.src)) {
    // Remote / blob URLs cannot be resolved by the Node exporter — placeholder.
    slide.addShape('rect', { x: base.x, y: base.y, w: base.w, h: base.h, fill: { color: 'DDDDDD' } });
    slide.addNotes(`⚠ 图片来源无法在导出中解析: ${el.src}`);
  } else {
    slide.addImage({ path: el.src, ...base });
  }
}

function renderConnector(slide: PptxGenJS.Slide, el: ConnectorElement): void {
  const x = Math.min(el.start.x, el.end.x);
  const y = Math.min(el.start.y, el.end.y);
  const w = Math.abs(el.end.x - el.start.x);
  const h = Math.abs(el.end.y - el.start.y);
  slide.addShape('line', {
    x: toIn(x),
    y: toIn(y),
    w: toIn(w),
    h: toIn(h),
    line: {
      color: stripHash(el.stroke.color),
      width: el.stroke.width,
      dashType: dashToPptx(el.stroke.style),
      beginArrowType: arrowHeadToPptx(el.startArrow),
      endArrowType: arrowHeadToPptx(el.endArrow),
    },
    flipH: el.start.x > el.end.x,
    flipV: el.start.y > el.end.y,
  });
}

function renderChart(slide: PptxGenJS.Slide, el: ChartElement, theme: Theme): void {
  const data: PptxGenJS.OptsChartData[] = el.series.map((s) => ({
    name: s.name,
    labels: el.categories,
    values: s.data.map((v) => (typeof v === 'number' ? v : 0)),
  }));
  const seriesColors = el.series.map((s) => stripHash(s.color)).filter((c): c is string => c.length > 0);
  const palette = seriesColors.length > 0 ? seriesColors : theme.chart.palette.map((c) => stripHash(c));
  const opts: PptxGenJS.IChartOpts = {
    x: toIn(el.x),
    y: toIn(el.y),
    w: toIn(el.w),
    h: toIn(el.h),
    chartColors: palette,
    showLegend: el.legend?.show ?? el.series.length > 1,
    legendPos: legendPosToPptx(el.legend?.position),
  };
  if (el.title && textToPlain(el.title).trim().length > 0) {
    opts.showTitle = true;
    opts.title = textToPlain(el.title);
  }
  if (el.chartType === 'bar') {
    opts.barDir = 'bar';
  }
  slide.addChart(chartTypeToPptx(el.chartType), data, opts);
}

function renderTable(slide: PptxGenJS.Slide, el: TableElement, theme: Theme): void {
  const headerFill = theme.colors.primaryLight ?? '#E8F0FA';
  const rows: PptxGenJS.TableRow[] = el.cells.map((row, ri) =>
    row.map((cell) => {
      const isHeader = el.headerRow && ri === 0;
      const options: PptxGenJS.TableCellProps = {
        align: cell.align ?? 'center',
        valign: 'middle',
        bold: cell.bold ?? isHeader,
        color: stripHash(cell.color) || undefined,
      };
      if (cell.fill) options.fill = { color: stripHash(cell.fill) };
      else if (isHeader) options.fill = { color: stripHash(headerFill) };
      if (cell.colspan) options.colspan = cell.colspan;
      if (cell.rowspan) options.rowspan = cell.rowspan;
      return { text: textToPlain(cell.text), options };
    }),
  );
  slide.addTable(rows, {
    x: toIn(el.x),
    y: toIn(el.y),
    w: toIn(el.w),
    colW: el.colWidths.map((w) => toIn(w)),
    rowH: el.rowHeights.map((h) => toIn(h)),
    border: el.border
      ? { type: 'solid', color: stripHash(el.border.color), pt: el.border.width }
      : undefined,
  });
}

function renderMedia(slide: PptxGenJS.Slide, el: MediaElement): void {
  slide.addShape('rect', {
    x: toIn(el.x),
    y: toIn(el.y),
    w: toIn(el.w),
    h: toIn(el.h),
    fill: { color: 'F0F0F0' },
  });
  slide.addText(
    [{ text: '⚠ 视频/音频元素在PPTX导出中占位', options: { color: '888888', fontSize: 14, align: 'center' } }],
    { x: toIn(el.x), y: toIn(el.y), w: toIn(el.w), h: toIn(el.h), valign: 'middle' },
  );
  slide.addNotes(`⚠ 视频/音频元素在PPTX导出中占位: ${el.src}`);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function exportDeckToPptx(deck: Deck, opts: ExportOptions = {}): Promise<Uint8Array> {
  const theme = opts.theme ?? getTheme(deck.themeId);
  const includeNotes = opts.includeNotes ?? true;
  const fontFallback = opts.fontFallback ?? '"PingFang SC", "Microsoft YaHei", sans-serif';
  const progress = opts.progress;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'CUSTOM', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = 'CUSTOM';
  pptx.title = deck.title;

  // PptxGenJS requires at least one slide; a blank slide stands in for an empty deck.
  const slideDefs: Array<Slide | null> = deck.slides.length > 0 ? deck.slides : [null];
  const total = slideDefs.length;

  slideDefs.forEach((slideDef, i) => {
    const slide = pptx.addSlide();

    if (slideDef) {
      if (slideDef.background?.type === 'solid') {
        slide.background = { color: stripHash(slideDef.background.color) };
      } else if (slideDef.background?.type === 'gradient') {
        // PptxGenJS has limited gradient support — approximate with the from color.
        slide.background = { color: stripHash(slideDef.background.from) };
      }

      const sorted = [...slideDef.elements].sort((a, b) => a.zIndex - b.zIndex);
      for (const el of sorted) {
        renderElement(slide, el, fontFallback, theme);
      }

      if (includeNotes && slideDef.notes && slideDef.notes.trim().length > 0) {
        slide.addNotes(slideDef.notes);
      }
    }

    progress?.(i + 1, total);
  });

  let written: unknown;
  try {
    written = await pptx.write({ outputType: 'nodebuffer' });
  } catch {
    written = null;
  }
  if (written === null || written === undefined) {
    try {
      written = await pptx.write({ outputType: 'arraybuffer' });
    } catch {
      written = null;
    }
  }
  if (written === null || written === undefined) {
    try {
      written = await pptx.write({ outputType: 'base64' });
    } catch {
      written = null;
    }
  }
  return toUint8Array(written);
}

function renderElement(slide: PptxGenJS.Slide, el: SlideElement, fontFallback: string, theme: Theme): void {
  switch (el.type) {
    case 'text': return renderText(slide, el, fontFallback);
    case 'shape': return renderShape(slide, el, fontFallback);
    case 'image': return renderImage(slide, el);
    case 'connector': return renderConnector(slide, el);
    case 'chart': return renderChart(slide, el, theme);
    case 'table': return renderTable(slide, el, theme);
    case 'group': return; // children render individually
    case 'diagram': return; // nodes/edges render individually
    case 'media': return renderMedia(slide, el);
  }
}

/**
 * Convert whatever PptxGenJS returns into Uint8Array. Realm-safe: in vitest's
 * jsdom VM the returned Buffer/ArrayBuffer may come from another realm, so
 * `instanceof` is unreliable — use duck typing throughout.
 */
function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function toUint8Array(v: unknown): Promise<Uint8Array> {
  if (v === null || v === undefined) {
    throw new Error('PptxGenJS write() returned nothing');
  }
  if (typeof v === 'string') {
    // 'base64' output type — but could also be raw binary text in some environments.
    if (/^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 256)) && v.length > 4) return base64ToBytes(v);
    return new TextEncoder().encode(v);
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    // Buffer / Uint8Array (possibly from another realm): an ArrayBuffer view.
    if (ArrayBuffer.isView(obj)) {
      const view = obj as unknown as Uint8Array;
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
    }
    // ArrayBuffer-like.
    if (typeof obj.byteLength === 'number' && typeof obj.slice === 'function') {
      try {
        const ab = obj as unknown as ArrayBuffer;
        return new Uint8Array(ab.slice(0));
      } catch {
        // fall through
      }
    }
    // Blob-like.
    if (typeof (obj as unknown as Blob).arrayBuffer === 'function') {
      const buf = await (obj as unknown as Blob).arrayBuffer();
      return new Uint8Array(buf);
    }
    // pptxgenjs returns { data: Uint8Array } in some paths.
    if (obj.data !== undefined) return toUint8Array(obj.data);
    // Buffer from another realm exposes base64 through toString('base64').
    if (typeof obj.toString === 'function') {
      try {
        const b64 = (obj.toString as (enc?: string) => string)('base64');
        if (typeof b64 === 'string' && b64.length > 4 && /^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 256))) {
          return base64ToBytes(b64);
        }
      } catch {
        // fall through
      }
    }
  }
  throw new Error('PptxGenJS write() returned an unsupported type');
}

export async function exportDeckToPptxBlob(deck: Deck, opts: ExportOptions = {}): Promise<Blob> {
  const data = await exportDeckToPptx(deck, opts);
  return new Blob([data as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
