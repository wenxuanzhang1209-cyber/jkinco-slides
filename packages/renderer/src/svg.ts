import { SLIDE_H, SLIDE_W } from '@jkinco/scene-schema';
import { textToPlain } from '@jkinco/scene-schema';
import type {
  ChartElement,
  ConnectorElement,
  FillStyle,
  ImageElement,
  MediaElement,
  RichText,
  Run,
  ShapeElement,
  Slide,
  SlideElement,
  StrokeStyle,
  TableElement,
  TextAlign,
  TextElement,
  TextStyle,
  Theme,
  VerticalAlign,
} from '@jkinco/scene-schema';

/** Escape XML-special characters in text content and attribute values. */
export function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a number deterministically (no floating point noise). */
function f(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface RenderContext {
  theme: Theme;
  defs: string[];
  markers: Map<string, string>;
  clipCounter: number;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function slideToSvg(slide: Slide, theme: Theme): string {
  const defs: string[] = [];
  const markers = new Map<string, string>();
  const ctx: RenderContext = { theme, defs, markers, clipCounter: 0 };

  const background = renderBackground(slide.background, theme, defs);

  // Root content clip: nothing may overflow the 960×540 slide.
  defs.push(`<clipPath id="slide-clip"><rect x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}"/></clipPath>`);

  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex);
  const body: string[] = [];
  for (const el of sorted) {
    if (el.hidden) continue;
    body.push(renderElement(el, ctx));
  }

  const defsMarkup = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}" width="${SLIDE_W}" height="${SLIDE_H}">`,
    defsMarkup,
    background,
    `<g clip-path="url(#slide-clip)">`,
    body.join(''),
    `</g>`,
    `</svg>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Common wrapping
// ---------------------------------------------------------------------------

interface Boxed {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
}

function withCommon(el: Boxed, inner: string): string {
  const attrs: string[] = [];
  if (el.opacity !== 1) attrs.push(`opacity="${f(el.opacity)}"`);
  if (el.rotation !== 0) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    attrs.push(`transform="rotate(${f(el.rotation)} ${f(cx)} ${f(cy)})"`);
  }
  if (attrs.length === 0) return inner;
  return `<g ${attrs.join(' ')}>${inner}</g>`;
}

function renderElement(el: SlideElement, ctx: RenderContext): string {
  switch (el.type) {
    case 'text':
      return renderText(el, ctx);
    case 'shape':
      return renderShape(el, ctx);
    case 'image':
      return renderImage(el, ctx);
    case 'connector':
      return renderConnector(el, ctx);
    case 'chart':
      return renderChart(el, ctx);
    case 'table':
      return renderTable(el, ctx);
    case 'diagram':
    case 'group':
      return '';
    case 'media':
      return renderMedia(el, ctx);
  }
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function mapTextAnchor(align: TextAlign): string {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function renderRun(run: Run): string {
  const attrs: string[] = [];
  if (run.bold) attrs.push('font-weight="bold"');
  if (run.italic) attrs.push('font-style="italic"');
  if (run.underline) attrs.push('text-decoration="underline"');
  else if (run.strike) attrs.push('text-decoration="line-through"');
  if (run.color) attrs.push(`fill="${escapeXml(run.color)}"`);
  if (run.fontSize) attrs.push(`font-size="${f(run.fontSize)}"`);
  if (run.fontFamily) attrs.push(`font-family="${escapeXml(run.fontFamily)}"`);
  const text = escapeXml(run.text);
  return attrs.length > 0 ? `<tspan ${attrs.join(' ')}>${text}</tspan>` : text;
}

function renderTextBlock(
  text: RichText,
  style: TextStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  verticalAlign: VerticalAlign | undefined,
  center: boolean,
  theme: Theme,
): string {
  const fontSize = style.fontSize ?? 18;
  const lineSpacing = style.lineSpacing ?? 1.2;
  const lineDy = fontSize * lineSpacing;
  const anchor = center ? 'middle' : mapTextAnchor(style.align ?? 'left');
  const textX = center ? x + w / 2 : x;
  const color = style.color ?? theme.colors.text;
  const fontFamily = style.fontFamily ?? theme.fonts.body;

  const paragraphs = text.paragraphs;
  const count = paragraphs.length;
  const lineHeight = fontSize * 1.4;
  const totalHeight = (count - 1) * lineDy + lineHeight;

  let baseline = y + fontSize;
  if (verticalAlign === 'middle') baseline = y + (h - totalHeight) / 2 + fontSize;
  else if (verticalAlign === 'bottom') baseline = y + h - totalHeight + fontSize;

  const attrs = [
    `x="${f(textX)}"`,
    `y="${f(baseline)}"`,
    `font-size="${f(fontSize)}"`,
    `fill="${escapeXml(color)}"`,
    `font-family="${escapeXml(fontFamily)}"`,
    `text-anchor="${anchor}"`,
  ];
  if (style.bold) attrs.push('font-weight="bold"');
  if (style.italic) attrs.push('font-style="italic"');
  if (style.underline) attrs.push('text-decoration="underline"');
  if (style.letterSpacing) attrs.push(`letter-spacing="${f(style.letterSpacing)}"`);

  const out = [`<text ${attrs.join(' ')}>`];
  paragraphs.forEach((p, i) => {
    const dy = i === 0 ? 0 : lineDy;
    out.push(`<tspan x="${f(textX)}" dy="${f(dy)}">`);
    for (const run of p.runs) out.push(renderRun(run));
    out.push('</tspan>');
  });
  out.push('</text>');
  return out.join('');
}

function renderText(el: TextElement, ctx: RenderContext): string {
  const inner = renderTextBlock(el.text, el.style, el.x, el.y, el.w, el.h, el.verticalAlign, false, ctx.theme);
  return withCommon(el, inner);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

function fillAttrs(fill: FillStyle): string {
  if (fill.type === 'none' || !fill.color) return 'fill="none"';
  return `fill="${escapeXml(fill.color)}" fill-opacity="${f(fill.opacity ?? 1)}"`;
}

function strokeAttrs(stroke: StrokeStyle): string {
  let out = `stroke="${escapeXml(stroke.color)}" stroke-width="${f(stroke.width)}"`;
  if (stroke.style === 'dashed') out += ' stroke-dasharray="8 6"';
  else if (stroke.style === 'dotted') out += ' stroke-dasharray="2 4"';
  return out;
}

function pts(points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
}

function regularPolygon(x: number, y: number, w: number, h: number, n: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts(points);
}

function starPoints(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    points.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]);
  }
  return pts(points);
}

function shapeGeometry(el: ShapeElement): string {
  const { x, y, w, h } = el;
  const fill = fillAttrs(el.fill);
  const stroke = strokeAttrs(el.stroke);
  const both = `${fill} ${stroke}`;

  switch (el.shape) {
    case 'rect':
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(el.radius ?? 0)}" ${both}/>`;
    case 'roundRect':
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(el.radius ?? 8)}" ${both}/>`;
    case 'pill':
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" ${both}/>`;
    case 'ellipse':
      return `<ellipse cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${both}/>`;
    case 'line':
      return `<line x1="${f(x)}" y1="${f(y + h / 2)}" x2="${f(x + w)}" y2="${f(y + h / 2)}" ${stroke}/>`;
    case 'triangle':
      return `<polygon points="${pts([[x + w / 2, y], [x + w, y + h], [x, y + h]])}" ${both}/>`;
    case 'rightTriangle':
      return `<polygon points="${pts([[x, y], [x + w, y], [x, y + h]])}" ${both}/>`;
    case 'diamond':
      return `<polygon points="${pts([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]])}" ${both}/>`;
    case 'pentagon':
      return `<polygon points="${regularPolygon(x, y, w, h, 5)}" ${both}/>`;
    case 'hexagon':
      return `<polygon points="${regularPolygon(x, y, w, h, 6)}" ${both}/>`;
    case 'chevron':
      return `<polygon points="${pts([[x, y], [x + w * 0.7, y], [x + w, y + h / 2], [x + w * 0.7, y + h], [x, y + h]])}" ${both}/>`;
    case 'arrowRight':
      return `<polygon points="${pts([[x, y + h * 0.3], [x + w * 0.6, y + h * 0.3], [x + w * 0.6, y], [x + w, y + h / 2], [x + w * 0.6, y + h]])}" ${both}/>`;
    case 'arrowLeft':
      return `<polygon points="${pts([[x + w, y + h * 0.3], [x + w * 0.4, y + h * 0.3], [x + w * 0.4, y], [x, y + h / 2], [x + w * 0.4, y + h]])}" ${both}/>`;
    case 'arrowUp':
      return `<polygon points="${pts([[x + w * 0.3, y + h], [x + w * 0.3, y + h * 0.4], [x, y + h * 0.4], [x + w / 2, y], [x + w, y + h * 0.4]])}" ${both}/>`;
    case 'arrowDown':
      return `<polygon points="${pts([[x + w * 0.3, y], [x + w * 0.3, y + h * 0.6], [x, y + h * 0.6], [x + w / 2, y + h], [x + w, y + h * 0.6]])}" ${both}/>`;
    case 'star':
      return `<polygon points="${starPoints(x, y, w, h)}" ${both}/>`;
    case 'parallelogram':
      return `<polygon points="${pts([[x + w * 0.25, y], [x + w, y], [x + w * 0.75, y + h], [x, y + h]])}" ${both}/>`;
    case 'trapezoid':
      return `<polygon points="${pts([[x + w * 0.2, y], [x + w * 0.8, y], [x + w, y + h], [x, y + h]])}" ${both}/>`;
  }
}

