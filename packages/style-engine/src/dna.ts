import {
  DEFAULT_THEME_ID,
  getTheme,
  roundTo,
  textToPlain,
  type ChartElement,
  type ConnectorElement,
  type Deck,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type StyleDna,
  type TextAlign,
  type TextElement,
  type Theme,
  type TextStyle,
} from '@jkinco/scene-schema';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/** Grey = near-zero saturation (r/g/b within 8 of each other). Covers white/black too. */
function isGrey(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 8;
}

function colorKey(color: string): string {
  return color.toLowerCase();
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface ColorStat {
  color: string;
  count: number;
  area: number;
}

function addStat(map: Map<string, ColorStat>, color: string | undefined, area: number): void {
  if (!color) return;
  const key = colorKey(color);
  const cur = map.get(key);
  if (cur) {
    cur.count += 1;
    cur.area += area;
  } else {
    map.set(key, { color, count: 1, area });
  }
}

/** Most frequent color (tie-break: larger total area). */
function topColor(map: Map<string, ColorStat>, exclude?: Set<string>): string | undefined {
  let best: ColorStat | undefined;
  for (const stat of map.values()) {
    if (exclude && exclude.has(colorKey(stat.color))) continue;
    if (!best || stat.count > best.count || (stat.count === best.count && stat.area > best.area)) {
      best = stat;
    }
  }
  return best?.color;
}

/** Top N colors by usage (tie-break: larger total area). */
function topColors(map: Map<string, ColorStat>, n: number): string[] {
  const stats = [...map.values()].sort((a, b) => (b.count - a.count) || (b.area - a.area));
  return stats.slice(0, n).map((s) => s.color);
}

/** Most frequent key in a string->count map (ties keep first-inserted). */
function topKey(map: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const [key, count] of map) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function dominant<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, { value: T; count: number }>();
  for (const v of values) {
    const key = JSON.stringify(v);
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { value: v, count: 1 });
  }
  let best: { value: T; count: number } | undefined;
  for (const c of counts.values()) {
    if (!best || c.count > best.count) best = c;
  }
  return best?.value;
}

function textColor(el: TextElement): string | undefined {
  return el.style.color ?? el.text.paragraphs[0]?.runs[0]?.color;
}

