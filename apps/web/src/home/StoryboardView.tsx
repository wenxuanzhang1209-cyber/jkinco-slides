import React, { memo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, Plus, Trash2, Type, BarChart3, GitBranch, Image as ImageIcon } from 'lucide-react';
import { Button, toast } from '@jkinco/design-system';
import type { Storyboard, StoryboardOp, StoryboardSlide } from '@jkinco/ai-planner';
import { applyStoryboardOps } from '@jkinco/ai-planner';

export interface StoryboardViewProps {
  storyboard: Storyboard;
  onBack: () => void;
  onBuild: (storyboard: Storyboard) => void;
}

const CONTENT_TYPES: Array<{ value: StoryboardSlide['contentType']; label: string; icon: typeof Type }> = [
  { value: 'text', label: '文字为主', icon: Type },
  { value: 'visual', label: '图为主', icon: ImageIcon },
  { value: 'data', label: '数据为主', icon: BarChart3 },
  { value: 'diagram', label: '图示为主', icon: GitBranch },
];

/**
 * §9 Storyboard: confirm the story BEFORE generating visuals —
 * reorder, delete, merge, add, edit the core message per page.
 */
export const StoryboardView = memo(function StoryboardView({ storyboard, onBack, onBuild }: StoryboardViewProps) {
  const [board, setBoard] = useState<Storyboard>(storyboard);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const opsRef = useRef<StoryboardOp[]>([]);

  const apply = (ops: StoryboardOp[]) => {
    setBoard((b) => applyStoryboardOps(b, ops));
  };

  return (
    <div data-testid="storyboard-view" className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b border-[#E2E8F0] px-8 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="storyboard-back">
            <ArrowLeft className="h-4 w-4" /> 返回
          </Button>
          <div>
            <h1 className="text-[15px] font-semibold">Storyboard — 先确认故事线，再生成视觉稿</h1>
            <p className="text-xs text-[#94A3B8]">目标：{board.goal} · 听众：{board.audience}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="storyboard-add" onClick={() => apply([{ type: 'add', index: board.slides.length, slide: {} }])}>
            <Plus className="h-4 w-4" /> 加一页
          </Button>
          <Button data-testid="storyboard-build" onClick={() => onBuild(board)}>
            确认并生成 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-2" data-testid="storyboard-list">
          {board.slides.map((slide, index) => (
            <div
              key={slide.id}
              data-testid={`storyboard-slide-${index}`}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== index) {
                  apply([{ type: 'reorder', from: dragFrom, to: index }]);
                  setDragFrom(index);
                }
              }}
              onDragEnd={() => setDragFrom(null)}
              className="group flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 hover:border-[#CBD5E1] hover:shadow-sm"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#CBD5E1]" />
              <span className="w-10 shrink-0 font-mono text-[13px] font-semibold text-[#94A3B8]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="w-28 shrink-0">
                <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium uppercase text-[#475569]">{slide.purpose}</span>
              </div>
              <div className="min-w-0 flex-1">
                <input
                  className="w-full border-0 bg-transparent text-sm font-medium text-[#1E293B] outline-none hover:bg-[#F8FAFC]"
                  value={slide.title}
                  onChange={(e) => apply([{ type: 'editTitle', index, title: e.target.value }])}
                  data-testid={`storyboard-title-${index}`}
                />
                <input
                  className="w-full border-0 bg-transparent text-xs text-[#475569] outline-none hover:bg-[#F8FAFC]"
                  value={slide.message}
                  onChange={(e) => apply([{ type: 'editMessage', index, message: e.target.value }])}
                  data-testid={`storyboard-message-${index}`}
                  placeholder="这一页的核心信息…"
                />
              </div>
              <div className="flex shrink-0 gap-1">
                {CONTENT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    data-testid={`storyboard-type-${value}-${index}`}
                    title={label}
                    className={`rounded-md p-1.5 ${slide.contentType === value ? 'bg-[#E8F0FA] text-[#1E56A0]' : 'text-[#CBD5E1] hover:text-[#475569]'}`}
                    onClick={() => apply([{ type: 'setContentType', index, contentType: value }])}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
                {index > 0 && (
                  <button
                    data-testid={`storyboard-merge-${index}`}
                    title="合并到上一页"
                    className="rounded-md p-1.5 text-[#CBD5E1] hover:text-[#475569]"
                    onClick={() => apply([{ type: 'merge', indexes: [index - 1, index] }])}
                  >
                    ⤴
                  </button>
                )}
                <button
                  data-testid={`storyboard-delete-${index}`}
                  title="删除"
                  className="rounded-md p-1.5 text-[#CBD5E1] hover:text-[#C0392B]"
                  onClick={() => {
                    if (board.slides.length <= 2) return;
                    apply([{ type: 'delete', index }]);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-6 max-w-3xl rounded-lg bg-[#F8FAFC] px-4 py-3 text-xs text-[#94A3B8]">
          <Check className="mr-1 inline h-3.5 w-3.5" />
          确认故事线后，AI 会控制每页文字量、自动画技术路线、自动生成图表，并通过 Visual QA 自检（§15）
        </div>
      </div>
    </div>
  );
});
