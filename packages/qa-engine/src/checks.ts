import type { Deck, RichText, SemanticRole, ShapeElement, Slide, SlideElement, TextElement, Theme } from '@jkinco/scene-schema';
import {
  SLIDE_H,
  SLIDE_W,
  bulletCount,
  getRotatedBounds,
  getTheme,
  intersectArea,
  isEmptyText,
  textLength,
  textToPlain,
} from '@jkinco/scene-schema';
import { checkAutofit, computeDensity } from '@jkinco/layout-engine';
import type { QaCategory, QaIssue, QaReport } from './types';

// ---------------------------------------------------------------------------
// Text / geometry helpers
// ---------------------------------------------------------------------------

function textOf(el: SlideElement): RichText | undefined {
  if (el.type === 'text') return el.text;
  if (el.type === 'shape') return el.text;
  if (el.type === 'chart') return el.title;
  if (el.type === 'connector') return el.label;
  return undefined;
}

function plainOf(el: SlideElement): string {
  const t = textOf(el);
  return t ? textToPlain(t) : '';
}

function fontSizeOf(el: SlideElement): number | undefined {
  if (el.type === 'text') return el.style.fontSize;
  if (el.type === 'shape') return el.textStyle?.fontSize;
  return undefined;
}

function isTextCarrier(el: SlideElement): el is TextElement | ShapeElement {
  if (el.type === 'text') return true;
  if (el.type === 'shape') return Boolean(el.text) && !isEmptyText(el.text);
  return false;
}

function slideBgColor(slide: Slide, theme: Theme): string {
  if (slide.background?.type === 'solid') return slide.background.color;
  return theme.colors.slideBackground;
}

// ---------------------------------------------------------------------------
// WCAG (simplified) relative luminance / contrast
// ---------------------------------------------------------------------------

function normalizeHex(color: string): string | null {
  let h = color.trim().replace(/^#/, '').toUpperCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return h;
}

function relativeLuminance(color: string): number {
  const h = normalizeHex(color);
  if (!h) return 1;
  const chan = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0]! + 0.7152 * chan[1]! + 0.0722 * chan[2]!;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
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
    '#FFFFFF',
    '#FFF',
    '#000000',
    '#000',
    '#F5F5F5',
    '#EEEEEE',
    '#DDDDDD',
    '#CCCCCC',
    '#999999',
    '#666666',
    '#333333',
  ];
  return new Set(
    list
      .filter((x): x is string => typeof x === 'string')
      .map(normalizeHex)
      .filter((x): x is string => x !== null),
  );
}

function roleGroup(role: SemanticRole | undefined): string | null {
  if (!role) return null;
  switch (role) {
    case 'title':
    case 'subtitle':
      return 'heading';
    case 'key_message':
      return 'message';
    case 'body':
    case 'bullet':
      return 'body';
    case 'metric':
    case 'metric_label':
      return 'metric';
    case 'footnote':
    case 'page_number':
    case 'source':
    case 'caption':
      return 'footer';
    case 'diagram_node':
    case 'diagram_edge':
    case 'diagram_label':
      return 'diagram';
    case 'chart_title':
    case 'column_header':
      return 'chart';
    default:
      return role;
  }
}

// ---------------------------------------------------------------------------
// reviewSlide
// ---------------------------------------------------------------------------

