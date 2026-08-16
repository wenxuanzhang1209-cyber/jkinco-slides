import type { ChartElement, ChartSeries, Deck, RichText, Slide, SlideElement } from '@jkinco/scene-schema';
import { SLIDE_H, SLIDE_W, normalizeZIndexes, uid, validateSlide } from '@jkinco/scene-schema';
import { getElement, getSlide, updateElement, updateSlide } from './doc';
import { restoreSnapshotCommand } from './element-commands';
import type { Command, CommandOptions, SerializedCommand } from './types';

function makeSerialized(kind: string, label: string, actor: Command['actor'], aiNote: string | undefined, payload: unknown, id: string): SerializedCommand {
  return { id, kind, label, actor, ...(aiNote ? { aiNote } : {}), payload };
}

// ---------------------------------------------------------------------------
// ApplyLayout (§14, §7.2) — replaces a slide's elements with a layout plan
// ---------------------------------------------------------------------------

export interface ApplyLayoutPayload {
  slideId: string;
  /** Layout pattern id, e.g. 'hero', '3-column', 'architecture'. */
  layoutId: string;
  elements: SlideElement[];
  /** Keep slide-level metadata (notes, purpose, background). */
  keepBackground?: boolean;
}

export type ApplyLayoutCommand = Command & { kind: 'applyLayout'; payload: ApplyLayoutPayload };

