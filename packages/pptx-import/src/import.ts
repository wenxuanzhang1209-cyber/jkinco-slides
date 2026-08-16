/**
 * High-fidelity PPTX import (§16).
 *
 * Parses the OOXML of a .pptx into the shared scene graph. Every element type
 * that can be recovered natively is recovered natively (text, shapes, images,
 * connectors, charts, tables); SmartArt and truly foreign objects degrade to
 * preview/placeholder elements with an explicit warning — never silently
 * dropped.
 */
import JSZip from 'jszip';
import {
  SLIDE_W,
  createDeck,
  createDiagram,
  createSlide,
  textFromPlain,
  textToPlain,
} from '@jkinco/scene-schema';
import type {
  ChartElement,
  ChartSeries,
  ChartType,
  ConnectorElement,
  Deck,
  DiagramElement,
  ImageElement,
  Paragraph,
  RichText,
  Run,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  StyleDna,
  TableCell,
  TableElement,
  TextElement,
  Theme,
} from '@jkinco/scene-schema';

export type ImportElementStatus = 'native' | 'approximation' | 'preview' | 'unsupported';

export interface ImportWarning {
  slideIndex: number;
  elementHint: string;
  status: ImportElementStatus;
  message: string;
}

export interface ImportReport {
  slideCount: number;
  elementCount: number;
  images: number;
  tables: number;
  charts: number;
  connectors: number;
  warnings: ImportWarning[];
}

export interface ImportOptions {
  themeId?: string;
  title?: string;
}

const FIXED_TIME = '1970-01-01T00:00:00.000Z';
const EMU_PER_PT = 12700;
const EMU_PER_IN = 914400;

// ---------------------------------------------------------------------------
// Deterministic id generation (§43 — same input ⇒ same output)
// ---------------------------------------------------------------------------

let idCounter = 0;

function resetIds(): void {
  idCounter = 0;
}

function nextId(slideIndex: number): string {
  idCounter += 1;
  return `imp${slideIndex}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// XML utilities
// ---------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function intAttr(s: string | undefined, fallback = 0): number {
  if (s === undefined) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Extract balanced top-level occurrences of the given element names (in document order). */
function extractTagged(xml: string, names: string[]): Array<{ name: string; attrs: string; body: string }> {
  const results: Array<{ name: string; attrs: string; body: string }> = [];
  const alt = names.join('|');
  const openRe = new RegExp(`<(${alt})(\\s[^>]*?)?(?:/)?>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml))) {
    const full = m[0]!;
    const name = m[1]!;
    const attrs = m[2] ?? '';
    if (full.endsWith('/>')) continue;
    const start = openRe.lastIndex;
    const anyRe = new RegExp(`<${name}(\\s[^>]*?)?(?:/)?>|</${name}>`, 'g');
    anyRe.lastIndex = start;
    let depth = 1;
    let closed = false;
    let m2: RegExpExecArray | null;
    while ((m2 = anyRe.exec(xml))) {
      if (m2[0]!.startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          results.push({ name, attrs, body: xml.slice(start, m2.index) });
          openRe.lastIndex = anyRe.lastIndex;
          closed = true;
          break;
        }
      } else if (!m2[0]!.endsWith('/>')) {
        depth += 1;
      }
    }
    if (!closed) openRe.lastIndex = start;
  }
  return results;
}

function firstMatch(xml: string, re: RegExp): string | undefined {
  const m = xml.match(re);
  return m?.[1];
}

function txBodyContent(xml: string): string | undefined {
  return firstMatch(xml, /<(?:p|a):txBody>([\s\S]*?)<\/(?:p|a):txBody>/);
}

// ---------------------------------------------------------------------------
// Rich text parsing
// ---------------------------------------------------------------------------

function mapAlign(algn: string | undefined): TextElement['style']['align'] {
  switch (algn) {
    case 'ctr': return 'center';
    case 'r': return 'right';
    case 'just': return 'justify';
    default: return 'left';
  }
}

function runColor(rPr: string): string | undefined {
  const c = firstMatch(rPr, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
  return c ? `#${c.toUpperCase()}` : undefined;
}

function parseRuns(pBody: string): Run[] {
  const runs: Run[] = [];
  const rRe = /<a:r(?:\s[^>]*)?>([\s\S]*?)<\/a:r>/g;
  let m: RegExpExecArray | null;
  while ((m = rRe.exec(pBody))) {
    const rBody = m[1]!;
    const rPrMatch = rBody.match(/<a:rPr(\s[^>]*)?>([\s\S]*?)<\/a:rPr>/);
    const rPrAttrs = rPrMatch?.[1] ?? '';
    const rPrInner = rPrMatch?.[2] ?? '';
    const text = decodeXml(firstMatch(rBody, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/) ?? '');
    const sz = firstMatch(rPrAttrs, /\ssz="([0-9]+)"/);
    const family = firstMatch(rPrInner, /<a:latin typeface="([^"]*)"/);
    runs.push({
      text,
      bold: / b="1"/.test(rPrAttrs) || / b="true"/.test(rPrAttrs),
      italic: / i="1"/.test(rPrAttrs) || / i="true"/.test(rPrAttrs),
      underline: / u="sng"/.test(rPrAttrs) || / u="(dash|heavy|wavy)"/.test(rPrAttrs),
      color: runColor(rPrInner),
      fontSize: sz ? intAttr(sz) / 100 : undefined,
      fontFamily: family,
    });
  }
  return runs;
}

