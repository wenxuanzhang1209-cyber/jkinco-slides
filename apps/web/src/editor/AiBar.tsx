import React, { memo, useRef, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { toast } from '@jkinco/design-system';
import { getEngine, useSelection } from '../state/appState';
import { runAiRequest } from '../ai/aiBridge';

/**
 * §6 bottom AI bar: low-interference command area.
 * ⌘K focuses it; "/" too. AI edits flow through the Command System.
 */
export const AiBar = memo(function AiBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const engine = getEngine();
  const selection = useSelection();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const scopeLabel = scopeLabelFor(selection);

  const submit = async () => {
    const instruction = value.trim();
    if (!instruction || busy) return;
    setBusy(true);
    try {
      const result = await runAiRequest({ instruction });
      if (result) {
        toast('AI 修改完成', { description: result.explanation, tone: 'success' });
      }
      setValue('');
    } catch (err) {
      toast('AI 修改失败', { description: String((err as Error)?.message ?? err), tone: 'danger' });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div data-testid="ai-bar" className="flex h-12 items-center gap-2 border-t border-[#E2E8F0] bg-white px-4">
      <button
        data-testid="palette-trigger"
        className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-2 py-1 text-xs text-[#475569] hover:bg-[#F1F5F9]"
        onClick={onOpenPalette}
      >
        <Sparkles className="h-3.5 w-3.5 text-[#1E56A0]" />
        ⌘K
      </button>
      <span data-testid="ai-scope" className="hidden rounded-md bg-[#E8F0FA] px-2 py-1 text-xs font-medium text-[#1E56A0] sm:inline">
        {scopeLabel}
      </span>
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 focus-within:border-[#1E56A0]">
        <Wand2 className="h-4 w-4 shrink-0 text-[#94A3B8]" />
        <input
          ref={inputRef}
          data-testid="ai-input"
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-[#94A3B8]"
          placeholder="Ask AI to edit this slide…（例如：精简一点 / 换成技术路线 / 生成 3 个备选版式）"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>
      <button
        data-testid="ai-submit"
        className="flex h-8 items-center gap-1.5 rounded-md bg-[#1E56A0] px-3 text-[13px] font-medium text-white hover:bg-[#163E75] disabled:opacity-50"
        disabled={busy || !value.trim()}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        修改
      </button>
    </div>
  );

  function scopeLabelFor(sel: { elementIds: string[]; slideIds: string[] }): string {
    if (sel.elementIds.length === 1) return '作用于：选中对象';
    if (sel.elementIds.length > 1) return `作用于：选中 ${sel.elementIds.length} 个对象`;
    if (sel.slideIds.length > 1) return '作用于：所选页面';
    return '作用于：当前页';
  }
});
