import { describe, expect, it } from 'vitest';
import {
  createChart,
  createConnector,
  createDeck,
  createImage,
  createShape,
  createSlide,
  createTable,
  createText,
} from '@jkinco/scene-schema';
import { exportDeckToPptx, inspectPptx } from './index';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function buildDemoDeck() {
  const cover = createSlide({
    purpose: 'cover',
    notes: '这是第一页的备注',
    elements: [createText(80, 200, 800, 60, '演示文稿标题', { role: 'title', zIndex: 0 })],
  });
  const content = createSlide({
    purpose: 'content',
    elements: [
      createShape('roundRect', 60, 60, 260, 140, {
        text: '重点结论',
        fill: { type: 'solid', color: '#E8F0FA', opacity: 1 },
        stroke: { color: '#1E56A0', width: 2, style: 'solid' },
        radius: 12,
        zIndex: 1,
      }),
      createImage(360, 60, 120, 120, TINY_PNG, { zIndex: 2 }),
      createConnector({ x: 60, y: 300 }, { x: 300, y: 380 }, {
        startArrow: 'dot',
        endArrow: 'arrow',
        stroke: { color: '#475569', width: 2, style: 'dashed' },
        zIndex: 3,
      }),
      createChart('column', 380, 220, 400, 240, ['Q1', 'Q2', 'Q3'], [
        { name: '营收', data: [10, 20, 30], color: '#1E56A0' },
        { name: '成本', data: [6, 12, 18], color: '#E8A33D' },
      ], { zIndex: 4 }),
      createTable(60, 420, [
        ['阶段', '任务'],
        ['一', '数据采集'],
        ['二', '模型训练'],
      ], { headerRow: true, zIndex: 5 }),
    ],
  });
  return createDeck({ title: '测试演示', slides: [cover, content] });
}

describe('exportDeckToPptx', () => {
  it('exports text, shape, image, connector, chart, table and notes natively', async () => {
    const deck = buildDemoDeck();
    const data = await exportDeckToPptx(deck);
    expect(data.length).toBeGreaterThan(0);

    const ins = await inspectPptx(data);
    expect(ins.slideCount).toBe(2);
    expect(ins.shapeCount).toBeGreaterThan(0);
    expect(ins.texts.some((t) => t.includes('演示文稿标题'))).toBe(true);
    expect(ins.hasNotes).toBe(true);
    expect(ins.hasCharts).toBe(true);
    expect(ins.hasImages).toBe(true);
  });

  it('exports an empty deck without throwing', async () => {
    const data = await exportDeckToPptx(createDeck({ title: '空演示' }));
    expect(data.length).toBeGreaterThan(0);
    const ins = await inspectPptx(data);
    expect(ins.slideCount).toBeGreaterThanOrEqual(1);
  });

  it('produces deterministic slide counts and text content', async () => {
    const deck = buildDemoDeck();
    const a = await inspectPptx(await exportDeckToPptx(deck));
    const b = await inspectPptx(await exportDeckToPptx(deck));
    expect(a.slideCount).toBe(b.slideCount);
    expect([...a.texts].sort()).toEqual([...b.texts].sort());
  });

  it('writes text color into the slide XML', async () => {
    const slide = createSlide({
      elements: [
        createText(40, 40, 400, 50, '红色文字', {
          style: { color: '#FF0000', fontSize: 24, bold: true },
          zIndex: 0,
        }),
      ],
    });
    const data = await exportDeckToPptx(createDeck({ title: '颜色', slides: [slide] }));
    const ins = await inspectPptx(data);
    expect(ins.slideXmls.join('\n')).toContain('FF0000');
  });

  it('invokes the progress callback with (1..total)', async () => {
    const calls: Array<[number, number]> = [];
    await exportDeckToPptx(buildDemoDeck(), {
      progress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
