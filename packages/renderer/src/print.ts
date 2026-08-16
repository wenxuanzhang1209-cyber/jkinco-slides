import type { Deck, Theme } from '@jkinco/scene-schema';
import { escapeXml, slideToSvg } from './svg';

/**
 * Serialize a whole deck into a self-contained, print-ready HTML document.
 * Each slide is embedded as an inline SVG at 100% width; a trailing notes page
 * is appended whenever any slide carries speaker notes.
 */
export function deckToPrintHtml(deck: Deck, theme: Theme): string {
  const pages = deck.slides.map((slide) => `<div class="page">${slideToSvg(slide, theme)}</div>`).join('\n');

  const notesSlides = deck.slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) => typeof slide.notes === 'string' && slide.notes.trim().length > 0);

  let notesPage = '';
  if (notesSlides.length > 0) {
    const items = notesSlides
      .map(({ slide, index }) => `<div class="notes-item"><h2>第 ${index + 1} 页</h2><p>${escapeXml(slide.notes ?? '')}</p></div>`)
      .join('\n');
    notesPage = `<div class="page notes-page"><h1>演讲备注</h1>${items}</div>`;
  }

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(deck.title)}</title>
<style>
@page { size: 338.666mm 190.5mm landscape; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
.page { page-break-after: always; break-after: page; }
.page svg { width: 100%; height: auto; display: block; }
.notes-page { padding: 24px; font-family: sans-serif; }
.notes-page h1 { font-size: 24px; margin-bottom: 16px; }
.notes-item { margin-bottom: 16px; }
.notes-item h2 { font-size: 18px; margin-bottom: 6px; }
.notes-item p { font-size: 14px; white-space: pre-wrap; }
</style>
</head>
<body>
${pages}${notesPage ? '\n' + notesPage : ''}
</body>
</html>`;
}
