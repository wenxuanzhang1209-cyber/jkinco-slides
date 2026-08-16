import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createChart,
  createConnector,
  createDeck,
  createGroup,
  createImage,
  createShape,
  createSlide,
  createTable,
  createText,
  validateDeck,
} from '@jkinco/scene-schema';
import { importPptx, convertSmartArtToDiagram } from './import';
import { roundTrip, structuralSummary } from './roundtrip';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PNG = `data:image/png;base64,${TINY_PNG_BASE64}`;

// ---------------------------------------------------------------------------
// Handcrafted OOXML fixture builder (in-test)
// ---------------------------------------------------------------------------

const NS = {
  a: 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  r: 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  p: 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
};

function presentationXml(cx = 12192000, cy = 6858000): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS.p} ${NS.a} ${NS.r}>
  <p:sldMasterIdLst/>
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="${cx}" cy="${cy}"/>
</p:presentation>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme ${NS.a} name="Test">
  <a:themeElements>
    <a:clrScheme name="Test">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="1E56A0"/></a:accent1>
      <a:accent2><a:srgbClr val="E8A33D"/></a:accent2>
      <a:accent3><a:srgbClr val="3B82C4"/></a:accent3>
    </a:clrScheme>
    <a:fontScheme name="Test">
      <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>`;
}

function textSp(x: number, y: number, w: number, h: number, runsXml: string): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="1" name="T"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
  <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  <a:noFill/><a:ln><a:noFill/></a:ln>
</p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p>${runsXml}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
</p:sp>`;
}

function rectSp(x: number, y: number, w: number, h: number): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="R"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
  <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  <a:solidFill><a:srgbClr val="E8F0FA"/></a:solidFill>
  <a:ln w="12700"><a:solidFill><a:srgbClr val="1E56A0"/></a:solidFill></a:ln>
</p:spPr>
</p:sp>`;
}

function picSp(x: number, y: number, w: number, h: number, rId = 'rId2'): string {
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="3" name="P"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

function slideXml(shapes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS.p} ${NS.a} ${NS.r}>
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${shapes}
  </p:spTree></p:cSld>
</p:sld>`;
}

function slideRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
}

async function buildPptx(parts: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

function buildMinimalPptx(opts: { sldSzCx?: number; sldSzCy?: number; shapes?: string } = {}): Promise<Uint8Array> {
  return buildPptx({
    'ppt/presentation.xml': presentationXml(opts.sldSzCx, opts.sldSzCy),
    'ppt/theme/theme1.xml': themeXml(),
    'ppt/slides/slide1.xml': slideXml(opts.shapes ?? ''),
    'ppt/slides/_rels/slide1.xml.rels': slideRels(),
    'ppt/media/image1.png': Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0)),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importPptx round-trip', () => {
  it('round-trips a full deck with stable structural summaries', async () => {
    const deck = createDeck({
      title: '往返测试',
      slides: [
        createSlide({
          purpose: 'cover',
          elements: [createText(80, 200, 800, 60, '标题', { role: 'title', zIndex: 0 })],
        }),
        createSlide({
          purpose: 'content',
          elements: [
            createText(60, 40, 400, 40, '内容标题', { zIndex: 0 }),
            createShape('roundRect', 60, 100, 240, 120, { text: '节点', radius: 10, zIndex: 1 }),
            createImage(320, 100, 120, 120, TINY_PNG, { zIndex: 2 }),
            createChart('column', 60, 260, 400, 220, ['A', 'B'], [{ name: 'S1', data: [1, 2] }, { name: 'S2', data: [3, 4] }], { zIndex: 3 }),
            createTable(60, 500, [['h1', 'h2'], ['a', 'b']], { headerRow: true, zIndex: 4 }),
            createConnector({ x: 500, y: 100 }, { x: 800, y: 200 }, { endArrow: 'arrow', zIndex: 5 }),
            createGroup([], 500, 300, 300, 200, { name: '分组', zIndex: 6 }),
          ],
        }),
      ],
    });

    const result = await roundTrip(deck);
    expect(result.ok).toBe(true);
    expect(result.export2.length).toBeGreaterThan(0);
    expect(structuralSummary(result.import1)).toEqual(structuralSummary(result.import2));
    expect(result.import1.slides.length).toBe(result.import2.slides.length);
    for (let i = 0; i < result.import1.slides.length; i++) {
      expect(result.import1.slides[i]!.elements.length).toBe(result.import2.slides[i]!.elements.length);
    }
  });
});

