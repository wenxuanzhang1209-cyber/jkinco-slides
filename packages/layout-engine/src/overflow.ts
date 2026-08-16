import type { Slide } from '@jkinco/scene-schema';
import { isEmptyText, textToPlain } from '@jkinco/scene-schema';
import { checkAutofit } from '@jkinco/rich-text';

export interface OverflowStep {
  order: 1 | 2 | 3 | 4 | 5;
  action: 'compress' | 'restructure' | 'relayout' | 'split' | 'shrink';
  slideId?: string;
  elementIds: string[];
  description: string;
}

interface OverflowingElement {
  id: string;
  fontSize: number;
  suggested: number;
  plain: string;
}

/**
 * §5.3 — detect text overflow and emit the FIXED resolution order:
 *   1 compress → 2 restructure → 3 relayout → 4 split → 5 shrink (last).
 * Returns null when nothing overflows.
 */
export function detectOverflow(slide: Slide): OverflowStep[] | null {
  const overflowing: OverflowingElement[] = [];

  for (const el of slide.elements) {
    if (el.type === 'text') {
      const fontSize = el.style.fontSize ?? 22;
      const res = checkAutofit(el.text, el.w, el.h, fontSize, el.style.lineSpacing ?? 1.4);
      if (!res.fits) {
        overflowing.push({
          id: el.id,
          fontSize,
          suggested: res.suggestedFontSize ?? fontSize,
          plain: textToPlain(el.text),
        });
      }
    } else if (el.type === 'shape' && el.text && !isEmptyText(el.text)) {
      const fontSize = el.textStyle?.fontSize ?? 16;
      const res = checkAutofit(el.text, el.w, el.h, fontSize, el.textStyle?.lineSpacing ?? 1.4);
      if (!res.fits) {
        overflowing.push({
          id: el.id,
          fontSize,
          suggested: res.suggestedFontSize ?? fontSize,
          plain: textToPlain(el.text),
        });
      }
    }
  }

  if (overflowing.length === 0) return null;

  const ids = overflowing.map((o) => o.id);
  const suggested = Math.min(...overflowing.map((o) => o.suggested));
  const preview = overflowing
    .map((o) => o.plain.slice(0, 10))
    .join('、')
    .slice(0, 40);

  return [
    { order: 1, action: 'compress', elementIds: ids, description: `压缩文本：${preview}…` },
    { order: 2, action: 'restructure', elementIds: ids, description: '将段落重构为项目符号以降低文本高度' },
    { order: 3, action: 'relayout', elementIds: ids, description: '调整元素位置与尺寸以容纳文本' },
    { order: 4, action: 'split', slideId: slide.id, elementIds: ids, description: '将元素拆分到新页面（splitSlideCommand）' },
    { order: 5, action: 'shrink', elementIds: ids, description: `最后手段：缩小字号至 ${Math.round(suggested * 10) / 10}pt` },
  ];
}