export function reviewSlide(slide: Slide, ctx: { theme: Theme }): QaIssue[] {
  const theme = ctx.theme;
  const issues: QaIssue[] = [];
  let n = 0;
  const push = (
    category: QaCategory,
    severity: QaIssue['severity'],
    message: string,
    elementIds?: string[],
    fix?: QaIssue['fix'],
  ) => {
    issues.push({
      id: `qa_${category}_${n++}`,
      category,
      severity,
      message,
      ...(slide.id ? { slideId: slide.id } : {}),
      ...(elementIds ? { elementIds } : {}),
      ...(fix ? { fix } : {}),
    });
  };

  const elements = slide.elements;
  const textCarriers = elements.filter(isTextCarrier);
  const nonConnectors = elements.filter((e) => e.type !== 'connector');

  // ------------------------------------------------------------------
  // Geometry
  // ------------------------------------------------------------------
  for (let i = 0; i < nonConnectors.length; i++) {
    for (let j = i + 1; j < nonConnectors.length; j++) {
      const a = nonConnectors[i]!;
      const b = nonConnectors[j]!;
      const ra = getRotatedBounds(a);
      const rb = getRotatedBounds(b);
      const overlap = intersectArea(ra, rb);
      const smaller = Math.min(ra.w * ra.h, rb.w * rb.h);
      if (smaller > 0 && overlap > 0.15 * smaller) {
        push('geometry', 'error', '元素重叠超过较小元素面积的 15%', [a.id, b.id]);
      }
    }
  }

  for (const el of elements) {
    if (el.type === 'connector') continue;
    const b = getRotatedBounds(el);
    const fullyOut = b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= SLIDE_W || b.y >= SLIDE_H;
    if (fullyOut) {
      push('geometry', 'error', '元素完全位于画布之外', [el.id], 'auto');
      continue;
    }
    const clipped = b.x < -2 || b.y < -2 || b.x + b.w > SLIDE_W + 2 || b.y + b.h > SLIDE_H + 2;
    if (clipped) push('geometry', 'warning', '元素部分超出画布边界', [el.id], 'auto');
  }

  // Misalignment (info) — same-role elements with edges off by 0.5–8pt.
  const byRole = new Map<string, SlideElement[]>();
  for (const el of nonConnectors) {
    if (!el.role) continue;
    const g = byRole.get(el.role) ?? [];
    g.push(el);
    byRole.set(el.role, g);
  }
  for (const [role, group] of byRole) {
    if (group.length < 2) continue;
    let misaligned = false;
    for (let i = 0; i < group.length && !misaligned; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const deltas = [
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.x + a.w - (b.x + b.w)),
          Math.abs(a.y + a.h - (b.y + b.h)),
        ];
        if (deltas.some((d) => d >= 0.5 && d <= 8)) {
          misaligned = true;
          break;
        }
      }
    }
    if (misaligned) push('geometry', 'info', `角色 ${role} 的元素边缘存在轻微不对齐`, group.map((e) => e.id));
  }

  // Inconsistent spacing (warning) — gap variance between consecutive same-role elements.
  for (const [role, group] of byRole) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.x - b.x || a.y - b.y);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const gap = Math.max(cur.x - (prev.x + prev.w), cur.y - (prev.y + prev.h));
      if (gap >= 0) gaps.push(gap);
    }
    if (gaps.length >= 2) {
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const variance = gaps.reduce((s, g) => s + (g - mean) * (g - mean), 0) / gaps.length;
      if (variance > 144) push('geometry', 'warning', `角色 ${role} 的元素间距不一致`, group.map((e) => e.id));
    }
  }

  // ------------------------------------------------------------------
  // Typography
  // ------------------------------------------------------------------
  for (const el of textCarriers) {
    const text = el.text;
    if (!text) continue;
    const box = { w: el.w, h: el.h };
    const fontSize = fontSizeOf(el) ?? 22;
    const lineSpacing = el.type === 'text' ? el.style.lineSpacing ?? 1.4 : el.textStyle?.lineSpacing ?? 1.4;
    const fit = checkAutofit(text, box.w, box.h, fontSize, lineSpacing);
    if (!fit.fits) {
      push('typography', 'error', '文本溢出其容器', [el.id], 'auto');
      if (fit.overflowLines <= 1) push('typography', 'info', '存在孤行（仅多出一行）', [el.id]);
    }
    if (el.role === 'body' || el.role === 'bullet') {
      if (fontSize < 18) push('typography', 'error', '正文字号小于 18pt', [el.id], 'auto');
    }
  }

  for (const el of elements) {
    if (el.role === 'title' && textLength(plainOf(el)) > 18) {
      push('typography', 'warning', '标题超过预算长度（18 字）', [el.id]);
    }
  }

  const fontFamilies = new Set<string>();
  for (const el of elements) {
    if (el.type === 'text') {
      if (el.style.fontFamily) fontFamilies.add(el.style.fontFamily);
      for (const p of el.text.paragraphs) for (const r of p.runs) if (r.fontFamily) fontFamilies.add(r.fontFamily);
    } else if (el.type === 'shape' && el.textStyle?.fontFamily) {
      fontFamilies.add(el.textStyle.fontFamily);
    }
  }
  if (fontFamilies.size > 4) push('typography', 'warning', `页面上存在超过 4 种字体（${fontFamilies.size} 种）`);

  // ------------------------------------------------------------------
  // Content
  // ------------------------------------------------------------------
  for (const el of textCarriers) {
    if ((el.role === 'body' || el.role === 'bullet') && textLength(plainOf(el)) > 120) {
      push('content', 'error', '正文内容超过 120 字', [el.id]);
    }
  }

  const plainMap = new Map<string, string[]>();
  for (const el of textCarriers) {
    const p = textToPlain(el.text);
    if (!p.trim()) continue;
    const list = plainMap.get(p) ?? [];
    list.push(el.id);
    plainMap.set(p, list);
  }
  for (const [text, ids] of plainMap) {
    if (ids.length > 1) push('content', 'warning', `存在重复文本「${text.slice(0, 12)}…」`, ids.slice(0, 2), 'auto');
  }

  for (const el of elements) {
    if (el.role === 'title' && textLength(plainOf(el)) < 4) {
      push('content', 'info', '标题过短（少于 4 字）', [el.id]);
    }
  }

  const hasKeyMessage = elements.some((e) => e.role === 'key_message');
  const hasMetric = elements.some((e) => e.role === 'metric');
  const purposeExempt = slide.purpose === 'cover' || slide.purpose === 'section' || slide.purpose === 'thanks';
  if (!hasKeyMessage && !hasMetric && !purposeExempt) {
    push('content', 'warning', '页面缺少关键信息（key message）');
  }

  const bulletTotal =
    elements.filter((e) => e.role === 'bullet').length ||
    elements.reduce((acc, e) => (e.type === 'text' ? acc + bulletCount(e.text) : acc), 0);
  if (bulletTotal > 5) push('content', 'warning', `项目符号过多（${bulletTotal} 条，超过 5 条）`);

  const groups = new Set<string>();
  for (const el of elements) {
    const g = roleGroup(el.role);
    if (g) groups.add(g);
  }
  if (groups.size > 4) push('content', 'warning', `页面模块超过 4 类（${groups.size} 类）`);

  const density = computeDensity(slide);
  if (density.band === 'blocked') push('content', 'warning', `内容密度过高（${density.score}）`);

  // ------------------------------------------------------------------
  // Visual
  // ------------------------------------------------------------------
  const bg = slideBgColor(slide, theme);
  for (const el of elements) {
    if (el.type === 'text') {
      const fg = el.style.color ?? theme.colors.text;
      if (contrastRatio(fg, bg) < 2.5) push('visual', 'warning', '文字与背景对比度不足', [el.id]);
    } else if (el.type === 'shape' && el.text && !isEmptyText(el.text)) {
      const shapeBg = el.fill.type === 'solid' && el.fill.color ? el.fill.color : bg;
      const fg = el.textStyle?.color ?? theme.colors.text;
      if (contrastRatio(fg, shapeBg) < 2.5) push('visual', 'warning', '形状内文字与填充对比度不足', [el.id]);
    }
  }

  const palette = themePalette(theme);
  for (const el of elements) {
    const colors: string[] = [];
    if (el.type === 'text' && el.style.color) colors.push(el.style.color);
    if (el.type === 'shape') {
      if (el.fill.type === 'solid' && el.fill.color) colors.push(el.fill.color);
      if (el.stroke.color) colors.push(el.stroke.color);
      if (el.textStyle?.color) colors.push(el.textStyle.color);
    }
    if (el.type === 'connector' && el.stroke.color) colors.push(el.stroke.color);
    if (colors.some((c) => normalizeHex(c) !== null && !palette.has(normalizeHex(c)!))) {
      push('visual', 'info', '存在主题调色板之外的颜色', [el.id]);
    }
  }

  for (const el of elements) {
    if (el.type === 'image') {
      if (el.objectFit === 'fill') {
        if (el.crop && el.crop.h > 0 && el.crop.w > 0) {
          const ratio = el.w / el.h;
          const cropRatio = el.crop.w / el.crop.h;
          if (Math.abs(ratio - cropRatio) / cropRatio > 0.3) {
            push('visual', 'warning', '图片被拉伸（宽高比与裁剪比差异超过 30%）', [el.id]);
          }
        } else {
          push('visual', 'warning', '图片使用 fill 拉伸且未定义裁剪区域', [el.id]);
        }
      }
      if (el.src === '' || el.src === 'about:blank') {
        push('visual', 'info', '图片为占位符（缺少实际 src）', [el.id]);
      }
    }
  }

  const shapeCount = elements.filter((e) => e.type === 'shape').length;
  if (shapeCount > 8) push('visual', 'warning', `形状容器过多（${shapeCount} 个，超过 8 个）`);

  return issues;
}