export function applyLayoutCommand(payload: ApplyLayoutPayload, opts: CommandOptions = {}): ApplyLayoutCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'applyLayout',
    label: opts.label ?? '应用版式',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate(deck) {
      const slide = getSlide(deck, payload.slideId);
      if (!slide) return `页面不存在: ${payload.slideId}`;
      const issues = validateSlide({ id: payload.slideId, elements: payload.elements, qaStatus: 'pending' });
      if (issues.length > 0) return `版式校验失败: ${issues[0]!.message}`;
      return null;
    },
    applyTo(deck) {
      return updateSlide(deck, payload.slideId, (slide) => ({
        ...slide,
        elements: normalizeZIndexes(payload.elements),
        layoutId: payload.layoutId,
        qaStatus: 'pending',
      }));
    },
    invertFrom(before) {
      const slide = getSlide(before, payload.slideId);
      if (!slide) return restoreSnapshotCommand(before, '恢复版式');
      return applyLayoutCommand(
        { slideId: payload.slideId, layoutId: slide.layoutId ?? 'custom', elements: slide.elements },
        { label: '撤销: 应用版式', actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('applyLayout', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// ApplyTheme (§30 Brand Kit) — restyle the whole deck
// ---------------------------------------------------------------------------

/** Pluggable theme restyler (registered by style-engine to avoid a dependency cycle). */
type ThemeRestyler = (deck: Deck, themeId: string) => Deck;
let themeRestyler: ThemeRestyler | null = null;

export function registerThemeRestyler(fn: ThemeRestyler): void {
  themeRestyler = fn;
}

export interface ApplyThemePayload {
  themeId: string;
  /** Restyle existing elements (default true). */
  restyle?: boolean;
}

export type ApplyThemeCommand = Command & { kind: 'applyTheme'; payload: ApplyThemePayload };

export function applyThemeCommand(payload: ApplyThemePayload, opts: CommandOptions = {}): ApplyThemeCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'applyTheme',
    label: opts.label ?? '应用主题',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate() {
      return null;
    },
    applyTo(deck) {
      const base: Deck = { ...deck, themeId: payload.themeId };
      if (payload.restyle !== false && themeRestyler) return themeRestyler(base, payload.themeId);
      return base;
    },
    invertFrom(before) {
      return applyThemeCommand({ themeId: before.themeId, restyle: payload.restyle }, { label: '撤销: 应用主题', actor: 'system' });
    },
    serialize() {
      return makeSerialized('applyTheme', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// ReplaceAsset (§32, §38)
// ---------------------------------------------------------------------------

export interface ReplaceAssetPayload {
  slideId: string;
  id: string;
  src: string;
  alt?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
}

export type ReplaceAssetCommand = Command & { kind: 'replaceAsset'; payload: ReplaceAssetPayload };

export function replaceAssetCommand(payload: ReplaceAssetPayload, opts: CommandOptions = {}): ReplaceAssetCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'replaceAsset',
    label: opts.label ?? '替换素材',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.id);
      if (!el) return `元素不存在: ${payload.id}`;
      if (el.type !== 'image' && el.type !== 'media') return '该元素不是图片或媒体';
      if (!payload.src) return '缺少 src';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => {
        if (el.type === 'image' || el.type === 'media') {
          return {
            ...el,
            src: payload.src,
            ...(el.type === 'image'
              ? { alt: payload.alt ?? el.alt, objectFit: payload.objectFit ?? el.objectFit }
              : {}),
          };
        }
        return el;
      });
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el || (el.type !== 'image' && el.type !== 'media')) return restoreSnapshotCommand(before, '恢复素材');
      return replaceAssetCommand(
        { slideId: payload.slideId, id: payload.id, src: el.src, alt: el.type === 'image' ? el.alt : undefined },
        { label: '撤销: 替换素材', actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('replaceAsset', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// BindData (§12) — bind a dataset to a chart
// ---------------------------------------------------------------------------

export interface BindDataPayload {
  slideId: string;
  id: string;
  dataSource: string;
  categories: string[];
  series: ChartSeries[];
}

export type BindDataCommand = Command & { kind: 'bindData'; payload: BindDataPayload };

export function bindDataCommand(payload: BindDataPayload, opts: CommandOptions = {}): BindDataCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'bindData',
    label: opts.label ?? '绑定数据',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.id);
      if (!el) return `元素不存在: ${payload.id}`;
      if (el.type !== 'chart') return '该元素不是图表';
      if (!Array.isArray(payload.categories)) return 'categories 无效';
      if (!Array.isArray(payload.series) || payload.series.length === 0) return 'series 无效';
      for (const s of payload.series) {
        if (!Array.isArray(s.data)) return `series(${s.name}) data 无效`;
        if (s.data.length !== payload.categories.length) return `series(${s.name}) 长度与 categories 不一致`;
      }
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => {
        if (el.type === 'chart') {
          return { ...el, dataSource: payload.dataSource, categories: payload.categories, series: payload.series };
        }
        return el;
      });
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el || el.type !== 'chart') return restoreSnapshotCommand(before, '恢复数据');
      return bindDataCommand(
        { slideId: payload.slideId, id: payload.id, dataSource: el.dataSource ?? '', categories: el.categories, series: el.series },
        { label: '撤销: 绑定数据', actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('bindData', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// UpdateSlideProps — notes, purpose, section, background, name, lock
// ---------------------------------------------------------------------------

export interface UpdateSlidePropsPayload {
  slideId: string;
  patch: Partial<Pick<Slide, 'notes' | 'purpose' | 'intent' | 'section' | 'background' | 'name' | 'locked' | 'qaStatus'>>;
}

export type UpdateSlidePropsCommand = Command & { kind: 'updateSlideProps'; payload: UpdateSlidePropsPayload };

export function updateSlidePropsCommand(payload: UpdateSlidePropsPayload, opts: CommandOptions = {}): UpdateSlidePropsCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'updateSlideProps',
    label: opts.label ?? '修改页面属性',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate(deck) {
      if (!getSlide(deck, payload.slideId)) return `页面不存在: ${payload.slideId}`;
      return null;
    },
    applyTo(deck) {
      return updateSlide(deck, payload.slideId, (s) => ({ ...s, ...payload.patch }));
    },
    invertFrom(before) {
      const slide = getSlide(before, payload.slideId);
      if (!slide) return restoreSnapshotCommand(before, '恢复页面属性');
      const patch: UpdateSlidePropsPayload['patch'] = {
        notes: slide.notes,
        purpose: slide.purpose,
        intent: slide.intent,
        section: slide.section,
        background: slide.background,
        name: slide.name,
        locked: slide.locked,
        qaStatus: slide.qaStatus,
      };
      return updateSlidePropsCommand({ slideId: payload.slideId, patch }, { label: '撤销: 修改页面属性', actor: 'system' });
    },
    serialize() {
      return makeSerialized('updateSlideProps', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

// ---------------------------------------------------------------------------
// UpdateChartData (used by Data Story panel)
// ---------------------------------------------------------------------------

export interface UpdateChartDataPayload {
  slideId: string;
  id: string;
  chartType?: ChartElement['chartType'];
  categories?: string[];
  series?: ChartSeries[];
  story?: { highlight?: string; message?: string };
  title?: RichText;
  legend?: { show: boolean; position?: 'top' | 'bottom' | 'left' | 'right' };
}

export type UpdateChartDataCommand = Command & { kind: 'updateChartData'; payload: UpdateChartDataPayload };

export function updateChartDataCommand(payload: UpdateChartDataPayload, opts: CommandOptions = {}): UpdateChartDataCommand {
  const id = opts.id ?? uid('cmd');
  return {
    id,
    kind: 'updateChartData',
    label: opts.label ?? '修改图表数据',
    actor: opts.actor ?? 'user',

    payload: payload,    aiNote: opts.aiNote,
    validate(deck) {
      const el = getElement(deck, payload.slideId, payload.id);
      if (!el) return `元素不存在: ${payload.id}`;
      if (el.type !== 'chart') return '该元素不是图表';
      return null;
    },
    applyTo(deck) {
      return updateElement(deck, payload.slideId, payload.id, (el) => {
        if (el.type !== 'chart') return el;
        return {
          ...el,
          ...(payload.chartType ? { chartType: payload.chartType } : {}),
          ...(payload.categories ? { categories: payload.categories } : {}),
          ...(payload.series ? { series: payload.series } : {}),
          ...(payload.story ? { story: payload.story } : {}),
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.legend ? { legend: payload.legend } : {}),
        };
      });
    },
    invertFrom(before) {
      const el = getElement(before, payload.slideId, payload.id);
      if (!el || el.type !== 'chart') return restoreSnapshotCommand(before, '恢复图表数据');
      return updateChartDataCommand(
        {
          slideId: payload.slideId,
          id: payload.id,
          chartType: el.chartType,
          categories: el.categories,
          series: el.series,
          story: el.story,
          title: el.title,
          legend: el.legend,
        },
        { label: '撤销: 修改图表数据', actor: 'system' },
      );
    },
    serialize() {
      return makeSerialized('updateChartData', this.label, this.actor, this.aiNote, payload, this.id);
    },
  };
}

export { SLIDE_W, SLIDE_H };
