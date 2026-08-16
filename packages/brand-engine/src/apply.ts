import {
  SLIDE_H,
  SLIDE_W,
  createImage,
  createText,
  type ChartElement,
  type Deck,
  type ImageElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type StyleDna,
  type TextElement,
  type Theme,
  type TextStyle,
} from '@jkinco/scene-schema';
import type { BrandKit } from './kit';

const BRAND_SOURCE = 'brand-kit';
const HEADING_ROLES = new Set(['title', 'subtitle', 'section_label', 'chart_title']);

// ---------------------------------------------------------------------------
// Deterministic element builders (ids derived from slide id, never uid()).
// ---------------------------------------------------------------------------

function brandLogo(slideId: string, isCover: boolean, src: string, z: number): ImageElement {
  const pos = isCover
    ? { x: 40, y: 40, w: 128, h: 44 }
    : { x: SLIDE_W - 96 - 24, y: SLIDE_H - 36 - 24, w: 96, h: 36 };
  return createImage(pos.x, pos.y, pos.w, pos.h, src, {
    id: `brand-logo-${slideId}`,
    role: 'logo',
    objectFit: 'contain',
    zIndex: z,
    semantic: { sourceIds: [BRAND_SOURCE] },
  });
}

function brandFooter(slideId: string, text: string, theme: Theme, z: number): TextElement {
  return createText(40, SLIDE_H - 40, 600, 28, text, {
    id: `brand-footer-${slideId}`,
    role: 'footnote',
    style: { fontSize: 11, color: theme.colors.textMuted },
    zIndex: z,
    semantic: { sourceIds: [BRAND_SOURCE] },
  });
}

function brandPageNumber(slideId: string, number: number, theme: Theme, z: number): TextElement {
  return createText(SLIDE_W - 80, SLIDE_H - 40, 40, 28, String(number), {
    id: `brand-page-${slideId}`,
    role: 'page_number',
    style: { fontSize: 11, color: theme.colors.textMuted, align: 'right' },
    zIndex: z,
    semantic: { sourceIds: [BRAND_SOURCE] },
  });
}

function brandConfidentiality(slideId: string, text: string, z: number): TextElement {
  return createText(SLIDE_W - 280, 16, 260, 20, text, {
    id: `brand-confidentiality-${slideId}`,
    role: 'footnote',
    style: { fontSize: 11, color: '#C0392B', align: 'right' },
    zIndex: z,
    semantic: { sourceIds: [BRAND_SOURCE] },
  });
}

function brandWatermark(
  slideId: string,
  watermark: NonNullable<BrandKit['watermark']>,
  theme: Theme,
  z: number,
): TextElement {
  const base = createText(0, 0, SLIDE_W, SLIDE_H, watermark.text, {
    id: `brand-watermark-${slideId}`,
    role: 'footnote',
    style: { fontSize: 64, color: theme.colors.textMuted, align: 'center' },
    verticalAlign: 'middle',
    semantic: { sourceIds: [BRAND_SOURCE], aiEditable: false },
  });
  return { ...base, rotation: 315, opacity: watermark.opacity, locked: true, zIndex: z };
}