// ---------------------------------------------------------------------------
// reviewDeck
// ---------------------------------------------------------------------------

export function reviewDeck(deck: Deck, opts: { theme?: Theme } = {}): QaReport {
  const theme = opts.theme ?? getTheme(deck.themeId);
  const issues: QaIssue[] = [];
  const perSlide: Record<string, QaIssue[]> = {};

  deck.slides.forEach((slide, i) => {
    const slideIssues = reviewSlide(slide, { theme });
    perSlide[slide.id] = slideIssues;
    for (const issue of slideIssues) issues.push({ ...issue, id: `s${i}_${issue.id}` });
  });

  let n = 0;
  const pushDeck = (severity: QaIssue['severity'], message: string, slideIds?: string[], fix?: QaIssue['fix']) => {
    issues.push({
      id: `qa_deck_${n++}`,
      category: 'deck',
      severity,
      message,
      ...(slideIds ? { slideId: slideIds[0] } : {}),
      ...(fix ? { fix } : {}),
    });
  };

  // Blank slide (index > 0) → error.
  deck.slides.forEach((slide, i) => {
    if (i > 0 && slide.elements.length === 0) pushDeck('error', '空白页面', [slide.id]);
  });

  // Last slide purpose → info.
  const last = deck.slides[deck.slides.length - 1];
  if (last && last.purpose !== 'summary' && last.purpose !== 'thanks') {
    pushDeck('info', '最后一页不是总结或致谢页', [last.id]);
  }

  // Slide repetition (same purpose + same first title) → warning.
  const seen = new Map<string, number>();
  deck.slides.forEach((slide, i) => {
    const title = slide.elements.find((e) => e.role === 'title');
    const titleText = title && (title.type === 'text' || title.type === 'shape') ? textToPlain(title.text ?? { paragraphs: [] }) : '';
    const key = `${slide.purpose ?? ''}::${titleText}`;
    if (slide.purpose && title) {
      if (seen.has(key)) pushDeck('warning', '存在重复页面（相同用途与标题）', [slide.id]);
      else seen.set(key, i);
    }
  });

  // Inconsistent chapter styles (section slide title font sizes differ) → info.
  const sectionFonts = new Set<number>();
  for (const slide of deck.slides) {
    if (slide.purpose !== 'section') continue;
    const title = slide.elements.find((e) => e.role === 'title' && e.type === 'text');
    if (title && title.type === 'text' && title.style.fontSize !== undefined) sectionFonts.add(title.style.fontSize);
  }
  if (sectionFonts.size > 1) pushDeck('info', '章节页标题字号不一致');

  // Duplicate conclusions (same key_message text across slides) → warning.
  const conclusions = new Map<string, string[]>();
  deck.slides.forEach((slide) => {
    for (const el of slide.elements) {
      if (el.role === 'key_message') {
        const p = textToPlain(textOf(el) ?? { paragraphs: [] });
        if (p.trim()) {
          const list = conclusions.get(p) ?? [];
          list.push(slide.id);
          conclusions.set(p, list);
        }
      }
    }
  });
  for (const [, slideIds] of conclusions) {
    if (slideIds.length > 1) pushDeck('warning', '不同页面存在重复结论', slideIds);
  }

  // Narrative gap (consecutive slides with different intents; first not cover) → info.
  for (let i = 1; i < deck.slides.length; i++) {
    const prev = deck.slides[i - 1]!;
    const cur = deck.slides[i]!;
    if (prev.intent && cur.intent && prev.intent !== cur.intent && prev.purpose !== 'cover') {
      pushDeck('info', '相邻页面意图不一致', [cur.id]);
    }
  }

  const stats = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };

  return { ready: stats.errors === 0, issues, perSlide, stats };
}