function textFont(el: TextElement): string | undefined {
  return el.style.fontFamily ?? el.text.paragraphs[0]?.runs[0]?.fontFamily;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultDna(theme: Theme, name?: string): StyleDna {
  return {
    name,
    palette: {
      primary: theme.colors.primary,
      secondary: theme.colors.secondary,
      accent: theme.colors.accent,
      neutrals: theme.colors.neutrals.slice(0, 3),
    },
    fonts: { heading: theme.fonts.heading, body: theme.fonts.body },
    radius: theme.radius,
    borderWidth: theme.borderWidth,
    spacing: theme.spacing,
    coverGrammar: { titleAlign: 'left', accentPlacement: 'none' },
    sectionGrammar: { marker: 'none', align: 'left' },
    titleGrammar: {
      fontSize: theme.title.fontSize,
      color: theme.title.color,
      bold: theme.title.bold,
      align: theme.title.align,
    },
    footerGrammar: {
      showPageNumber: theme.footer.showPageNumber,
      fontSize: theme.footer.fontSize,
      color: theme.footer.color,
    },
    diagramDefaults: {
      fill: theme.diagram.nodeFill,
      stroke: theme.diagram.nodeStroke,
      radius: theme.diagram.radius,
      arrowColor: theme.diagram.edgeColor,
    },
    chartDefaults: { palette: [...theme.chart.palette] },
  };
}

// ---------------------------------------------------------------------------
// Element collection
// ---------------------------------------------------------------------------

function allSlides(decks: Deck[]): Slide[] {
  const out: Slide[] = [];
  for (const deck of decks) for (const slide of deck.slides) out.push(slide);
  return out;
}

function allElements(decks: Deck[]): SlideElement[] {
  const out: SlideElement[] = [];
  for (const deck of decks) for (const slide of deck.slides) for (const el of slide.elements) out.push(el);
  return out;
}

// ---------------------------------------------------------------------------
// Spacing (median horizontal gap between consecutive same-role elements)
// ---------------------------------------------------------------------------

function collectSpacing(decks: Deck[]): number[] {
  const gaps: number[] = [];
  for (const slide of allSlides(decks)) {
    const byRole = new Map<string, SlideElement[]>();
    for (const el of slide.elements) {
      if (!el.role) continue;
      const list = byRole.get(el.role) ?? [];
      list.push(el);
      byRole.set(el.role, list);
    }
    for (const list of byRole.values()) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]!;
        const cur = sorted[i]!;
        const gap = cur.x - (prev.x + prev.w);
        if (gap >= 0) gaps.push(gap);
      }
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Cover / section grammars
// ---------------------------------------------------------------------------

type AccentPlacement = 'left' | 'right' | 'top' | 'bottom' | 'none';

function extractCoverGrammar(decks: Deck[]): NonNullable<StyleDna['coverGrammar']> {
  const coverSlides = allSlides(decks).filter((s) => s.purpose === 'cover');
  const aligns: TextAlign[] = [];
  const placements: AccentPlacement[] = [];

  for (const slide of coverSlides) {
    const title = slide.elements.find((e) => e.type === 'text' && e.role === 'title') as
      | TextElement
      | undefined;
    if (!title) continue;
    aligns.push(title.style.align ?? title.text.paragraphs[0]?.align ?? 'left');

    for (const el of slide.elements) {
      if (el.type !== 'shape' || el.w <= 200 || el.h >= 24) continue;
      const shape = el as ShapeElement;
      if (shape.y + shape.h <= title.y) placements.push('top');
      else if (shape.y >= title.y + title.h) placements.push('bottom');
      else if (shape.x + shape.w <= title.x) placements.push('left');
      else if (shape.x >= title.x + title.w) placements.push('right');
    }
  }

  return {
    titleAlign: dominant(aligns) ?? 'left',
    accentPlacement: dominant(placements) ?? 'none',
  };
}

function extractSectionGrammar(decks: Deck[]): NonNullable<StyleDna['sectionGrammar']> {
  const sectionSlides = allSlides(decks).filter((s) => s.purpose === 'section');
  const aligns: TextAlign[] = [];
  let marker: 'number' | 'bar' | 'none' = 'none';

  for (const slide of sectionSlides) {
    const label = slide.elements.find((e) => e.type === 'text' && e.role === 'section_label') as
      | TextElement
      | undefined;
    if (label) aligns.push(label.style.align ?? label.text.paragraphs[0]?.align ?? 'left');

    if (marker === 'none') {
      const digitSmall = slide.elements.some(
        (e) =>
          e.type === 'text' &&
          e.role !== 'title' &&
          /^\d+$/.test(textToPlain((e as TextElement).text).trim()) &&
          ((e as TextElement).style.fontSize ?? 999) <= 32,
      );
      const thinVertical = slide.elements.some(
        (e) => e.type === 'shape' && e.w < 24 && e.h > e.w * 2,
      );
      if (digitSmall) marker = 'number';
      else if (thinVertical) marker = 'bar';
    }
  }

  return {
    marker,
    align: dominant(aligns) ?? 'left',
  };
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export function extractStyleDna(decks: Deck[], opts: { name?: string } = {}): StyleDna {
  const theme = getTheme(DEFAULT_THEME_ID);
  const defaults = defaultDna(theme, opts.name);
  if (decks.length === 0) return defaults;

  const elements = allElements(decks);
  const texts = elements.filter((e): e is TextElement => e.type === 'text');
  const shapes = elements.filter((e): e is ShapeElement => e.type === 'shape');
  const charts = elements.filter((e): e is ChartElement => e.type === 'chart');
  const connectors = elements.filter((e): e is ConnectorElement => e.type === 'connector');

  const nodeFillMap = new Map<string, ColorStat>();
  const titleColorMap = new Map<string, ColorStat>();
  const accentMap = new Map<string, ColorStat>();
  const metricColorMap = new Map<string, ColorStat>();
  const greyMap = new Map<string, ColorStat>();

  for (const shape of shapes) {
    const color = shape.fill.type === 'solid' ? shape.fill.color : undefined;
    const area = shape.w * shape.h;
    if (!color) continue;
    if (isGrey(color)) {
      addStat(greyMap, color, area);
      continue;
    }
    if (shape.role === 'diagram_node') addStat(nodeFillMap, color, area);
    addStat(accentMap, color, area);
  }
  for (const text of texts) {
    const color = textColor(text);
    const area = text.w * text.h;
    if (!color) continue;
    if (isGrey(color)) {
      addStat(greyMap, color, area);
      continue;
    }
    if (text.role === 'title') addStat(titleColorMap, color, area);
    if (text.role === 'metric' || text.role === 'key_message') addStat(metricColorMap, color, area);
    addStat(accentMap, color, area);
  }
  for (const chart of charts) {
    for (const s of chart.series) {
      if (s.color && !isGrey(s.color)) addStat(accentMap, s.color, chart.w * chart.h);
    }
  }
  for (const conn of connectors) {
    if (!isGrey(conn.stroke.color)) addStat(accentMap, conn.stroke.color, 0);
  }

  const primary = topColor(nodeFillMap) ?? topColor(titleColorMap) ?? theme.colors.primary;
  const secondary =
    topColor(accentMap, new Set([colorKey(primary)])) ?? theme.colors.secondary;
  const accent = topColor(metricColorMap) ?? theme.colors.accent;

  let neutrals = topColors(greyMap, 3);
  if (neutrals.length < 3) {
    const seen = new Set(neutrals.map(colorKey));
    for (const n of theme.colors.neutrals) {
      if (neutrals.length >= 3) break;
      if (!seen.has(colorKey(n))) {
        neutrals.push(n);
        seen.add(colorKey(n));
      }
    }
  }

  // Fonts
  const headingMap = new Map<string, number>();
  const bodyMap = new Map<string, number>();
  for (const text of texts) {
    const font = textFont(text);
    if (!font) continue;
    if (text.role === 'title') headingMap.set(font, (headingMap.get(font) ?? 0) + 1);
    else bodyMap.set(font, (bodyMap.get(font) ?? 0) + 1);
  }

  // Radius / borderWidth
  const radii = shapes
    .filter((s) => (s.shape === 'roundRect' || s.shape === 'pill') && typeof s.radius === 'number')
    .map((s) => s.radius!);
  const widths = shapes.map((s) => s.stroke.width);

  // Title grammar
  const titleTexts = texts.filter((t) => t.role === 'title');
  const titleSizes = titleTexts.map((t) => t.style.fontSize ?? theme.title.fontSize);
  const titleColors = titleTexts.map((t) => textColor(t) ?? theme.title.color);
  const titleBolds = titleTexts.map((t) => t.style.bold ?? theme.title.bold);
  const titleAligns = titleTexts.map(
    (t) => t.style.align ?? t.text.paragraphs[0]?.align ?? theme.title.align,
  );

  // Footer grammar
  const pageNumbers = texts.filter((t) => t.role === 'page_number');
  const pageSizes = pageNumbers.map((t) => t.style.fontSize ?? theme.footer.fontSize);
  const pageColors = pageNumbers.map((t) => textColor(t) ?? theme.footer.color);

  // Diagram defaults
  const nodeFills = shapes.filter((s) => s.role === 'diagram_node').map((s) => s.fill.color ?? theme.diagram.nodeFill);
  const nodeStrokes = shapes.filter((s) => s.role === 'diagram_node').map((s) => s.stroke.color);
  const nodeRadii = shapes.filter((s) => s.role === 'diagram_node' && typeof s.radius === 'number').map((s) => s.radius!);
  const edgeColors = connectors.map((c) => c.stroke.color);

  // Chart defaults — most frequently used series colors, in descending usage.
  const chartFreq = new Map<string, number>();
  const chartOrig = new Map<string, string>();
  for (const chart of charts) {
    for (const s of chart.series) {
      if (!s.color) continue;
      const k = colorKey(s.color);
      chartFreq.set(k, (chartFreq.get(k) ?? 0) + 1);
      if (!chartOrig.has(k)) chartOrig.set(k, s.color);
    }
  }
  const chartPalette = [...chartFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => chartOrig.get(key) ?? key)
    .slice(0, theme.chart.palette.length);

  const spacing = collectSpacing(decks);
  const coverGrammar = extractCoverGrammar(decks);
  const sectionGrammar = extractSectionGrammar(decks);

  return {
    name: opts.name,
    palette: {
      primary,
      secondary,
      accent,
      neutrals,
    },
    fonts: {
      heading: topKey(headingMap) ?? theme.fonts.heading,
      body: topKey(bodyMap) ?? theme.fonts.body,
    },
    radius: radii.length > 0 ? median(radii) : theme.radius,
    borderWidth: widths.length > 0 ? median(widths) : theme.borderWidth,
    spacing: spacing.length > 0 ? roundTo(median(spacing), 8) : theme.spacing,
    coverGrammar,
    sectionGrammar,
    titleGrammar: {
      fontSize: titleSizes.length > 0 ? median(titleSizes) : theme.title.fontSize,
      color: dominant(titleColors) ?? theme.title.color,
      bold: dominant(titleBolds) ?? theme.title.bold,
      align: dominant(titleAligns) ?? theme.title.align,
    },
    footerGrammar: {
      showPageNumber: pageNumbers.length > 0,
      fontSize: pageSizes.length > 0 ? median(pageSizes) : theme.footer.fontSize,
      color: dominant(pageColors) ?? theme.footer.color,
    },
    diagramDefaults: {
      fill: dominant(nodeFills) ?? theme.diagram.nodeFill,
      stroke: dominant(nodeStrokes) ?? theme.diagram.nodeStroke,
      radius: nodeRadii.length > 0 ? median(nodeRadii) : theme.diagram.radius,
      arrowColor: dominant(edgeColors) ?? theme.diagram.edgeColor,
    },
    chartDefaults: {
      palette: chartPalette.length > 0 ? chartPalette : [...theme.chart.palette],
    },
    extractedFrom: decks.map((d) => d.id),
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function applyDnaText(el: TextElement, dna: StyleDna): TextElement {
  const heading = el.role === 'title';
  const style: TextStyle = {};
  if (heading) style.color = dna.palette.primary;
  style.fontFamily = heading ? dna.fonts.heading : dna.fonts.body;
  if (el.role === 'page_number' || el.role === 'footnote') {
    if (dna.footerGrammar?.fontSize !== undefined) style.fontSize = dna.footerGrammar.fontSize;
    if (dna.footerGrammar?.color) style.color = dna.footerGrammar.color;
  }
  return {
    ...el,
    style: { ...el.style, ...style },
    text: {
      paragraphs: el.text.paragraphs.map((p) => ({
        ...p,
        runs: p.runs.map((r) => ({
          ...r,
          color: style.color ?? r.color,
          fontSize: style.fontSize ?? r.fontSize,
          fontFamily: style.fontFamily ?? r.fontFamily,
        })),
      })),
    },
  };
}

function applyDnaShape(el: ShapeElement, dna: StyleDna): ShapeElement {
  let next: ShapeElement = { ...el };
  if (el.role === 'diagram_node' && dna.palette.primary) {
    next.fill = { ...el.fill, color: dna.palette.primary };
  }
  if ((el.shape === 'roundRect' || el.shape === 'pill') && dna.radius !== undefined) {
    next.radius = dna.radius;
  }
  if (dna.borderWidth !== undefined) {
    next.stroke = { ...el.stroke, width: dna.borderWidth };
  }
  return next;
}

function applyDnaChart(el: ChartElement, dna: StyleDna): ChartElement {
  const palette = dna.chartDefaults?.palette;
  if (!palette || palette.length === 0) return el;
  return {
    ...el,
    series: el.series.map((s, i) => ({ ...s, color: palette[i % palette.length] })),
  };
}

/**
 * Apply a StyleDna to a deck: recolor titles/diagram nodes to the primary,
 * restyle fonts/radius/border, restyle existing footer elements, and recolor
 * charts. Deterministic and immutable; sets deck.styleDna.
 */
export function applyStyleDnaToDeck(deck: Deck, dna: StyleDna): Deck {
  return {
    ...deck,
    styleDna: dna,
    slides: deck.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((el) => {
        switch (el.type) {
          case 'text':
            return applyDnaText(el, dna);
          case 'shape':
            return applyDnaShape(el, dna);
          case 'chart':
            return applyDnaChart(el, dna);
          default:
            return el;
        }
      }),
    })),
  };
}
