import React, { memo, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Kbd } from '@jkinco/design-system';
import { SHORTCUTS } from '@jkinco/slide-engine';
import { getEngine } from '../state/appState';

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * ⌘K Command Palette (§6 bottom bar): actions + AI commands + shortcuts help.
 */
export const CommandPalette = memo(function CommandPalette({ onClose }: { onClose: () => void }) {
  const engine = getEngine();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const actions: PaletteAction[] = [
    { id: 'ai-shorten', label: 'AI：精简当前页文字', hint: 'Shorten', run: () => void import('../ai/aiBridge').then((m) => m.runAiRequest({ instruction: '精简一点' })) },
    { id: 'ai-visual', label: 'AI：让页面更可视化', hint: 'Make visual', run: () => void import('../ai/aiBridge').then((m) => m.runAiRequest({ instruction: '让页面更可视化' })) },
    { id: 'ai-alternatives', label: 'AI：生成 3 个备选版式', hint: 'Alternatives', run: () => void import('../ai/aiBridge').then((m) => m.runAiRequest({ instruction: '生成3个备选版式' })) },
    { id: 'ai-timeline', label: 'AI：转换时间线布局', run: () => void import('../ai/aiBridge').then((m) => m.runAiRequest({ instruction: '转换成时间线' })) },
    { id: 'ai-architecture', label: 'AI：转换架构图布局', run: () => void import('../ai/aiBridge').then((m) => m.runAiRequest({ instruction: '转换成架构图' })) },
    { id: 'add-slide', label: '新建页面', hint: 'Insert slide', run: () => engine.insertSlide(engine.deck.slides.length) },
    { id: 'duplicate-slide', label: '复制当前页', hint: '⌘D', run: () => engine.duplicateSlide() },
    { id: 'group', label: '组合选中对象', hint: '⌘G', run: () => engine.groupSelected() },
    { id: 'align-center', label: '水平居中（画布）', run: () => engine.alignSelected('centerX', 'canvas') },
    { id: 'present', label: '开始演示', hint: '⌘⇧P', run: () => document.dispatchEvent(new CustomEvent('jkinco:present')) },
    { id: 'zoom-fit', label: '适合窗口', hint: '⇧1', run: () => { const el = document.querySelector<HTMLElement>('[data-testid="zoom-fit"]'); el?.click(); } },
    { id: 'save', label: '保存', hint: '⌘S', run: () => void engine.saveNow() },
  ];

  const shortcuts = SHORTCUTS.map((s) => ({ id: `help-${s.id}`, label: `${s.description}`, hint: s.keys[0]?.replace('mod', '⌘').replace('shift', '⇧') ?? '', run: () => undefined }));

  const filtered = [...actions, ...shortcuts].filter((a) => {
    if (!query.trim()) return actions.includes(a);
    return a.label.toLowerCase().includes(query.toLowerCase()) || (a.hint ?? '').toLowerCase().includes(query.toLowerCase());
  });

  const visible = query.trim() ? filtered : actions;
  const clamped = Math.min(activeIndex, Math.max(0, visible.length - 1));

  const run = (action: PaletteAction) => {
    onClose();
    action.run();
  };

  return (
    <div data-testid="command-palette" className="fixed inset-0 z-45 flex items-start justify-center bg-black/30 pt-[14vh]" onMouseDown={onClose}>
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.2)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-4">
          <Search className="h-4 w-4 text-[#94A3B8]" />
          <input
            ref={inputRef}
            data-testid="palette-input"
            className="h-11 w-full text-sm outline-none placeholder:text-[#94A3B8]"
            placeholder="输入命令或 AI 指令…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter' && visible[clamped]) {
                const action = visible[clamped]!;
                if (action.id.startsWith('help-')) return;
                run(action);
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5" data-testid="palette-list">
          {visible.length === 0 && <div className="px-3 py-6 text-center text-sm text-[#94A3B8]">没有匹配的命令</div>}
          {visible.map((action, i) => (
            <button
              key={action.id}
              data-testid={`palette-item-${action.id}`}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] ${i === clamped ? 'bg-[#E8F0FA] text-[#1E56A0]' : 'text-[#1E293B]'}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                if (action.id.startsWith('help-')) return;
                run(action);
              }}
            >
              <span>{action.label}</span>
              {action.hint && <span className="font-mono text-[11px] text-[#94A3B8]">{action.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