interface ParsedText {
  text: RichText;
  hasText: boolean;
  align?: TextElement['style']['align'];
  anchor?: TextElement['verticalAlign'];
}

function parseTxBodyContent(content: string): ParsedText {
  const paragraphs: Paragraph[] = [];
  let align: TextElement['style']['align'] | undefined;
  const anchorAttr = firstMatch(content, /<a:bodyPr[^>]*anchor="([^"]*)"/);
  const anchor: TextElement['verticalAlign'] =
    anchorAttr === 'ctr' ? 'middle' : anchorAttr === 'b' ? 'bottom' : 'top';

  const pRe = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(content))) {
    const pBody = m[1]!;
    const pPr = firstMatch(pBody, /<a:pPr(?:\s[^>]*)?>([\s\S]*?)<\/a:pPr>/) ?? '';
    const algn = firstMatch(pPr, /\salgn="([^"]*)"/);
    let bullet = false;
    let bulletChar: string | undefined;
    if (/<a:buChar/.test(pPr)) {
      bullet = true;
      bulletChar = firstMatch(pPr, /<a:buChar[^>]*char="([^"]*)"/) ?? '•';
    } else if (/<a:buAutoNum/.test(pPr)) {
      bullet = true;
      bulletChar = '•';
    }
    const runs = parseRuns(pBody);
    const para: Paragraph = {
      runs: runs.length > 0 ? runs : [{ text: '' }],
      align: mapAlign(algn),
      bullet: bullet ? true : undefined,
      bulletChar,
    };
    if (para.align && !align) align = para.align;
    paragraphs.push(para);
  }
  const text: RichText = { paragraphs: paragraphs.length > 0 ? paragraphs : [{ runs: [{ text: '' }] }] };
  return { text, hasText: textToPlain(text).trim().length > 0, align, anchor };
}

