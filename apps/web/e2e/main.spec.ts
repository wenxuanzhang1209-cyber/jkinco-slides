import { test, expect } from '@playwright/test';
import { createDeck, createSlide, createText, createShape } from '@jkinco/scene-schema';
import { exportDeckToPptx } from '@jkinco/pptx-export';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** §43 E2E gate: 创建 → 生成 → 选中 → 编辑 → 拖拽 → Undo → 导入 → 导出 → 分享 → 演示. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Clear only on the first load of the test (reloads keep autosave data).
    if (!sessionStorage.getItem('jkinco:e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('jkinco:e2e-init', '1');
    }
  });
  await page.goto('/');
});

test('home → generate → storyboard → build → editor (§25/§26/§9)', async ({ page }) => {
  await expect(page.getByText('你要讲什么？')).toBeVisible();
  await page.getByTestId('home-prompt').fill('帮我做一个多模态数据标注平台科研项目启动汇报，12页，给公司领导看');
  await page.getByTestId('home-generate').click();

  // §26.2 clarifying questions (audience was already in the prompt → skipped)
  const questions = page.getByTestId('generation-questions');
  await expect(questions).toBeVisible({ timeout: 8000 });
  // answer: 10分钟 + 标准商务
  await questions.getByRole('button', { name: '10分钟' }).click();
  await questions.getByRole('button', { name: '标准商务' }).click();
  await questions.getByTestId('questions-confirm').click();

  // Storyboard appears before visuals are generated (§9).
  await expect(page.getByTestId('storyboard-view')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('storyboard-list').getByText('cover')).toBeVisible();

  // Confirm → progressive build (§8.3 shows "Designing n/12").
  await page.getByTestId('storyboard-build').click();
  await expect(page.getByTestId('editor-page')).toBeVisible({ timeout: 30000 });
  const thumbs = page.getByTestId('thumbnail');
  await expect(thumbs.first()).toBeVisible();
  expect(await thumbs.count()).toBeGreaterThanOrEqual(4);
});

test('editor: select → drag → undo → double-click text edit (§7/§44)', async ({ page }) => {
  // Seed a deck directly through localStorage autosave format.
  const deck = createDeck({
    id: 'deck-e2e',
    title: 'E2E 编辑测试',
    slides: [
      createSlide({
        elements: [
          createText(40, 40, 400, 60, '双击编辑我', { id: 't1', zIndex: 0 }),
          createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1, text: '拖拽我' }),
        ],
      }),
    ],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('deck:deck-e2e')) {
      localStorage.setItem('deck:deck-e2e', raw);
      localStorage.setItem('lastDeckId', 'deck:deck-e2e');
    }
  }, JSON.stringify(deck));
  await page.goto('/');

  await expect(page.getByTestId('editor-page')).toBeVisible();

  // Drag the shape. The stage is scaled by zoomToFit — use logical→screen
  // proportional mapping (stage is always 960×540 logical units).
  const stage = page.getByTestId('slide-stage');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  const sx = (logical: number) => box!.x + (box!.width * logical) / 960;
  const sy = (logical: number) => box!.y + (box!.height * logical) / 540;
  // shape s1 occupies logical (100,100)-(300,200)
  await page.mouse.move(sx(200), sy(150));
  await page.mouse.down();
  await page.mouse.move(sx(600), sy(450), { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-overlay')).toBeVisible();

  // Undo restores the position (selection persists — overlay stays, moved back).
  await page.getByTestId('undo').click();
  await page.waitForTimeout(200);
  const restoredBox = await page.getByTestId('selection-overlay').boundingBox();
  expect(restoredBox).not.toBeNull();
  console.log('DBG offset:', restoredBox!.x - sx(100), restoredBox!.y - sy(100), 'zoom:', box!.width / 960, 'stage:', box!.x, box!.y, 'overlay:', restoredBox!.x, restoredBox!.y);
  // Overlay renders the rotated bounds (same as plain bounds at rotation 0).
  expect(Math.abs(restoredBox!.x - sx(100))).toBeLessThan(4);
  expect(Math.abs(restoredBox!.y - sy(100))).toBeLessThan(4);

  // Double-click text (logical 60,60 inside t1) → edit → commit.
  await page.mouse.dblclick(sx(60), sy(60));
  const editor = page.getByTestId('text-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill('已修改的标题');
  await page.mouse.click(sx(20), sy(500));
  // Text appears in the canvas (and live-updates the thumbnail rail §44.8).
  await expect(page.getByTestId('slide-stage').getByText('已修改的标题')).toBeVisible();
  await expect(page.getByTestId('thumbnail').first().getByText('已修改的标题')).toBeVisible();

  // Reload → autosave restored the edited deck (§15). Wait out the 800ms debounce.
  await page.waitForTimeout(1300);
  await page.reload();
  await expect(page.getByTestId('slide-stage').getByText('已修改的标题')).toBeVisible();
});

test('import PPTX → export PPTX (§16/§17 round trip in browser)', async ({ page }) => {
  // Build a fixture pptx on disk.
  const src = createDeck({
    title: '导入导出测试',
    slides: [
      createSlide({
        elements: [
          createText(40, 40, 400, 60, 'PPTX往返测试标题', { id: 't1', zIndex: 0 }),
          createShape('roundRect', 100, 150, 300, 120, { id: 's1', zIndex: 1, text: '可编辑形状' }),
        ],
      }),
    ],
  });
  const bytes = await exportDeckToPptx(src);
  const fixture = path.join(process.cwd(), 'e2e', 'fixture-roundtrip.pptx');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, Buffer.from(bytes));

  await page.getByTestId('home-file-input').setInputFiles(fixture);
  await expect(page.getByTestId('editor-page')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('slide-stage').getByText('PPTX往返测试标题')).toBeVisible();

  // Export and capture the download.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId('export-pptx').click();
  await page.getByTestId('export-pptx-action').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);

  fs.rmSync(fixture, { force: true });
});

