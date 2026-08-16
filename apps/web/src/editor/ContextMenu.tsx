import React, { memo, useCallback, useEffect, useState } from 'react';
import type { SlideElement } from '@jkinco/scene-schema';
import {
  AlignCenterHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  Copy,
  CopyPlus,
  EyeOff,
  FileText,
  Group,
  Lock,
  Scissors,
  SendToBack,
  Sparkles,
  Trash2,
  Ungroup,
  Wand2,
} from 'lucide-react';
import { getEngine, useDeck, useSelection } from '../state/appState';
import { serializeElementsForCopy, pasteElements } from '@jkinco/slide-engine';
import { createElementsCommand } from '@jkinco/command-engine';
import { runAiRequest } from '../ai/aiBridge';
import { toast } from '@jkinco/design-system';

export interface ContextMenuState {
  x: number;
  y: number;
  slideId: string;
  elementIds: string[];
}

const EMPTY: ContextMenuState = { x: 0, y: 0, slideId: '', elementIds: [] };

/**
 * §13 AI 右键: AI actions exactly where they are needed, per element type.
 * Plain object actions (cut/copy/paste/delete/order) included too.
 */
export const EditorContextMenu = memo(function EditorContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const engine = getEngine();
  const deck = useDeck();
  const slide = deck.slides.find((s) => s.id === state.slideId);
  const elements = state.elementIds.map((id) => slide?.elements.find((e) => e.id === id)).filter((e): e is SlideElement => Boolean(e));
  const single = elements.length === 1 ? elements[0] : null;

  const aiAction = useCallback(
    (instruction: string) => {
      onClose();
      void runAiRequest({ instruction }).catch((err) => toast('AI 修改失败', { description: String(err?.message ?? err), tone: 'danger' }));
    },
    [onClose],
  );

  if (!slide) return null;

  const item = (label: string, icon: React.ReactNode, run: () => void, danger = false) => (
    <button
      key={label}
      data-testid={`ctx-${label}`}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#F1F5F9] ${danger ? 'text-[#C0392B]' : 'text-[#1E293B]'}`}
      onClick={() => {
        onClose();
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );

  const aiItem = (label: string, instruction: string) =>
    item(label, <Sparkles className="h-3.5 w-3.5 text-[#1E56A0]" />, () => aiAction(instruction));

  const divider = <div className="my-1 h-px bg-[#E2E8F0]" />;

  return (
    <div
      data-testid="context-menu"
      className="fixed z-40 w-56 rounded-lg border border-[#CBD5E1] bg-white p-1 shadow-[0_4px_16px_rgba(15,23,42,0.12)]"
      style={{ left: Math.min(state.x, window.innerWidth - 240), top: Math.min(state.y, window.innerHeight - 380) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* AI actions by element type (§13) */}
      {single?.type === 'text' && (
        <>
          {aiItem('精简（Shorten）', '精简一点')}
          {aiItem('改写（Rewrite）', '改写这段话')}
          {aiItem('更领导汇报（More executive）', '改得更像领导汇报')}
          {aiItem('更学术（More academic）', '改得更学术')}
          {aiItem('更清晰（Make clearer）', '说得更清楚')}
          {aiItem('翻译（Translate）', '翻译成英文')}
          {divider}
        </>
      )}
      {(single?.type === 'shape' || single?.type === 'connector' || single?.type === 'diagram' || single?.type === 'group') && (
        <>
          {aiItem('简化（Simplify）', '简化这个图形')}
          {aiItem('重新布局（Re-layout）', '重新布局')}
          {aiItem('加一步（Add step）', '加一步')}
          {aiItem('合并步骤（Merge steps）', '合并步骤')}
          {aiItem('转时间线（Convert to timeline）', '转换成时间线')}
          {aiItem('转架构图（Convert to architecture）', '转换成架构图')}
          {divider}
        </>
      )}
      {single?.type === 'image' && (
        <>
          {aiItem('替换（Replace）', '替换这张图片')}
          {aiItem('裁剪更好（Crop better）', '裁剪得更好')}
          {divider}
        </>
      )}
      {single?.type === 'chart' && (
        <>
          {aiItem('强调关键数据', '强调关键数据')}
          {aiItem('改写图表标题', '改写图表标题')}
          {divider}
        </>
      )}

      {/* slide-level AI actions */}
      {elements.length === 0 && (
        <>
          {aiItem('优化布局（Improve layout）', '优化布局')}
          {aiItem('更可视化（Make more visual）', '让页面更可视化')}
          {aiItem('减少文字（Reduce text）', '减少文字')}
          {aiItem('3 个备选版式（Alternatives）', '生成3个备选版式')}
          {aiItem('拆成 2 页（Split into 2 slides）', '拆成两页')}
          {divider}
        </>
      )}

      {/* plain object actions */}
      {elements.length > 0 && (
        <>
          {item('复制', <Copy className="h-3.5 w-3.5" />, () => copySelected())}
          {item('原位复制', <CopyPlus className="h-3.5 w-3.5" />, () => duplicateInPlace())}
          {item('剪切', <Scissors className="h-3.5 w-3.5" />, () => {
            copySelected();
            engine.deleteSelected();
          })}
          {item('删除', <Trash2 className="h-3.5 w-3.5" />, () => engine.deleteSelected(), true)}
          {divider}
          {elements.length > 1 && item('组合', <Group className="h-3.5 w-3.5" />, () => engine.groupSelected())}
          {single?.type === 'group' && item('取消组合', <Ungroup className="h-3.5 w-3.5" />, () => engine.ungroupSelected())}
          {item('置于顶层', <BringToFront className="h-3.5 w-3.5" />, () => engine.changeZOrder(state.elementIds, 'front'))}
          {item('置于底层', <SendToBack className="h-3.5 w-3.5" />, () => engine.changeZOrder(state.elementIds, 'back'))}
          {item('上移一层', <ArrowUpToLine className="h-3.5 w-3.5" />, () => engine.changeZOrder(state.elementIds, 'forward'))}
          {item('下移一层', <ArrowDownToLine className="h-3.5 w-3.5" />, () => engine.changeZOrder(state.elementIds, 'backward'))}
          {item(single?.locked ? '解锁' : '锁定', <Lock className="h-3.5 w-3.5" />, () => engine.setLocked(state.elementIds, !single?.locked))}
          {item(single?.hidden ? '显示' : '隐藏', <EyeOff className="h-3.5 w-3.5" />, () => engine.setHidden(state.elementIds, !single?.hidden))}
          {divider}
        </>
      )}
      {item('水平居中（画布）', <AlignCenterHorizontal className="h-3.5 w-3.5" />, () => engine.alignSelected('centerX', 'canvas'))}
      {item('新建页面', <FileText className="h-3.5 w-3.5" />, () => engine.insertSlide(engine.deck.slides.length))}
    </div>
  );

  function copySelected() {
    const s = engine.currentSlide;
    if (!s || state.elementIds.length === 0) return;
    const json = serializeElementsForCopy(s, state.elementIds);
    (window as unknown as { __jkincoClipboard?: string }).__jkincoClipboard = json;
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    toast('已复制', { description: '粘贴保留样式（§44.6）' });
  }

  function duplicateInPlace() {
    const s = engine.currentSlide;
    if (!s || state.elementIds.length === 0) return;
    const json = serializeElementsForCopy(s, state.elementIds);
    const pasted = pasteElements(json, { offsetX: 16, offsetY: 16 });
    if (pasted) {
      engine.apply(createElementsCommand({ slideId: s.id, elements: pasted }));
      engine.selectElements(pasted.map((el) => el.id));
    }
  }
});

/** Hook managing the right-click state. */
export function useContextMenu(onElementPick?: (els: SlideElement[]) => void): { state: ContextMenuState; openAt: (e: React.MouseEvent, elementIds: string[], slideId: string) => void; close: () => void } {
  const [state, setState] = useState<ContextMenuState | null>(null);
  useEffect(() => {
    const close = () => setState(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  }, []);
  return {
    state: state ?? EMPTY,
    openAt: (e, elementIds, slideId) => {
      e.preventDefault();
      setState({ x: e.clientX, y: e.clientY, slideId, elementIds });
    },
    close: () => setState(null),
  };
}