function parseTxBody(xml: string): ParsedText {
  const content = txBodyContent(xml);
  if (!content) return { text: { paragraphs: [{ runs: [{ text: '' }] }] }, hasText: false };
  return parseTxBodyContent(content);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

function parseXfrm(spPr: string): Xfrm {
  const m = spPr.match(/<(?:a|p):xfrm([^>]*)>([\s\S]*?)<\/(?:a|p):xfrm>/);
  const attrs = m?.[1] ?? '';
  const body = m?.[2] ?? '';
  const x = firstMatch(body, /<a:off[^>]*?x="([0-9-]+)"/);
  const y = firstMatch(body, /<a:off[^>]*?y="([0-9-]+)"/);
  const cx = firstMatch(body, /<a:ext[^>]*?cx="([0-9-]+)"/);
  const cy = firstMatch(body, /<a:ext[^>]*?cy="([0-9-]+)"/);
  const rot = firstMatch(attrs, /\srot="([0-9-]+)"/);
  return {
    x: intAttr(x),
    y: intAttr(y),
    w: intAttr(cx),
    h: intAttr(cy),
    rotation: rot ? intAttr(rot) / 60000 : 0,
    flipH: /flipH="1"/.test(attrs),
    flipV: /flipV="1"/.test(attrs),
  };
}

interface ShapeStyle {
  fill: ShapeElement['fill'];
  stroke: ShapeElement['stroke'];
  radius?: number;
}

function parseShapeStyle(spPr: string, scale: number, xfrm: Xfrm): ShapeStyle {
  const noFill = /<a:noFill\/>/.test(spPr);
  const fillColor = firstMatch(spPr, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
  const fill: ShapeElement['fill'] = noFill
    ? { type: 'none' }
    : { type: 'solid', color: fillColor ? `#${fillColor.toUpperCase()}` : '#E8F0FA', opacity: 1 };

  const ln = spPr.match(/<a:ln(?:\s[^>]*)?>([\s\S]*?)<\/a:ln>/)?.[0] ?? '';
  const lnW = firstMatch(ln, /\sw="([0-9]+)"/) ?? firstMatch(spPr, /<a:ln[^>]*?w="([0-9]+)"/);
  const lnColor = firstMatch(ln, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
  const dash = firstMatch(ln, /<a:prstDash val="([^"]*)"/);
  const stroke: ShapeElement['stroke'] = {
    color: lnColor ? `#${lnColor.toUpperCase()}` : '#94A3B8',
    width: lnW ? intAttr(lnW) / EMU_PER_PT : 1,
    style: dash === 'dash' || dash === 'sysDash' ? 'dashed' : dash === 'dot' || dash === 'sysDot' ? 'dotted' : 'solid',
  };

  let radius: number | undefined;
  const adj = firstMatch(spPr, /<a:gd name="adj" fmla="val ([0-9]+)"/);
  if (adj) {
    const wPt = (xfrm.w / EMU_PER_PT) * scale;
    const hPt = (xfrm.h / EMU_PER_PT) * scale;
    radius = (intAttr(adj) / 100000) * Math.min(wPt, hPt);
  }

  return { fill, stroke, radius };
}

// ---------------------------------------------------------------------------
// Shape kind mapping (reverse of export)
// ---------------------------------------------------------------------------

function shapeKindFromPrst(prst: string): ShapeKind | null {
  switch (prst) {
    case 'rect': return 'rect';
    case 'roundRect':
    case 'round1Rect':
    case 'round2SameRect': return 'roundRect';
    case 'ellipse': return 'ellipse';
    case 'line': return 'line';
    case 'triangle': return 'triangle';
    case 'rtTriangle': return 'rightTriangle';
    case 'diamond': return 'diamond';
    case 'pentagon':
    case 'homePlate': return 'pentagon';
    case 'hexagon': return 'hexagon';
    case 'chevron': return 'chevron';
    case 'rightArrow': return 'arrowRight';
    case 'leftArrow': return 'arrowLeft';
    case 'upArrow': return 'arrowUp';
    case 'downArrow': return 'arrowDown';
    case 'star5':
    case 'star4':
    case 'star6':
    case 'star8': return 'star';
    case 'parallelogram': return 'parallelogram';
    case 'trapezoid': return 'trapezoid';
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------

interface Ctx {
  zip: JSZip;
  scale: number;
  slideIndex: number;
  warnings: ImportWarning[];
  images: number;
  tables: number;
  charts: number;
  connectors: number;
}

function base(id: string, type: SlideElement['type'], x: number, y: number, w: number, h: number, rotation: number) {
  return { id, type, x, y, w, h, rotation, opacity: 1, locked: false, hidden: false, zIndex: 0 };
}

function clampDim(v: number): number {
  return Math.max(v, 1);
}

function buildText(id: string, x: number, y: number, w: number, h: number, rotation: number, parsed: ParsedText): TextElement {
  const el = base(id, 'text', x, y, w, h, rotation) as TextElement;
  el.text = parsed.text;
  el.style = { align: parsed.align };
  el.verticalAlign = parsed.anchor;
  return el;
}

function buildShape(id: string, shape: ShapeKind, x: number, y: number, w: number, h: number, rotation: number, style: ShapeStyle, text: RichText | undefined): ShapeElement {
  const el = base(id, 'shape', x, y, w, h, rotation) as ShapeElement;
  el.shape = shape;
  el.fill = style.fill;
  el.stroke = style.stroke;
  el.radius = style.radius;
  el.text = text;
  return el;
}

function buildImage(id: string, x: number, y: number, w: number, h: number, rotation: number, src: string, crop: ImageElement['crop']): ImageElement {
  const el = base(id, 'image', x, y, w, h, rotation) as ImageElement;
  el.src = src;
  el.objectFit = crop ? 'cover' : 'fill';
  el.crop = crop;
  return el;
}

function buildConnector(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  kind: ConnectorElement['kind'],
  startArrow: ConnectorElement['startArrow'],
  endArrow: ConnectorElement['endArrow'],
  stroke: ConnectorElement['stroke'],
): ConnectorElement {
  const el = base(id, 'connector', x, y, clampDim(w), clampDim(h), rotation) as ConnectorElement;
  el.start = start;
  el.end = end;
  el.kind = kind;
  el.startArrow = startArrow;
  el.endArrow = endArrow;
  el.stroke = stroke;
  return el;
}

function buildChart(id: string, x: number, y: number, w: number, h: number, rotation: number, chartType: ChartType, categories: string[], series: ChartSeries[], title: string | undefined, legend: ChartElement['legend']): ChartElement {
  const el = base(id, 'chart', x, y, w, h, rotation) as ChartElement;
  el.chartType = chartType;
  el.categories = categories;
  el.series = series;
  el.title = title ? textFromPlain(title) : undefined;
  el.legend = legend;
  el.axis = { show: true };
  return el;
}

function buildTable(id: string, x: number, y: number, w: number, h: number, rotation: number, colWidths: number[], rowHeights: number[], cells: TableCell[][], headerRow: boolean): TableElement {
  const el = base(id, 'table', x, y, w, h, rotation) as TableElement;
  el.colWidths = colWidths;
  el.rowHeights = rowHeights;
  el.cells = cells;
  el.headerRow = headerRow;
  el.bandedRows = false;
  el.border = { color: '#CBD5E1', width: 1, style: 'solid' };
  return el;
}

function placeholderShape(id: string, x: number, y: number, w: number, h: number, note: string): ShapeElement {
  const el = base(id, 'shape', x, y, clampDim(w), clampDim(h), 0) as ShapeElement;
  el.shape = 'rect';
  el.fill = { type: 'solid', color: '#F1F5F9', opacity: 1 };
  el.stroke = { color: '#CBD5E1', width: 1, style: 'dashed' };
  el.text = textFromPlain(note);
  return el;
}

// ---------------------------------------------------------------------------
// Relationship / media resolution
// ---------------------------------------------------------------------------

function joinRelPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir + '/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

async function loadRels(zip: JSZip, path: string): Promise<Array<{ id: string; type: string; target: string }>> {
  const relsPath = path.replace(/^ppt\//, 'ppt/').replace(/slides\/slide(\d+)\.xml$/, 'slides/_rels/slide$1.xml.rels');
  const xml = await zip.file(relsPath)?.async('string');
  if (!xml) return [];
  const out: Array<{ id: string; type: string; target: string }> = [];
  const re = /<Relationship[^>]*Id="([^"]*)"[^>]*Type="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ id: m[1]!, type: m[2]!, target: m[3]! });
  }
  return out;
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    default: return 'image/png';
  }
}

