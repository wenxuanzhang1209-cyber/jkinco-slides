import { registerThemeRestyler } from '@jkinco/command-engine';
import {
  clamp,
  getTheme,
  type ChartElement,
  type ConnectorElement,
  type Deck,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
  type Theme,
  type TextStyle,
} from '@jkinco/scene-schema';

const TITLE_MIN = 28;
const TITLE_MAX = 40;
const KEY_MESSAGE_FONT = 20;

// ---------------------------------------------------------------------------
// Palette remapping (old palette -> new palette, by position)
// ---------------------------------------------------------------------------

/** Case-insensitive color key (hex colors are case-insensitive). */
function colorKey(color: string): string {
  return color.toLowerCase();
}

function buildPaletteRemap(oldTheme: Theme, newTheme: Theme): Map<string, string> {
  const map = new Map<string, string>();
  const o = oldTheme.colors;
  const n = newTheme.colors;
  map.set(colorKey(o.primary), n.primary);
  if (o.primaryLight && n.primaryLight) map.set(colorKey(o.primaryLight), n.primaryLight);
  map.set(colorKey(o.secondary), n.secondary);
  const len = Math.min(o.neutrals.length, n.neutrals.length);
  for (let i = 0; i < len; i += 1) {
    const from = o.neutrals[i];
    const to = n.neutrals[i];
    if (from && to) map.set(colorKey(from), to);
  }
  return map;
}

function remapColor(map: Map<string, string>, color: string | undefined): string | undefined {
  if (!color) return undefined;
  return map.get(colorKey(color));
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function textStyleForRole(role: string | undefined, theme: Theme): TextStyle {
  switch (role) {
    case 'title':
      return {
        fontSize: clamp(theme.title.fontSize, TITLE_MIN, TITLE_MAX),
        color: theme.title.color,
        bold: theme.title.bold,
        align: theme.title.align,
      };
    case 'subtitle':
      return { fontSize: theme.subtitle.fontSize, color: theme.subtitle.color };
    case 'key_message':
      return { fontSize: KEY_MESSAGE_FONT, bold: true, color: theme.colors.primary };
    case 'metric':
      return { fontSize: theme.keyNumber.fontSize, color: theme.keyNumber.color, bold: theme.keyNumber.bold };
    case 'bullet':
    case 'body':
      return { fontSize: theme.body.fontSize, color: theme.body.color, lineSpacing: theme.body.lineSpacing };
    case 'footnote':
    case 'page_number':
    case 'source':
      return { fontSize: theme.footer.fontSize, color: theme.footer.color };
    default:
      return { color: theme.body.color };
  }
}

/** Apply a TextStyle patch to a text element (style level + run level). */
function restyleText(el: TextElement, style: TextStyle): TextElement {
  return {
    ...el,
    style: { ...el.style, ...style },
    text: {
      paragraphs: el.text.paragraphs.map((p) => ({
        ...p,
        align: style.align ?? p.align,
        runs: p.runs.map((r) => ({
          ...r,
          color: style.color ?? r.color,
          bold: style.bold ?? r.bold,
          fontSize: style.fontSize ?? r.fontSize,
          fontFamily: style.fontFamily ?? r.fontFamily,
        })),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

function restyleShape(el: ShapeElement, theme: Theme, remap: Map<string, string>): ShapeElement {
  if (el.role === 'diagram_node') {
    return {
      ...el,
      fill: { ...el.fill, color: theme.diagram.nodeFill },
      stroke: { ...el.stroke, color: theme.diagram.nodeStroke },
      radius: theme.diagram.radius,
      ...(el.textStyle
        ? { textStyle: { ...el.textStyle, color: theme.body.color, fontFamily: theme.fonts.body } }
        : {}),
    };
  }

  const next: ShapeElement = { ...el };
  if (el.fill.type === 'solid' && el.fill.color) {
    const mapped = remapColor(remap, el.fill.color);
    if (mapped) next.fill = { ...el.fill, color: mapped };
  }
  const strokeMapped = remapColor(remap, el.stroke.color);
  if (strokeMapped) next.stroke = { ...el.stroke, color: strokeMapped };
  if (el.textStyle) {
    next.textStyle = { ...el.textStyle, color: theme.body.color, fontFamily: theme.fonts.body };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Connector / chart / table
// ---------------------------------------------------------------------------

function restyleConnector(el: ConnectorElement, theme: Theme): ConnectorElement {
  return {
    ...el,
    stroke: { ...el.stroke, color: theme.diagram.edgeColor, width: theme.diagram.edgeWidth },
  };
}

function restyleChart(el: ChartElement, oldTheme: Theme, theme: Theme): ChartElement {
  const palette = theme.chart.palette;
  if (palette.length === 0) return el;
  const oldPalette = oldTheme.colors.chartPalette;
  const series = el.series.map((s, i) => {
    const matchedOld =
      s.color === undefined || oldPalette.some((c) => colorKey(c) === colorKey(s.color!));
    if (!matchedOld) return s;
    return { ...s, color: palette[i % palette.length] };
  });
  return { ...el, series };
}

function restyleTable(el: TableElement, theme: Theme): TableElement {
  const cells = el.cells.map((row, rowIndex) => {
    if (el.headerRow && rowIndex === 0) {
      return row.map((cell) => ({ ...cell, fill: theme.colors.primaryLight }));
    }
    return row;
  });
  return {
    ...el,
    cells,
    border: {
      width: el.border?.width ?? 1,
      color: theme.colors.border,
      style: el.border?.style ?? 'solid',
    },
  };
}

// ---------------------------------------------------------------------------
// Element / slide / deck
// ---------------------------------------------------------------------------

function restyleElement(
  el: SlideElement,
  oldTheme: Theme,
  theme: Theme,
  remap: Map<string, string>,
): SlideElement {
  switch (el.type) {
    case 'text':
      return restyleText(el, textStyleForRole(el.role, theme));
    case 'shape':
      return restyleShape(el, theme, remap);
    case 'connector':
      return restyleConnector(el, theme);
    case 'chart':
      return restyleChart(el, oldTheme, theme);
    case 'table':
      return restyleTable(el, theme);
    default:
      return el;
  }
}

function restyleSlide(slide: Slide, oldTheme: Theme, theme: Theme, remap: Map<string, string>): Slide {
  return {
    ...slide,
    elements: slide.elements.map((el) => restyleElement(el, oldTheme, theme, remap)),
  };
}

/**
 * Deterministic, pure, structural-sharing restyle of every slide element to the
 * target theme. Solid-white slide backgrounds are preserved; gradient/none are
 * left untouched. Never mutates the input deck.
 */
export function applyThemeToDeck(deck: Deck, themeId: string): Deck {
  const oldTheme = getTheme(deck.themeId);
  const theme = getTheme(themeId);
  const remap = buildPaletteRemap(oldTheme, theme);
  return {
    ...deck,
    themeId,
    slides: deck.slides.map((slide) => restyleSlide(slide, oldTheme, theme, remap)),
  };
}

/**
 * Register this package's restyler with the command engine so that
 * `ApplyThemeCommand` performs a full element restyle instead of only changing
 * the deck.themeId field.
 */
export function registerCommandEngineThemeRestyler(): void {
  registerThemeRestyler(applyThemeToDeck);
}

// Side effect: hook into the command engine at module load.
registerCommandEngineThemeRestyler();