test('presenter mode: next/prev/timer/exit (§18)', async ({ page }) => {
  const deck = createDeck({
    id: 'deck-e2e',
    slides: [
      createSlide({ elements: [createText(40, 40, 400, 60, '第一页', { id: 't1', zIndex: 0 })] }),
      createSlide({ elements: [createText(40, 40, 400, 60, '第二页', { id: 't2', zIndex: 0 })] }),
    ],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('deck:deck-e2e')) {
      localStorage.setItem('deck:deck-e2e', raw);
      localStorage.setItem('lastDeckId', 'deck:deck-e2e');
    }
  }, JSON.stringify(deck));
  await page.goto('/');
  await expect(page.getByTestId('editor-page')).toBeVisible();

  await page.getByTestId('present').click();
  await expect(page.getByTestId('presenter')).toBeVisible();
  await expect(page.getByTestId('presenter-page')).toHaveText('1 / 2');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presenter-page')).toHaveText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor-page')).toBeVisible();
});

test('share dialog + command palette + AI bar (§6/§19)', async ({ page }) => {
  const deck = createDeck({
    id: 'deck-e2e',
    slides: [createSlide({ elements: [createText(40, 40, 400, 60, '分享测试', { id: 't1', zIndex: 0 })] })],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('deck:deck-e2e')) {
      localStorage.setItem('deck:deck-e2e', raw);
      localStorage.setItem('lastDeckId', 'deck:deck-e2e');
    }
  }, JSON.stringify(deck));
  await page.goto('/');
  await expect(page.getByTestId('editor-page')).toBeVisible();

  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-url')).toBeVisible();
  await expect(page.getByTestId('perm-edit')).toBeVisible();
  await expect(page.getByTestId('perm-read')).toBeVisible();
  await expect(page.getByTestId('perm-comment')).toBeVisible();
  await page.getByTestId('perm-read').click();
  await page.getByTestId('copy-link').click();

  await page.keyboard.press('Meta+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('备选');
  await expect(page.getByText(/AI：生成 3 个备选版式/)).toBeVisible();
  await page.keyboard.press('Escape');

  // AI bar is present and focused by "/".
  await page.keyboard.press('/');
  await expect(page.getByTestId('ai-input')).toBeFocused();
});

test('AI bar applies an edit that is undoable (§27/§7.2)', async ({ page }) => {
  const deck = createDeck({
    id: 'deck-e2e',
    slides: [
      createSlide({
        elements: [
          createText(40, 40, 600, 100, '这是一段非常非常长的正文文字内容需要进行精简处理来符合页面密度要求', { id: 't1', zIndex: 0 }),
        ],
      }),
    ],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('deck:deck-e2e')) {
      localStorage.setItem('deck:deck-e2e', raw);
      localStorage.setItem('lastDeckId', 'deck:deck-e2e');
    }
  }, JSON.stringify(deck));
  await page.goto('/');
  await expect(page.getByTestId('editor-page')).toBeVisible();

  await page.getByTestId('ai-input').fill('精简一点');
  await page.getByTestId('ai-submit').click();
  // Wait for the edit toast.
  await expect(page.getByText(/AI 修改完成/).first()).toBeVisible({ timeout: 10000 });
  // Undo restores the original text.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('slide-stage').getByText('这是一段非常非常长的正文文字内容需要进行精简处理来符合页面密度要求')).toBeVisible();
});