function renderShape(el: ShapeElement, ctx: RenderContext): string {
  const parts = [shapeGeometry(el)];
  if (el.text) {
    parts.push(renderTextBlock(el.text, el.textStyle ?? {}, el.x, el.y, el.w, el.h, 'middle', true, ctx.theme));
  }
  return withCommon(el, parts.join(''));
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function renderImage(el: ImageElement, ctx: RenderContext): string {
  const preserve = el.objectFit === 'cover' ? 'xMidYMid slice' : el.objectFit === 'contain' ? 'xMidYMid meet' : 'none';

  let clipAttr = '';
  if (el.radius || el.crop) {
    const id = `img-clip-${ctx.clipCounter++}`;
    let cx = el.x;
    let cy = el.y;
    let cw = el.w;
    let ch = el.h;
    let cr = el.radius ?? 0;
    if (el.crop) {
      cx = el.x + el.crop.x * el.w;
      cy = el.y + el.crop.y * el.h;
      cw = el.crop.w * el.w;
      ch = el.crop.h * el.h;
    }
    ctx.defs.push(`<clipPath id="${id}"><rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch)}" rx="${f(cr)}"/></clipPath>`);
    clipAttr = ` clip-path="url(#${id})"`;
  }

  const inner = `<image href="${escapeXml(el.src)}" x="${f(el.x)}" y="${f(el.y)}" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="${preserve}"${clipAttr}/>`;
  return withCommon(el, inner);
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

function connectorPath(el: ConnectorElement): string {
  const { x: x1, y: y1 } = el.start;
  const { x: x2, y: y2 } = el.end;

  if (el.kind === 'straight') {
    return `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;
  }
  if (el.kind === 'curve') {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const off = 20;
    const cx = mx + (-dy / len) * off;
    const cy = my + (dx / len) * off;
    return `M ${f(x1)} ${f(y1)} Q ${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
  }
  const midX = (x1 + x2) / 2;
  return `M ${f(x1)} ${f(y1)} L ${f(midX)} ${f(y1)} L ${f(midX)} ${f(y2)} L ${f(x2)} ${f(y2)}`;
}

function ensureMarker(ctx: RenderContext, type: 'arrow' | 'dot' | 'diamond', color: string): string {
  const key = `${type}|${color}`;
  const existing = ctx.markers.get(key);
  if (existing) return existing;

  const id = `marker-${type}-${ctx.markers.size}`;
  ctx.markers.set(key, id);

  if (type === 'arrow') {
    ctx.defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${escapeXml(color)}"/></marker>`);
  } else if (type === 'dot') {
    ctx.defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="4" fill="${escapeXml(color)}"/></marker>`);
  } else {
    ctx.defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7"><path d="M5,0 L10,5 L5,10 L0,5 z" fill="${escapeXml(color)}"/></marker>`);
  }
  return id;
}

function renderConnector(el: ConnectorElement, ctx: RenderContext): string {
  const d = connectorPath(el);
  const stroke = strokeAttrs(el.stroke);
  let startAttr = '';
  let endAttr = '';
  if (el.startArrow !== 'none') startAttr = ` marker-start="url(#${ensureMarker(ctx, el.startArrow, el.stroke.color)})"`;
  if (el.endArrow !== 'none') endAttr = ` marker-end="url(#${ensureMarker(ctx, el.endArrow, el.stroke.color)})"`;
  return withCommon(el, `<path d="${d}" fill="none" ${stroke}${startAttr}${endAttr}/>`);
}

// ---------------------------------------------------------------------------
// Charts (simple deterministic SVG, no echarts)
// ---------------------------------------------------------------------------

function chartColor(el: ChartElement, i: number, theme: Theme): string {
  const palette = theme.chart.palette;
  return el.series[i]?.color ?? palette[i % palette.length] ?? '#1E56A0';
}

function axisLine(x1: number, y1: number, x2: number, y2: number, color: string): string {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${escapeXml(color)}" stroke-width="1"/>`;
}

function chartBars(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const px = x + padL;
  const py = y + padT;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  const values = el.series.flatMap((s) => s.data).filter(isNum);
  const maxVal = Math.max(0, ...values, 1);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;
  const yOf = (v: number): number => py + ((maxVal - v) / range) * ph;
  const y0 = yOf(0);

  const out: string[] = [];
  out.push(axisLine(px, y0, px + pw, y0, theme.colors.border));
  out.push(axisLine(px, py, px, py + ph, theme.colors.border));

  const n = el.categories.length || 1;
  const catW = pw / n;
  const groupW = catW * 0.7;
  const barW = groupW / Math.max(el.series.length, 1);

  el.series.forEach((s, si) => {
    const color = chartColor(el, si, theme);
    s.data.forEach((v, i) => {
      if (!isNum(v)) return;
      const top = Math.min(yOf(v), y0);
      const height = Math.abs(yOf(v) - y0);
      const bx = px + i * catW + (catW - groupW) / 2 + si * barW;
      out.push(`<rect x="${f(bx)}" y="${f(top)}" width="${f(barW)}" height="${f(height)}" fill="${escapeXml(color)}" fill-opacity="0.9"/>`);
    });
  });

  el.categories.forEach((cat, i) => {
    out.push(`<text x="${f(px + i * catW + catW / 2)}" y="${f(py + ph + 14)}" font-size="10" fill="${escapeXml(theme.chart.textColor)}" text-anchor="middle">${escapeXml(cat)}</text>`);
  });

  return out.join('');
}

function lineSegments(
  values: Array<number | null>,
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  values.forEach((v, i) => {
    if (isNum(v)) current.push([xOf(i), yOf(v)]);
    else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function chartLines(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const px = x + padL;
  const py = y + padT;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  const values = el.series.flatMap((s) => s.data).filter(isNum);
  const maxVal = Math.max(0, ...values, 1);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;
  const yOf = (v: number): number => py + ((maxVal - v) / range) * ph;
  const n = el.categories.length || 1;
  const catW = pw / n;
  const xOf = (i: number): number => px + i * catW + catW / 2;
  const y0 = yOf(0);

  const out: string[] = [];
  out.push(axisLine(px, y0, px + pw, y0, theme.colors.border));
  out.push(axisLine(px, py, px, py + ph, theme.colors.border));

  el.series.forEach((s, si) => {
    const color = chartColor(el, si, theme);
    const segments = lineSegments(s.data, xOf, yOf);
    for (const segment of segments) {
      const pointsStr = segment.map(([a, b]) => `${f(a)},${f(b)}`).join(' ');
      out.push(`<polyline points="${pointsStr}" fill="none" stroke="${escapeXml(color)}" stroke-width="2"/>`);
      if (el.chartType === 'area') {
        const firstX = segment[0]![0];
        const lastX = segment[segment.length - 1]![0];
        const poly = [...segment.map(([a, b]) => `${f(a)},${f(b)}`), `${f(lastX)},${f(y0)}`, `${f(firstX)},${f(y0)}`].join(' ');
        out.push(`<polygon points="${poly}" fill="${escapeXml(color)}" fill-opacity="0.25" stroke="none"/>`);
      }
    }
  });

  return out.join('');
}

function pieSlice(cx: number, cy: number, r: number, startDeg: number, endDeg: number, color: string): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a0);
  const y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1);
  const y2 = cy + r * Math.sin(a1);
  return `<path d="M ${f(cx)} ${f(cy)} L ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x2)} ${f(y2)} Z" fill="${escapeXml(color)}"/>`;
}

function donutSlice(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number, color: string): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  const xo1 = cx + rOuter * Math.cos(a0);
  const yo1 = cy + rOuter * Math.sin(a0);
  const xo2 = cx + rOuter * Math.cos(a1);
  const yo2 = cy + rOuter * Math.sin(a1);
  const xi1 = cx + rInner * Math.cos(a1);
  const yi1 = cy + rInner * Math.sin(a1);
  const xi2 = cx + rInner * Math.cos(a0);
  const yi2 = cy + rInner * Math.sin(a0);
  return `<path d="M ${f(xo1)} ${f(yo1)} A ${f(rOuter)} ${f(rOuter)} 0 ${large} 1 ${f(xo2)} ${f(yo2)} L ${f(xi1)} ${f(yi1)} A ${f(rInner)} ${f(rInner)} 0 ${large} 0 ${f(xi2)} ${f(yi2)} Z" fill="${escapeXml(color)}"/>`;
}

function chartPie(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = (Math.min(w, h) / 2) * 0.75;
  const inner = el.chartType === 'doughnut' ? radius * 0.55 : 0;
  const data = el.series[0]?.data ?? [];

  let total = 0;
  for (const v of data) if (isNum(v)) total += v;
  if (total <= 0) total = 1;

  const out: string[] = [];
  let angle = -90;
  data.forEach((v, i) => {
    const value = isNum(v) ? v : 0;
    const sweep = (value / total) * 360;
    const end = angle + sweep;
    if (inner > 0) out.push(donutSlice(cx, cy, radius, inner, angle, end, chartColor(el, i, theme)));
    else out.push(pieSlice(cx, cy, radius, angle, end, chartColor(el, i, theme)));
    angle = end;
  });
  return out.join('');
}

function chartRadar(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = (Math.min(w, h) / 2) * 0.7;
  const n = el.categories.length;
  if (n === 0) return '';

  const values = el.series.flatMap((s) => s.data).filter(isNum);
  const maxVal = Math.max(...values, 1);
  const angleOf = (i: number): number => ((-90 + (360 / n) * i) * Math.PI) / 180;
  const pointAt = (i: number, r: number): [number, number] => [cx + r * Math.cos(angleOf(i)), cy + r * Math.sin(angleOf(i))];

  const out: string[] = [];
  const grid = Array.from({ length: n }, (_, i) => pointAt(i, radius))
    .map(([a, b]) => `${f(a)},${f(b)}`)
    .join(' ');
  out.push(`<polygon points="${grid}" fill="none" stroke="${escapeXml(theme.colors.border)}" stroke-width="1"/>`);

  el.series.forEach((s, si) => {
    const color = chartColor(el, si, theme);
    const poly = s.data
      .map((v, i) => {
        const r = isNum(v) ? (v / maxVal) * radius : 0;
        const [a, b] = pointAt(i, r);
        return `${f(a)},${f(b)}`;
      })
      .join(' ');
    out.push(`<polygon points="${poly}" fill="${escapeXml(color)}" fill-opacity="0.25" stroke="${escapeXml(color)}" stroke-width="2"/>`);
  });

  return out.join('');
}

function chartScatter(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const px = x + padL;
  const py = y + padT;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  const xs = el.series[0]?.data ?? [];
  const ys = el.series[1]?.data ?? xs;
  const xVals = xs.filter(isNum);
  const yVals = ys.filter(isNum);
  const minX = Math.min(...xVals, 0);
  const maxX = Math.max(...xVals, 1);
  const minY = Math.min(...yVals, 0);
  const maxY = Math.max(...yVals, 1);
  const xOf = (v: number): number => px + ((v - minX) / (maxX - minX || 1)) * pw;
  const yOf = (v: number): number => py + ph - ((v - minY) / (maxY - minY || 1)) * ph;

  const out: string[] = [];
  out.push(axisLine(px, py + ph, px + pw, py + ph, theme.colors.border));
  out.push(axisLine(px, py, px, py + ph, theme.colors.border));

  const color = chartColor(el, 0, theme);
  xs.forEach((xv, i) => {
    const yv = ys[i];
    if (!isNum(xv) || !isNum(yv)) return;
    out.push(`<circle cx="${f(xOf(xv))}" cy="${f(yOf(yv))}" r="4" fill="${escapeXml(color)}" fill-opacity="0.85"/>`);
  });

  return out.join('');
}

function chartFunnel(el: ChartElement, theme: Theme): string {
  const { x, y, w, h } = el;
  const data = el.series[0]?.data ?? [];
  const n = Math.max(el.categories.length, data.length);
  const maxVal = Math.max(...data.filter(isNum), 1);
  const sliceH = h / n;

  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = data[i - 1];
    const cur = data[i];
    const v0 = i === 0 ? maxVal : isNum(prev) ? prev : 0;
    const v1 = isNum(cur) ? cur : 0;
    const w0 = (v0 / maxVal) * w;
    const w1 = (v1 / maxVal) * w;
    const y0 = y + i * sliceH;
    const y1 = y + (i + 1) * sliceH;
    const x0 = x + (w - w0) / 2;
    const x1 = x + (w - w1) / 2;
    out.push(`<polygon points="${f(x0)},${f(y0)} ${f(x0 + w0)},${f(y0)} ${f(x1 + w1)},${f(y1)} ${f(x1)},${f(y1)}" fill="${escapeXml(chartColor(el, i, theme))}" fill-opacity="0.85"/>`);
  }
  return out.join('');
}