// ---------------------------------------------------------------------------
// Chart parsing
// ---------------------------------------------------------------------------

function parseCachedVals(block: string): string[] {
  const vals: string[] = [];
  const re = /<c:pt[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>[\s\S]*?<\/c:pt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) vals.push(decodeXml(m[1]!));
  return vals;
}

function parseChartCategories(xml: string): string[] {
  const catBlock = xml.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0] ?? '';
  for (const tag of ['strCache', 'numCache', 'multiLvlStrCache', 'multiLvlNumCache']) {
    const cache = catBlock.match(new RegExp(`<c:${tag}>[\\s\\S]*?<\\/c:${tag}>`))?.[0];
    if (cache) return parseCachedVals(cache);
  }
  return [];
}

function parseChartSeries(xml: string): ChartSeries[] {
  const series: ChartSeries[] = [];
  const serRe = /<c:ser>[\s\S]*?<\/c:ser>/g;
  let m: RegExpExecArray | null;
  while ((m = serRe.exec(xml))) {
    const ser = m[0]!;
    const tx = ser.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0] ?? '';
    const name = decodeXml(firstMatch(tx, /<c:v>([\s\S]*?)<\/c:v>/) ?? '');
    const numCache = ser.match(/<c:numCache>[\s\S]*?<\/c:numCache>/)?.[0];
    const values: Array<number | null> = [];
    if (numCache) {
      const rawVals = parseCachedVals(numCache);
      for (const raw of rawVals) {
        if (/^\s*$/.test(raw)) values.push(null);
        else {
          const n = Number(raw);
          values.push(Number.isFinite(n) ? n : null);
        }
      }
    }
    const color = firstMatch(ser, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
    series.push({ name, data: values, color: color ? `#${color.toUpperCase()}` : undefined });
  }
  return series;
}

function parseChartTitle(xml: string): string | undefined {
  const titleBlock = xml.match(/<c:title>[\s\S]*?<\/c:title>/)?.[0];
  if (!titleBlock) return undefined;
  const texts: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(titleBlock))) texts.push(decodeXml(m[1]!));
  const joined = texts.join('');
  return joined.trim().length > 0 ? joined : undefined;
}

function parseChart(xml: string): { chartType: ChartType; categories: string[]; series: ChartSeries[]; title?: string; legend: ChartElement['legend'] } | null {
  let chartType: ChartType = 'column';
  if (/<c:barChart/.test(xml)) {
    chartType = firstMatch(xml, /<c:barDir val="([^"]*)"/) === 'bar' ? 'bar' : 'column';
  } else if (/<c:lineChart/.test(xml)) chartType = 'line';
  else if (/<c:pieChart/.test(xml)) chartType = 'pie';
  else if (/<c:doughnutChart/.test(xml)) chartType = 'doughnut';
  else if (/<c:areaChart/.test(xml)) chartType = 'area';
  else if (/<c:radarChart/.test(xml)) chartType = 'radar';
  else if (/<c:scatterChart/.test(xml)) chartType = 'scatter';
  else if (/<c:bubbleChart/.test(xml)) chartType = 'scatter';

  const categories = parseChartCategories(xml);
  const series = parseChartSeries(xml);
  if (series.length === 0) return null;
  const title = parseChartTitle(xml);
  const legendShow = /<c:legend>/.test(xml);
  const legendPos = firstMatch(xml, /<c:legendPos val="([^"]*)"/);
  return {
    chartType,
    categories,
    series,
    title,
    legend: { show: legendShow, position: (['t', 'b', 'l', 'r'].includes(legendPos ?? '') ? (legendPos as 'top' | 'bottom' | 'left' | 'right') : 'bottom') },
  };
}

// ---------------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------------

