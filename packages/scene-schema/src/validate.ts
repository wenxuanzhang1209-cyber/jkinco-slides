import { SLIDE_H, SLIDE_W } from './constants';
import { THEME_IDS } from './themes';
import type { Deck, Slide, SlideElement } from './types';
import { isFiniteNumber, sortByZIndex } from './utils';

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function check(issues: ValidationIssue[], ok: boolean, path: string, message: string, severity: 'error' | 'warning' = 'error'): void {
  if (!ok) issues.push({ path, message, severity });
}

const ELEMENT_TYPES = new Set(['text', 'shape', 'image', 'connector', 'chart', 'table', 'diagram', 'group', 'media']);

export function validateElement(el: SlideElement, slideId: string, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `${slideId}.elements[${index}](${el.id})`;
  check(issues, typeof el.id === 'string' && el.id.length > 0, path, '缺少元素 id');
  check(issues, ELEMENT_TYPES.has(el.type), path, `未知元素类型: ${String(el.type)}`);
  check(issues, isFiniteNumber(el.x) && isFiniteNumber(el.y), path, '坐标必须为有限数字');
  check(issues, isFiniteNumber(el.w) && el.w > 0 && isFiniteNumber(el.h) && el.h > 0, path, '宽高必须为正数');
  check(issues, isFiniteNumber(el.rotation), path, 'rotation 必须为数字');
  check(issues, isFiniteNumber(el.opacity) && el.opacity >= 0 && el.opacity <= 1, path, 'opacity 必须在 0..1 之间');
  check(issues, isFiniteNumber(el.zIndex), path, 'zIndex 必须为数字');

  switch (el.type) {
    case 'text': {
      check(issues, Array.isArray(el.text.paragraphs) && el.text.paragraphs.length > 0, `${path}.text`, '文本元素必须有段落');
      break;
    }
    case 'shape': {
      check(issues, (el.fill.type === 'solid' && typeof el.fill.color === 'string') || el.fill.type === 'none', `${path}.fill`, '填充配置无效');
      check(issues, typeof el.stroke.color === 'string' && isFiniteNumber(el.stroke.width) && el.stroke.width >= 0, `${path}.stroke`, '描边配置无效');
      break;
    }
    case 'image': {
      check(issues, typeof el.src === 'string' && el.src.length > 0, `${path}.src`, '图片缺少 src');
      break;
    }
    case 'connector': {
      check(issues, isFiniteNumber(el.start.x) && isFiniteNumber(el.start.y) && isFiniteNumber(el.end.x) && isFiniteNumber(el.end.y), `${path}`, '连接线端点坐标无效');
      break;
    }
    case 'chart': {
      check(issues, Array.isArray(el.categories), `${path}.categories`, '图表缺少 categories');
      check(issues, Array.isArray(el.series) && el.series.length > 0, `${path}.series`, '图表缺少 series');
      break;
    }
    case 'table': {
      check(issues, el.cells.length > 0 && el.colWidths.length > 0 && el.rowHeights.length > 0, `${path}`, '表格结构无效');
      break;
    }
    case 'diagram': {
      const nodeIds = new Set(el.nodes.map((n) => n.id));
      for (const edge of el.edges) {
        check(issues, nodeIds.has(edge.from), `${path}.edges(${edge.id})`, `边引用不存在的起点节点: ${edge.from}`);
        check(issues, nodeIds.has(edge.to), `${path}.edges(${edge.id})`, `边引用不存在的终点节点: ${edge.to}`);
      }
      const childSet = new Set(el.childIds);
      for (const nodeId of nodeIds) {
        check(issues, childSet.has(nodeId), `${path}.nodes(${nodeId})`, `节点不在 childIds 中: ${nodeId}`);
      }
      break;
    }
    case 'group': {
      check(issues, el.childIds.length > 0, `${path}`, '空分组');
      break;
    }
    case 'media': {
      check(issues, typeof el.src === 'string' && el.src.length > 0, `${path}.src`, '媒体缺少 src');
      break;
    }
  }
  return issues;
}

export function validateSlide(slide: Slide): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `slides.${slide.id}`;
  const ids = new Set<string>();
  for (let i = 0; i < slide.elements.length; i++) {
    const el = slide.elements[i]!;
    if (ids.has(el.id)) {
      issues.push({ path: `${path}.elements[${i}]`, message: `重复元素 id: ${el.id}`, severity: 'error' });
    }
    ids.add(el.id);
    issues.push(...validateElement(el, slide.id, i));
  }
  const sorted = sortByZIndex(slide.elements);
  const zSet = new Set(slide.elements.map((e) => e.zIndex));
  check(issues, zSet.size === slide.elements.length, path, 'zIndex 重复');
  if (sorted.length > 0) {
    check(
      issues,
      sorted.every((e, i) => e.zIndex === i),
      path,
      'zIndex 未从 0 连续编号',
      'warning',
    );
  }
  return issues;
}

export function validateDeck(deck: Deck): ValidationResult {
  const issues: ValidationIssue[] = [];
  check(issues, typeof deck.title === 'string', 'deck.title', '缺少标题');
  check(issues, THEME_IDS.includes(deck.themeId), 'deck.themeId', `未知主题: ${deck.themeId}`);
  check(issues, Array.isArray(deck.slides), 'deck.slides', 'slides 必须为数组');
  const slideIds = new Set<string>();
  for (const slide of deck.slides) {
    if (slideIds.has(slide.id)) {
      issues.push({ path: `deck.slides.${slide.id}`, message: '重复幻灯片 id', severity: 'error' });
    }
    slideIds.add(slide.id);
    issues.push(...validateSlide(slide));
  }
  const budget = deck.settings.budget;
  if (budget) {
    check(issues, budget.titleMax > 0 && budget.bodyHard > 0 && budget.bulletsMax > 0, 'deck.settings.budget', '内容预算配置无效');
  }
  return { ok: issues.filter((i) => i.severity === 'error').length === 0, issues };
}

/** Geometry checks reused by QA and validation: out-of-bounds detection. */
export function isOutOfBounds(el: Pick<SlideElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>, margin = 0): boolean {
  return el.x < -margin || el.y < -margin || el.x + el.w > SLIDE_W + margin || el.y + el.h > SLIDE_H + margin;
}
