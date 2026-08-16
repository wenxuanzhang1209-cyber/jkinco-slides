/**
 * PPTX inspection helpers for tests and QA (§17 verification).
 */
import JSZip from 'jszip';

export interface PptxInspection {
  slideCount: number;
  slideXmls: string[];
  texts: string[];
  shapeCount: number;
  hasNotes: boolean;
  hasCharts: boolean;
  hasImages: boolean;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sortNumeric(names: string[]): string[] {
  return names.sort((a, b) => {
    const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    return na - nb;
  });
}

export async function inspectPptx(buffer: Uint8Array): Promise<PptxInspection> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);

  const slideFiles = sortNumeric(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)));
  const slideXmls: string[] = [];
  const texts: string[] = [];
  let shapeCount = 0;

  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async('string');
    slideXmls.push(xml);
    const tRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRe.exec(xml))) {
      if (m[1]) texts.push(decodeXml(m[1]));
    }
    shapeCount += (xml.match(/<p:sp(?:\s|>)/g) ?? []).length;
  }

  const hasNotes = files.some((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
  const hasCharts = files.some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  const hasImages = files.some((f) => /^ppt\/media\//.test(f));

  return { slideCount: slideFiles.length, slideXmls, texts, shapeCount, hasNotes, hasCharts, hasImages };
}