/** True when a brand-kit element with this deterministic id already exists. */
function hasBrandId(slide: Slide, id: string): boolean {
  return slide.elements.some((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Restyle existing elements
// ---------------------------------------------------------------------------

function restyleBrandText(el: TextElement, kit: BrandKit): TextElement {
  const style: TextStyle = {};
  const isHeading = el.role !== undefined && HEADING_ROLES.has(el.role);

  if (kit.fonts?.heading && isHeading) style.fontFamily = kit.fonts.heading;
  else if (kit.fonts?.body) style.fontFamily = kit.fonts.body;

  if (kit.colors?.primary && el.role === 'title') style.color = kit.colors.primary;
  if (kit.colors?.accent && (el.role === 'metric' || el.role === 'key_message')) {
    style.color = kit.colors.accent;
  }

  if (Object.keys(style).length === 0) return el;

  return {
    ...el,
    style: { ...el.style, ...style },
    text: {
      paragraphs: el.text.paragraphs.map((p) => ({
        ...p,
        runs: p.runs.map((r) => ({
          ...r,
          color: style.color ?? r.color,
          fontFamily: style.fontFamily ?? r.fontFamily,
        })),
      })),
    },
  };
}

function restyleBrandShape(el: ShapeElement, kit: BrandKit): ShapeElement {
  if (el.role !== 'diagram_node') return el;
  const dd = kit.diagramDefaults;
  const fill = dd?.fill ?? kit.colors?.primary;
  let next: ShapeElement = { ...el };
  if (fill) next.fill = { ...el.fill, color: fill };
  if (dd?.stroke) next.stroke = { ...el.stroke, color: dd.stroke };
  if (dd?.radius !== undefined) next.radius = dd.radius;
  return next;
}

function restyleBrandChart(el: ChartElement, kit: BrandKit): ChartElement {
  const palette = kit.chartDefaults?.palette;
  if (!palette || palette.length === 0) return el;
  return {
    ...el,
    series: el.series.map((s, i) => ({ ...s, color: palette[i % palette.length] })),
  };
}

function restyleBrandElement(el: SlideElement, kit: BrandKit): SlideElement {
  switch (el.type) {
    case 'text':
      return restyleBrandText(el, kit);
    case 'shape':
      return restyleBrandShape(el, kit);
    case 'chart':
      return restyleBrandChart(el, kit);
    default:
      return el;
  }
}

// ---------------------------------------------------------------------------
// styleDna merge
// ---------------------------------------------------------------------------

function mergeStyleDna(deck: Deck, kit: BrandKit, theme: Theme): StyleDna | undefined {
  const prev = deck.styleDna;
  const hasKit = Boolean(kit.colors || kit.fonts || kit.chartDefaults || kit.diagramDefaults);
  if (!hasKit) return prev;

  const dna: StyleDna = {
    name: prev?.name ?? 'brand-kit',
    palette: {
      primary: kit.colors?.primary ?? prev?.palette.primary ?? theme.colors.primary,
      secondary: kit.colors?.secondary ?? prev?.palette.secondary ?? theme.colors.secondary,
      accent: kit.colors?.accent ?? prev?.palette.accent ?? theme.colors.accent,
      neutrals: prev?.palette.neutrals ?? theme.colors.neutrals.slice(0, 3),
    },
    fonts: {
      heading: kit.fonts?.heading ?? prev?.fonts.heading ?? theme.fonts.heading,
      body: kit.fonts?.body ?? prev?.fonts.body ?? theme.fonts.body,
    },
    radius: kit.diagramDefaults?.radius ?? prev?.radius ?? theme.radius,
    borderWidth: prev?.borderWidth ?? theme.borderWidth,
    spacing: prev?.spacing ?? theme.spacing,
  };

  if (prev?.coverGrammar) dna.coverGrammar = prev.coverGrammar;
  if (prev?.sectionGrammar) dna.sectionGrammar = prev.sectionGrammar;
  if (prev?.titleGrammar) dna.titleGrammar = prev.titleGrammar;
  if (prev?.footerGrammar) dna.footerGrammar = prev.footerGrammar;
  if (kit.diagramDefaults && !prev?.diagramDefaults) {
    dna.diagramDefaults = {
      fill: kit.diagramDefaults.fill ?? theme.diagram.nodeFill,
      stroke: kit.diagramDefaults.stroke ?? theme.diagram.nodeStroke,
      radius: kit.diagramDefaults.radius ?? theme.diagram.radius,
      arrowColor: theme.diagram.edgeColor,
    };
  } else if (prev?.diagramDefaults) {
    dna.diagramDefaults = prev.diagramDefaults;
  }
  if (kit.chartDefaults?.palette) dna.chartDefaults = { palette: kit.chartDefaults.palette };
  else if (prev?.chartDefaults) dna.chartDefaults = prev.chartDefaults;
  if (prev?.extractedFrom) dna.extractedFrom = prev.extractedFrom;

  return dna;
}

// ---------------------------------------------------------------------------
// Per-slide application
// ---------------------------------------------------------------------------

function applyToSlide(
  slide: Slide,
  index: number,
  kit: BrandKit,
  theme: Theme,
): Slide {
  const restyled = slide.elements.map((el) => restyleBrandElement(el, kit));
  const added: SlideElement[] = [];

  const maxZ = restyled.length === 0 ? -1 : Math.max(...restyled.map((e) => e.zIndex));
  let z = maxZ + 1;

  const isCover = slide.purpose === 'cover';
  const isSection = slide.purpose === 'section';

  if (kit.logo && !hasBrandId(slide, `brand-logo-${slide.id}`)) {
    added.push(brandLogo(slide.id, isCover, kit.logo, z++));
  }
  if (!isCover && !isSection) {
    if (kit.footer?.text && !hasBrandId(slide, `brand-footer-${slide.id}`)) {
      added.push(brandFooter(slide.id, kit.footer.text, theme, z++));
    }
    if (kit.footer?.showPageNumber && !hasBrandId(slide, `brand-page-${slide.id}`)) {
      added.push(brandPageNumber(slide.id, index + 1, theme, z++));
    }
  }
  if (kit.watermark && !hasBrandId(slide, `brand-watermark-${slide.id}`)) {
    added.push(brandWatermark(slide.id, kit.watermark, theme, z++));
  }
  if (kit.confidentiality && !hasBrandId(slide, `brand-confidentiality-${slide.id}`)) {
    added.push(brandConfidentiality(slide.id, kit.confidentiality, z++));
  }

  return { ...slide, elements: [...restyled, ...added] };
}

/**
 * Apply a brand kit to a deck. Deterministic and immutable: restyles existing
 * elements by role and adds logo/footer/page-number/confidentiality/watermark
 * elements. Created elements carry `semantic.sourceIds: ['brand-kit']`.
 */
export function applyBrandKit(deck: Deck, kit: BrandKit, theme: Theme): Deck {
  const styleDna = mergeStyleDna(deck, kit, theme);
  return {
    ...deck,
    ...(styleDna ? { styleDna } : {}),
    slides: deck.slides.map((slide, index) => applyToSlide(slide, index, kit, theme)),
  };
}
