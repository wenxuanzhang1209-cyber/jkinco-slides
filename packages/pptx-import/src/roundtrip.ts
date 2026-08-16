/**
 * Round-trip stability corpus (§43): export → import → export → import.
 */
import { textToPlain } from '@jkinco/scene-schema';
import type { Deck, SlideElement } from '@jkinco/scene-schema';
import { exportDeckToPptx } from '../../pptx-export/src/export';
import { importPptx } from './import';

export interface RoundTripResult {
  ok: boolean;
  notes: string[];
  export1: Uint8Array;
  import1: Deck;
  export2: Uint8Array;
  import2: Deck;
}

function elementText(el: SlideElement): string {
  switch (el.type) {
    case 'text': return textToPlain(el.text);
    case 'shape': return textToPlain(el.text);
    case 'image': return '';
    case 'connector': return textToPlain(el.label);
    case 'chart':
      return `${el.categories.join('|')} ${el.series.map((s) => s.name).join('|')} ${textToPlain(el.title)}`;
    case 'table': return el.cells.flatMap((r) => r.map((c) => textToPlain(c.text))).join('|');
    case 'diagram': return el.nodes.map((n) => n.label ?? '').join('|');
    case 'group': return el.childIds.join(',');
    case 'media': return el.src.slice(0, 20);
  }
}

function comparable(el: SlideElement): boolean {
  return el.type === 'text' || el.type === 'shape' || el.type === 'image' || el.type === 'connector' || el.type === 'chart' || el.type === 'table';
}

export function structuralSummary(deck: Deck): string[] {
  const lines: string[] = [];
  for (const slide of deck.slides) {
    const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex);
    for (const el of sorted) {
      if (!comparable(el)) continue;
      lines.push(
        `${el.type}:${Math.round(el.x)}:${Math.round(el.y)}:${Math.round(el.w)}:${Math.round(el.h)}:${elementText(el).slice(0, 20)}`,
      );
    }
  }
  return lines.sort();
}

function compareDecks(a: Deck, b: Deck): string[] {
  const notes: string[] = [];
  if (a.slides.length === b.slides.length) notes.push(`✓ 幻灯片数量一致 (${a.slides.length})`);
  else notes.push(`✗ 幻灯片数量不一致: ${a.slides.length} vs ${b.slides.length}`);

  const max = Math.max(a.slides.length, b.slides.length);
  for (let i = 0; i < max; i++) {
    const sa = a.slides[i];
    const sb = b.slides[i];
    if (!sa || !sb) {
      notes.push(`✗ 第 ${i} 页缺失`);
      continue;
    }
    if (sa.elements.length === sb.elements.length) notes.push(`✓ 第 ${i + 1} 页元素数量一致 (${sa.elements.length})`);
    else notes.push(`✗ 第 ${i + 1} 页元素数量不一致: ${sa.elements.length} vs ${sb.elements.length}`);

    const ta = [...sa.elements].filter(comparable).map((e) => e.type).sort();
    const tb = [...sb.elements].filter(comparable).map((e) => e.type).sort();
    if (JSON.stringify(ta) === JSON.stringify(tb)) notes.push(`✓ 第 ${i + 1} 页元素类型集合一致`);
    else notes.push(`✗ 第 ${i + 1} 页元素类型集合不一致`);

    const textA = sa.elements.map(elementText).filter(Boolean).sort();
    const textB = sb.elements.map(elementText).filter(Boolean).sort();
    if (JSON.stringify(textA) === JSON.stringify(textB)) notes.push(`✓ 第 ${i + 1} 页文本内容一致`);
    else notes.push(`✗ 第 ${i + 1} 页文本内容不一致`);

    const posA = sa.elements.filter(comparable).map((e) => [Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.w * 10) / 10, Math.round(e.h * 10) / 10]);
    const posB = sb.elements.filter(comparable).map((e) => [Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.w * 10) / 10, Math.round(e.h * 10) / 10]);
    if (JSON.stringify(posA) === JSON.stringify(posB)) notes.push(`✓ 第 ${i + 1} 页位置误差 < 0.1pt`);
    else notes.push(`✗ 第 ${i + 1} 页位置不一致`);
  }
  return notes;
}

export async function roundTrip(deck: Deck): Promise<RoundTripResult> {
  const export1 = await exportDeckToPptx(deck);
  const { deck: import1 } = await importPptx(export1);
  const export2 = await exportDeckToPptx(import1);
  const { deck: import2 } = await importPptx(export2);

  const notes = compareDecks(import1, import2);
  const summariesEqual =
    JSON.stringify(structuralSummary(import1)) === JSON.stringify(structuralSummary(import2));
  const ok = summariesEqual && export2.length > 0;

  return { ok, notes, export1, import1, export2, import2 };
}