function parseTable(tblXml: string, scale: number): { colWidths: number[]; rowHeights: number[]; cells: TableCell[][]; headerRow: boolean } | null {
  const grid = tblXml.match(/<a:tblGrid>([\s\S]*?)<\/a:tblGrid>/)?.[1] ?? '';
  const colWidths: number[] = [];
  const colRe = /<a:gridCol[^>]*?w="([0-9]+)"/g;
  let cm: RegExpExecArray | null;
  while ((cm = colRe.exec(grid))) colWidths.push((intAttr(cm[1]) / EMU_PER_PT) * scale);

  const headerRow = /<a:tblPr[^>]*firstRow="1"/.test(tblXml);
  const rows: TableCell[][] = [];
  const rowHeights: number[] = [];
  const trRe = /<a:tr(\s[^>]*)?>([\s\S]*?)<\/a:tr>/g;
  let tm: RegExpExecArray | null;
  while ((tm = trRe.exec(tblXml))) {
    const attrs = tm[1] ?? '';
    const trBody = tm[2]!;
    const h = firstMatch(attrs, /\sh="([0-9]+)"/);
    rowHeights.push(h ? (intAttr(h) / EMU_PER_PT) * scale : 36);
    const cells: TableCell[] = [];
    const tcRe = /<a:tc(\s[^>]*)?>([\s\S]*?)<\/a:tc>/g;
    let tc: RegExpExecArray | null;
    while ((tc = tcRe.exec(trBody))) {
      const tcBody = tc[2]!;
      const txContent = txBodyContent(tcBody);
      const parsed = txContent ? parseTxBodyContent(txContent) : { text: { paragraphs: [{ runs: [{ text: '' }] }] }, hasText: false };
      const fill = firstMatch(tcBody, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
      cells.push({ text: parsed.text, fill: fill ? `#${fill.toUpperCase()}` : undefined });
    }
    rows.push(cells);
  }
  if (rows.length === 0 || colWidths.length === 0) return null;
  return { colWidths, rowHeights, cells: rows, headerRow };
}

// ---------------------------------------------------------------------------
// Shape / element dispatch
// ---------------------------------------------------------------------------

function parseSp(sp: string, ctx: Ctx, offsetX: number, offsetY: number): SlideElement | null {
  const spPr = sp.match(/<p:spPr>[\s\S]*?<\/p:spPr>/)?.[0] ?? '';
  const xfrm = parseXfrm(spPr);
  const x = (xfrm.x / EMU_PER_PT) * ctx.scale + (offsetX / EMU_PER_PT) * ctx.scale;
  const y = (xfrm.y / EMU_PER_PT) * ctx.scale + (offsetY / EMU_PER_PT) * ctx.scale;
  const w = (xfrm.w / EMU_PER_PT) * ctx.scale;
  const h = (xfrm.h / EMU_PER_PT) * ctx.scale;

  const prst = firstMatch(spPr, /<a:prstGeom prst="([^"]*)"/) ?? 'rect';
  const parsed = parseTxBody(sp);
  const style = parseShapeStyle(spPr, ctx.scale, xfrm);
  const id = nextId(ctx.slideIndex);

  if (prst.startsWith('actionButton')) {
    ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: prst, status: 'approximation', message: `动作按钮形状 ${prst} 已近似为矩形` });
    return buildShape(id, 'rect', x, y, w, h, xfrm.rotation, style, parsed.hasText ? parsed.text : undefined);
  }

  const kind = shapeKindFromPrst(prst);
  if (kind === null) {
    ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: prst, status: 'unsupported', message: `无法识别的形状类型 ${prst}，已替换为占位矩形` });
    return placeholderShape(id, x, y, w, h, `⚠ 无法识别的形状: ${prst}`);
  }

  if (kind === 'rect' && parsed.hasText) {
    return buildText(id, x, y, w, h, xfrm.rotation, parsed);
  }
  return buildShape(id, kind, x, y, w, h, xfrm.rotation, style, parsed.hasText ? parsed.text : undefined);
}

async function parsePic(pic: string, ctx: Ctx, rels: Array<{ id: string; type: string; target: string }>, offsetX: number, offsetY: number): Promise<SlideElement | null> {
  const spPr = pic.match(/<p:spPr>[\s\S]*?<\/p:spPr>/)?.[0] ?? '';
  const xfrm = parseXfrm(spPr);
  const x = (xfrm.x / EMU_PER_PT) * ctx.scale + (offsetX / EMU_PER_PT) * ctx.scale;
  const y = (xfrm.y / EMU_PER_PT) * ctx.scale + (offsetY / EMU_PER_PT) * ctx.scale;
  const w = (xfrm.w / EMU_PER_PT) * ctx.scale;
  const h = (xfrm.h / EMU_PER_PT) * ctx.scale;

  const embed = firstMatch(pic, /<a:blip[^>]*r:embed="([^"]*)"/) ?? firstMatch(pic, /<a:blip[^>]*r:link="([^"]*)"/);
  const rel = rels.find((r) => r.id === embed);
  if (!rel) {
    ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: 'pic', status: 'unsupported', message: '图片缺少关系引用，已替换为占位矩形' });
    return placeholderShape(nextId(ctx.slideIndex), x, y, w, h, '⚠ 图片关系缺失');
  }

  const fullPath = joinRelPath('ppt/slides', rel.target);
  const data = await ctx.zip.file(fullPath)?.async('base64');
  const ext = (rel.target.split('.').pop() ?? 'png').toLowerCase();
  const src = data !== undefined ? `data:${mimeForExt(ext)};base64,${data}` : '';

  let crop: ImageElement['crop'] | undefined;
  const srcRect = firstMatch(pic, /<a:srcRect[^>]*l="([0-9]+)"[^>]*t="([0-9]+)"[^>]*r="([0-9]+)"[^>]*b="([0-9]+)"/);
  if (srcRect) {
    const l = firstMatch(pic, /<a:srcRect[^>]*l="([0-9]+)"/);
    const t = firstMatch(pic, /<a:srcRect[^>]*t="([0-9]+)"/);
    const r = firstMatch(pic, /<a:srcRect[^>]*r="([0-9]+)"/);
    const b = firstMatch(pic, /<a:srcRect[^>]*b="([0-9]+)"/);
    if (l && t && r && b) {
      crop = {
        x: intAttr(l) / 100000,
        y: intAttr(t) / 100000,
        w: Math.max(0, 1 - intAttr(l) / 100000 - intAttr(r) / 100000),
        h: Math.max(0, 1 - intAttr(t) / 100000 - intAttr(b) / 100000),
      };
    }
  }

  ctx.images += 1;
  return buildImage(nextId(ctx.slideIndex), x, y, w, h, xfrm.rotation, src, crop);
}