describe('importPptx handcrafted OOXML', () => {
  it('imports text runs (bold + color), rect shape and image', async () => {
    const runs =
      '<a:r><a:rPr b="1" sz="2400"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Bold</a:t></a:r>' +
      '<a:r><a:rPr lang="en-US"/><a:t>Normal</a:t></a:r>';
    const data = await buildMinimalPptx({
      shapes: textSp(508000, 508000, 5080000, 762000, runs) + rectSp(508000, 1524000, 2540000, 1270000) + picSp(3810000, 1524000, 1270000, 1270000),
    });

    const { deck, report } = await importPptx(data);
    const slide = deck.slides[0]!;

    const text = slide.elements.find((e) => e.type === 'text');
    expect(text).toBeDefined();
    if (text?.type === 'text') {
      expect(text.text.paragraphs[0]!.runs).toHaveLength(2);
      expect(text.text.paragraphs[0]!.runs[0]!.bold).toBe(true);
      expect(text.text.paragraphs[0]!.runs[0]!.color).toBe('#FF0000');
      expect(text.text.paragraphs[0]!.runs[1]!.text).toBe('Normal');
    }

    const shape = slide.elements.find((e) => e.type === 'shape');
    expect(shape).toBeDefined();
    if (shape?.type === 'shape') {
      expect(shape.shape).toBe('rect');
      expect(shape.fill.color).toBe('#E8F0FA');
    }

    const image = slide.elements.find((e) => e.type === 'image');
    expect(image).toBeDefined();
    if (image?.type === 'image') {
      expect(image.src.startsWith('data:image/png;base64,')).toBe(true);
    }
    expect(report.images).toBe(1);
    expect(report.tables).toBe(0);
  });

  it('imports unsupported / action-button elements as placeholders with warnings', async () => {
    const actionButton =
      '<p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="508000" y="508000"/><a:ext cx="1270000" cy="1270000"/></a:xfrm><a:prstGeom prst="actionButtonHome"/><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></p:spPr></p:sp>';
    const badFrame =
      '<p:graphicFrame><p:nvGraphicFramePr/><p:xfrm><a:off x="2000000" y="2000000"/><a:ext cx="1270000" cy="1270000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.example.com/unknown"/></a:graphic></p:graphicFrame>';
    const data = await buildMinimalPptx({ shapes: actionButton + badFrame });

    const { deck, report } = await importPptx(data);
    expect(report.warnings.length).toBeGreaterThanOrEqual(2);
    expect(report.warnings.some((w) => w.status === 'approximation')).toBe(true);
    expect(report.warnings.some((w) => w.status === 'unsupported')).toBe(true);
    const slide = deck.slides[0]!;
    expect(slide.elements.length).toBeGreaterThanOrEqual(1);
    expect(slide.elements.every((e) => e.type === 'shape')).toBe(true);
  });

  it('scales a non-16:9 deck into 960pt width with a warning', async () => {
    // 10in × 7.5in = 9144000 × 6858000 EMU (4:3)
    const data = await buildMinimalPptx({
      sldSzCx: 9144000,
      sldSzCy: 6858000,
      shapes: rectSp(0, 0, 2286000, 2286000),
    });
    const { deck, report } = await importPptx(data);
    expect(report.warnings.some((w) => w.message.includes('非标准'))).toBe(true);
    const shape = deck.slides[0]!.elements[0];
    expect(shape).toBeDefined();
    expect(shape!.x).toBeGreaterThanOrEqual(0);
    expect(shape!.x + shape!.w).toBeLessThanOrEqual(960 + 0.5);
    expect(shape!.y + shape!.h).toBeLessThanOrEqual(540 + 0.5);
  });

  it('is deterministic: importing the same fixture twice yields deep-equal decks', async () => {
    const data = await buildMinimalPptx({ shapes: textSp(508000, 508000, 5080000, 762000, '<a:r><a:t>Hi</a:t></a:r>') });
    const a = await importPptx(data);
    const b = await importPptx(data);
    expect(JSON.stringify(a.deck)).toBe(JSON.stringify(b.deck));
  });

  it('imported deck passes validateDeck', async () => {
    const data = await buildMinimalPptx({
      shapes: textSp(508000, 508000, 5080000, 762000, '<a:r><a:t>Hi</a:t></a:r>') + rectSp(508000, 1524000, 2540000, 1270000),
    });
    const { deck } = await importPptx(data);
    const result = validateDeck(deck);
    expect(result.ok).toBe(true);
  });
});

describe('convertSmartArtToDiagram', () => {
  it('builds a hierarchy diagram from text lines', () => {
    const text = createText(40, 40, 400, 200, 'Root\nChild1\nChild2', { zIndex: 0 });
    const slide = createSlide({ elements: [text] });
    const dgm = convertSmartArtToDiagram(slide, text.id);
    expect(dgm).not.toBeNull();
    expect(dgm!.layout).toBe('hierarchy');
    expect(dgm!.nodes.map((n) => n.label)).toEqual(['Root', 'Child1', 'Child2']);
    expect(dgm!.edges).toHaveLength(2);
    expect(dgm!.edges.every((e) => e.from === dgm!.nodes[0]!.id)).toBe(true);
  });
});