function renderChart(el: ChartElement, ctx: RenderContext): string {
  let inner = '';
  switch (el.chartType) {
    case 'column':
    case 'bar':
      inner = chartBars(el, ctx.theme);
      break;
    case 'line':
    case 'area':
      inner = chartLines(el, ctx.theme);
      break;
    case 'pie':
    case 'doughnut':
      inner = chartPie(el, ctx.theme);
      break;
    case 'radar':
      inner = chartRadar(el, ctx.theme);
      break;
    case 'scatter':
      inner = chartScatter(el, ctx.theme);
      break;
    case 'funnel':
      inner = chartFunnel(el, ctx.theme);
      break;
  }
  return withCommon(el, inner);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function renderTable(el: TableElement, ctx: RenderContext): string {
  const theme = ctx.theme;
  const out: string[] = [];
  const borderColor = el.border?.color ?? theme.colors.border;
  const borderWidth = el.border?.width ?? 1;
  const fontSize = 12;

  let cy = el.y;
  el.rowHeights.forEach((rh, ri) => {
    let cx = el.x;
    el.colWidths.forEach((cw, ci) => {
      const cell = el.cells[ri]?.[ci];
      const isHeader = el.headerRow === true && ri === 0;
      const bg = cell?.fill ?? (isHeader ? theme.colors.primaryLight : undefined);
      out.push(`<rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(rh)}" fill="${bg ? escapeXml(bg) : 'none'}" stroke="${escapeXml(borderColor)}" stroke-width="${f(borderWidth)}"/>`);

      const text = textToPlain(cell?.text);
      const align = cell?.align ?? 'left';
      const anchor = mapTextAnchor(align);
      const tx = anchor === 'middle' ? cx + cw / 2 : anchor === 'end' ? cx + cw - 8 : cx + 8;
      const bold = cell?.bold === true || isHeader;
      const color = cell?.color ?? theme.colors.text;
      out.push(`<text x="${f(tx)}" y="${f(cy + rh / 2 + fontSize * 0.35)}" font-size="${f(fontSize)}" fill="${escapeXml(color)}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}>${escapeXml(text)}</text>`);
      cx += cw;
    });
    cy += rh;
  });

  return withCommon(el, out.join(''));
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

function renderMedia(el: MediaElement, ctx: RenderContext): string {
  const theme = ctx.theme;
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.22;
  const out: string[] = [];

  out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="8" fill="${escapeXml(theme.colors.neutrals[5] ?? '#475569')}" stroke="${escapeXml(theme.colors.border)}" stroke-width="1"/>`);
  out.push(`<polygon points="${f(cx - r * 0.5)},${f(cy - r)} ${f(cx - r * 0.5)},${f(cy + r)} ${f(cx + r)},${f(cy)}" fill="#FFFFFF"/>`);
  const label = el.mediaType === 'video' ? '视频' : '音频';
  out.push(`<text x="${f(cx)}" y="${f(y + h - 12)}" font-size="12" fill="#FFFFFF" text-anchor="middle">${escapeXml(label)}</text>`);

  return withCommon(el, out.join(''));
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function renderBackground(background: Slide['background'], theme: Theme, defs: string[]): string {
  if (!background || background.type === 'none') {
    return `<rect x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}" fill="${escapeXml(theme.colors.slideBackground)}"/>`;
  }
  if (background.type === 'solid') {
    return `<rect x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}" fill="${escapeXml(background.color)}"/>`;
  }
  const id = 'slide-bg-gradient';
  const angle = background.angle ?? 0;
  const rad = (angle * Math.PI) / 180;
  defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${f(Math.cos(rad))}" y2="${f(Math.sin(rad))}"><stop offset="0" stop-color="${escapeXml(background.from)}"/><stop offset="1" stop-color="${escapeXml(background.to)}"/></linearGradient>`);
  return `<rect x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}" fill="url(#${id})"/>`;
}