function parseCxnSp(cxn: string, ctx: Ctx, offsetX: number, offsetY: number): SlideElement {
  const spPr = cxn.match(/<p:spPr>[\s\S]*?<\/p:spPr>/)?.[0] ?? '';
  const xfrm = parseXfrm(spPr);
  const x = (xfrm.x / EMU_PER_PT) * ctx.scale + (offsetX / EMU_PER_PT) * ctx.scale;
  const y = (xfrm.y / EMU_PER_PT) * ctx.scale + (offsetY / EMU_PER_PT) * ctx.scale;
  const w = (xfrm.w / EMU_PER_PT) * ctx.scale;
  const h = (xfrm.h / EMU_PER_PT) * ctx.scale;

  const startX = xfrm.flipH ? x + w : x;
  const endX = xfrm.flipH ? x : x + w;
  const startY = xfrm.flipV ? y + h : y;
  const endY = xfrm.flipV ? y : y + h;

  const prst = firstMatch(spPr, /<a:prstGeom prst="([^"]*)"/);
  const kind: ConnectorElement['kind'] =
    prst === 'straightConnector' || prst === 'line' ? 'straight' : prst === 'bentConnector' ? 'elbow' : 'curve';

  const ln = spPr.match(/<a:ln(?:\s[^>]*)?>([\s\S]*?)<\/a:ln>/)?.[0] ?? '';
  const headEnd = firstMatch(ln, /<a:headEnd type="([^"]*)"/) ?? 'none';
  const tailEnd = firstMatch(ln, /<a:tailEnd type="([^"]*)"/) ?? 'none';
  const startArrow = mapArrow(headEnd);
  const endArrow = mapArrow(tailEnd);

  const lnW = firstMatch(ln, /\sw="([0-9]+)"/);
  const lnColor = firstMatch(ln, /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/);
  const dash = firstMatch(ln, /<a:prstDash val="([^"]*)"/);
  const stroke: ConnectorElement['stroke'] = {
    color: lnColor ? `#${lnColor.toUpperCase()}` : '#94A3B8',
    width: lnW ? intAttr(lnW) / EMU_PER_PT : 1.5,
    style: dash === 'dash' || dash === 'sysDash' ? 'dashed' : dash === 'dot' || dash === 'sysDot' ? 'dotted' : 'solid',
  };

  ctx.connectors += 1;
  const bboxW = Math.abs(endX - startX);
  const bboxH = Math.abs(endY - startY);
  return buildConnector(
    nextId(ctx.slideIndex),
    Math.min(startX, endX),
    Math.min(startY, endY),
    bboxW,
    bboxH,
    0,
    { x: startX, y: startY },
    { x: endX, y: endY },
    kind,
    startArrow,
    endArrow,
    stroke,
  );
}

function mapArrow(type: string): ConnectorElement['startArrow'] {
  switch (type) {
    case 'triangle':
    case 'stealth':
    case 'arrow': return 'arrow';
    case 'oval': return 'dot';
    case 'diamond': return 'diamond';
    default: return 'none';
  }
}

async function parseGraphicFrame(frame: string, ctx: Ctx, rels: Array<{ id: string; type: string; target: string }>, offsetX: number, offsetY: number): Promise<SlideElement | null> {
  const xfrmXml = frame.match(/<p:xfrm>[\s\S]*?<\/p:xfrm>/)?.[0] ?? '';
  const xfrm = parseXfrm(xfrmXml);
  const x = (xfrm.x / EMU_PER_PT) * ctx.scale + (offsetX / EMU_PER_PT) * ctx.scale;
  const y = (xfrm.y / EMU_PER_PT) * ctx.scale + (offsetY / EMU_PER_PT) * ctx.scale;
  const w = (xfrm.w / EMU_PER_PT) * ctx.scale;
  const h = (xfrm.h / EMU_PER_PT) * ctx.scale;
  const id = nextId(ctx.slideIndex);

  const tblXml = frame.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)?.[0];
  if (tblXml) {
    const tbl = parseTable(tblXml, ctx.scale);
    if (tbl) {
      ctx.tables += 1;
      return buildTable(id, x, y, w, h, xfrm.rotation, tbl.colWidths, tbl.rowHeights, tbl.cells, tbl.headerRow);
    }
  }

  const chartRef = firstMatch(frame, /<c:chart r:id="([^"]*)"/);
  if (chartRef) {
    const rel = rels.find((r) => r.id === chartRef && r.type.includes('chart'));
    if (rel) {
      const fullPath = joinRelPath('ppt/slides', rel.target);
      const chartXml = await ctx.zip.file(fullPath)?.async('string');
      if (chartXml) {
        const chart = parseChart(chartXml);
        if (chart) {
          ctx.charts += 1;
          return buildChart(id, x, y, w, h, xfrm.rotation, chart.chartType, chart.categories, chart.series, chart.title, chart.legend);
        }
      }
    }
    ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: 'chart', status: 'preview', message: '图表解析失败，已替换为预览占位' });
    return placeholderShape(id, x, y, w, h, '⚠ 图表预览占位');
  }

  const graphicUri = firstMatch(frame, /<a:graphicData[^>]*uri="([^"]*)"/);
  if ((graphicUri && graphicUri.includes('diagram')) || /<dgm:relIds/.test(frame)) {
    // SmartArt → preview text element
    const texts: string[] = [];
    const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(frame))) texts.push(decodeXml(m[1]!));
    const joined = texts.join('\n');
    ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: 'SmartArt', status: 'preview', message: 'SmartArt 已高保真显示；点击 Convert to editable diagram 可转换' });
    const el = base(id, 'text', x, y, w, h, 0) as TextElement;
    el.text = joined.trim().length > 0 ? textFromPlain(joined) : textFromPlain('SmartArt');
    el.style = { align: 'center' };
    el.verticalAlign = 'middle';
    return el;
  }

  ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: 'graphicFrame', status: 'unsupported', message: '无法解析的 graphicFrame 内容，已替换为占位矩形' });
  return placeholderShape(id, x, y, w, h, '⚠ 无法解析的内容');
}

async function processShapes(
  xml: string,
  ctx: Ctx,
  rels: Array<{ id: string; type: string; target: string }>,
  offsetX = 0,
  offsetY = 0,
): Promise<SlideElement[]> {
  const out: SlideElement[] = [];
  const elements = extractTagged(xml, ['p:sp', 'p:pic', 'p:cxnSp', 'p:graphicFrame', 'p:grpSp']);
  for (const el of elements) {
    if (el.name === 'p:sp') {
      const parsed = parseSp(`<p:sp ${el.attrs}>${el.body}</p:sp>`, ctx, offsetX, offsetY);
      if (parsed) out.push(parsed);
    } else if (el.name === 'p:pic') {
      const parsed = await parsePic(`<p:pic ${el.attrs}>${el.body}</p:pic>`, ctx, rels, offsetX, offsetY);
      if (parsed) out.push(parsed);
    } else if (el.name === 'p:cxnSp') {
      out.push(parseCxnSp(`<p:cxnSp ${el.attrs}>${el.body}</p:cxnSp>`, ctx, offsetX, offsetY));
    } else if (el.name === 'p:graphicFrame') {
      const parsed = await parseGraphicFrame(`<p:graphicFrame ${el.attrs}>${el.body}</p:graphicFrame>`, ctx, rels, offsetX, offsetY);
      if (parsed) out.push(parsed);
    } else if (el.name === 'p:grpSp') {
      ctx.warnings.push({ slideIndex: ctx.slideIndex, elementHint: 'grpSp', status: 'approximation', message: '组合形状已展开为独立元素' });
      const grpPr = el.body.match(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>/)?.[0] ?? '';
      const chOff = grpPr.match(/<a:chOff x="([0-9-]+)" y="([0-9-]+)"/);
      const gox = chOff ? intAttr(chOff[1]) : 0;
      const goy = chOff ? intAttr(chOff[2]) : 0;
      const children = await processShapes(el.body, ctx, rels, offsetX + gox, offsetY + goy);
      out.push(...children);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Theme / StyleDna
// ---------------------------------------------------------------------------

function parseThemeColors(themeXml: string): string[] {
  const scheme = themeXml.match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/)?.[1] ?? themeXml;
  const colors: string[] = [];
  const re = /<a:srgbClr val="([0-9A-Fa-f]{6})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scheme))) colors.push(`#${m[1]!.toUpperCase()}`);
  const sysRe = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/g;
  while ((m = sysRe.exec(scheme))) colors.push(`#${m[1]!.toUpperCase()}`);
  return colors;
}

function parseThemeFonts(themeXml: string): { heading: string; body: string } {
  const major = firstMatch(themeXml, /<a:majorFont>[\s\S]*?<a:latin typeface="([^"]*)"/);
  const minor = firstMatch(themeXml, /<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"/);
  return { heading: major ?? 'Calibri', body: minor ?? 'Calibri' };
}

function buildStyleDna(colors: string[], fonts: { heading: string; body: string }): StyleDna {
  return {
    name: '导入主题',
    palette: {
      primary: colors[0] ?? '#1E56A0',
      secondary: colors[1] ?? '#3B82C4',
      accent: colors[2] ?? '#E8A33D',
      neutrals: [colors[3] ?? '#F5F7FA', '#E8EDF3', '#CBD5E1', '#94A3B8'],
    },
    fonts: { heading: fonts.heading, body: fonts.body },
    radius: 8,
    borderWidth: 1,
    spacing: 24,
  };
}

// ---------------------------------------------------------------------------
// SmartArt conversion helper
// ---------------------------------------------------------------------------

export function convertSmartArtToDiagram(slide: Slide, elementId: string): DiagramElement | null {
  const el = slide.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const plain =
    el.type === 'text' ? textToPlain(el.text) : el.type === 'shape' ? textToPlain(el.text) : '';
  const lines = plain.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const nodes = lines.map((label, i) => ({
    id: `smart_n${i}`,
    label,
    shape: 'rect' as ShapeKind,
    level: i === 0 ? 0 : 1,
    fill: '#E8F0FA',
    stroke: '#1E56A0',
  }));
  const edges = lines.slice(1).map((_, i) => ({
    id: `smart_e${i}`,
    from: nodes[0]!.id,
    to: nodes[i + 1]!.id,
    arrow: true,
  }));

  return createDiagram('hierarchy', 'vertical', nodes, edges, el.x, el.y, el.w, el.h, {
    id: `smart_diagram_${elementId}`,
    childIds: nodes.map((n) => n.id),
  });
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------

function sortNumeric(names: string[]): string[] {
  return names.sort((a, b) => {
    const na = Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0);
    const nb = Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);
    return na - nb;
  });
}

export async function importPptx(data: ArrayBuffer | Uint8Array, opts: ImportOptions = {}): Promise<{ deck: Deck; report: ImportReport }> {
  resetIds();
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files);

  // 1. Slide size / scale
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
  const cx = firstMatch(presentationXml ?? '', /<p:sldSz[^>]*cx="([0-9]+)"/);
  const cy = firstMatch(presentationXml ?? '', /<p:sldSz[^>]*cy="([0-9]+)"/);
  const sourceWEmu = cx ? intAttr(cx) : 12192000;
  const sourceHEmu = cy ? intAttr(cy) : 6858000;
  const sourceWPt = sourceWEmu / EMU_PER_PT;
  const scale = SLIDE_W / sourceWPt;

  const warnings: ImportWarning[] = [];
  if (Math.abs(sourceWPt - SLIDE_W) > 1) {
    warnings.push({
      slideIndex: -1,
      elementHint: 'sldSz',
      status: 'approximation',
      message: `源演示文稿尺寸 ${Math.round(sourceWPt)}×${Math.round(sourceHEmu / EMU_PER_PT)}pt 非标准 16:9，已按比例映射到 ${SLIDE_W}pt 宽画布`,
    });
  }

  const themeXml = await zip.file('ppt/theme/theme1.xml')?.async('string');
  const themeColors = parseThemeColors(themeXml ?? '');
  const themeFonts = parseThemeFonts(themeXml ?? '');
  const styleDna = buildStyleDna(themeColors, themeFonts);

  const slides: Slide[] = [];
  const slideFileNames = sortNumeric(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)));

  const ctx: Ctx = {
    zip,
    scale,
    slideIndex: 0,
    warnings,
    images: 0,
    tables: 0,
    charts: 0,
    connectors: 0,
  };

  for (let i = 0; i < slideFileNames.length; i++) {
    ctx.slideIndex = i;
    const slideXml = await zip.file(slideFileNames[i]!)!.async('string');
    const rels = await loadRels(zip, slideFileNames[i]!);
    const elements = await processShapes(slideXml, ctx, rels);

    // notes
    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`)?.async('string');
    let notes: string | undefined;
    if (notesXml) {
      const texts: string[] = [];
      const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(notesXml))) texts.push(decodeXml(m[1]!));
      notes = texts.join('').trim() || undefined;
    }

    const slide = createSlide({
      id: `imp_slide_${i}`,
      purpose: i === 0 ? 'cover' : 'content',
      elements,
      notes,
    });
    slides.push(slide);
  }

  const deck = createDeck({
    title: opts.title ?? '导入的演示文稿',
    slides,
    themeId: opts.themeId ?? 'jkinco-blue',
  });
  deck.id = 'imp_deck';
  deck.styleDna = styleDna;
  deck.meta = { ...deck.meta, createdAt: FIXED_TIME, updatedAt: FIXED_TIME };

  const report: ImportReport = {
    slideCount: slides.length,
    elementCount: slides.reduce((n, s) => n + s.elements.length, 0),
    images: ctx.images,
    tables: ctx.tables,
    charts: ctx.charts,
    connectors: ctx.connectors,
    warnings,
  };

  return { deck, report };
}
