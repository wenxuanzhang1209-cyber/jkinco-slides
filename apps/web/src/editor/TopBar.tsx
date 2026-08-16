import React, { memo, useState } from 'react';
import {
  Download,
  Eye,
  History,
  MonitorPlay,
  Palette,
  Redo2,
  Share2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { THEMES } from '@jkinco/scene-schema';
import { getEngine, useCanUndoRedo, useDeck } from '../state/appState';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Badge, Kbd, toast } from '@jkinco/design-system';
import { ExportDialog } from '../dialogs/ExportDialog';
import { ShareDialog } from '../dialogs/ShareDialog';
import { HistoryDialog } from '../dialogs/HistoryDialog';
import { BrandKitDialog } from '../dialogs/BrandKitDialog';
import { applyThemeToDeck } from '@jkinco/style-engine';
import { applyThemeCommand } from '@jkinco/command-engine';

export interface TopBarProps {
  onPresent: () => void;
  onHome: () => void;
  onStoryboard: () => void;
}

export const TopBar = memo(function TopBar({ onPresent, onHome, onStoryboard }: TopBarProps) {
  const engine = getEngine();
  const deck = useDeck();
  const { canUndo, canRedo } = useCanUndoRedo();
  const [titleEditing, setTitleEditing] = useState(false);
  const [dialog, setDialog] = useState<'export' | 'share' | 'history' | 'brand' | null>(null);

  const applyTheme = (themeId: string) => {
    const next = applyThemeToDeck(deck, themeId);
    engine.executor.setDeck(next, { resetHistory: false });
    engine.executor.apply({ ...requireThemeCommand(themeId) });
  };

  return (
    <div data-testid="top-bar" className="flex h-12 items-center gap-2 border-b border-[#E2E8F0] bg-white px-3">
      <button className="flex items-center gap-2" onClick={onHome} aria-label="返回首页">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1E56A0] text-[13px] font-bold text-white">JK</div>
        <span className="text-sm font-semibold text-[#1E293B]">JKinco Slides</span>
      </button>

      <div className="mx-2 h-5 w-px bg-[#E2E8F0]" />

      {titleEditing ? (
        <input
          data-testid="deck-title-input"
          autoFocus
          defaultValue={deck.title}
          className="h-8 rounded-md border border-[#CBD5E1] px-2 text-sm outline-none focus:border-[#1E56A0]"
          onBlur={(e) => {
            const title = e.target.value.trim() || deck.title;
            engine.executor.setDeck({ ...deck, title }, { resetHistory: false });
            setTitleEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTitleEditing(false);
          }}
        />
      ) : (
        <button data-testid="deck-title" className="max-w-[280px] truncate rounded-md px-2 py-1 text-sm font-medium text-[#1E293B] hover:bg-[#F1F5F9]" onClick={() => setTitleEditing(true)}>
          {deck.title}
        </button>
      )}

      <div className="ml-1 flex items-center gap-0.5">
        <button data-testid="undo" className="rounded-md p-1.5 text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-30" disabled={!canUndo} onClick={() => engine.undo()} aria-label="撤销">
          <Undo2 className="h-4 w-4" />
        </button>
        <button data-testid="redo" className="rounded-md p-1.5 text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-30" disabled={!canRedo} onClick={() => engine.redo()} aria-label="重做">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="theme-menu" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-[#475569] hover:bg-[#F1F5F9]">
            <Palette className="h-4 w-4" />
            <span className="hidden lg:inline">{THEMES.find((t) => t.id === deck.themeId)?.name ?? '主题'}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {THEMES.map((t) => (
            <DropdownMenuItem key={t.id} data-testid={`theme-${t.id}`} onSelect={() => applyTheme(t.id)}>
              <span className="inline-block h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: t.colors.primary }} />
              {t.name}
              {deck.themeId === t.id && <Badge tone="primary">当前</Badge>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button data-testid="brand-kit" className="rounded-md p-1.5 text-[#475569] hover:bg-[#F1F5F9]" onClick={() => setDialog('brand')} aria-label="企业品牌套件">
        <span className="text-[13px]">🏢</span>
      </button>
      <button data-testid="history" className="rounded-md p-1.5 text-[#475569] hover:bg-[#F1F5F9]" onClick={() => setDialog('history')} aria-label="版本历史">
        <History className="h-4 w-4" />
      </button>
      <button data-testid="storyboard" className="rounded-md px-2 py-1.5 text-[13px] text-[#475569] hover:bg-[#F1F5F9]" onClick={onStoryboard}>
        <span className="hidden lg:inline">Storyboard</span>
        <span className="lg:hidden">🗂</span>
      </button>
      <button data-testid="share" className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#1E56A0] hover:bg-[#E8F0FA]" onClick={() => setDialog('share')}>
        <Share2 className="h-4 w-4" />
        <span className="ml-1 hidden lg:inline">分享</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="export-menu" className="flex items-center gap-1.5 rounded-md bg-[#1E56A0] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#163E75]">
            <Download className="h-4 w-4" />
            导出
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem data-testid="export-pptx" onSelect={() => setDialog('export')}>
            PPTX（PowerPoint 原生对象）
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void exportJson(); }}>
            JSON Scene Graph
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void exportSvg(); }}>
            SVG（当前页）
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void exportPrint(); }}>
            PDF（打印视图）
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        data-testid="present"
        className="flex items-center gap-1.5 rounded-md bg-[#E8F0FA] px-3 py-1.5 text-[13px] font-medium text-[#1E56A0] hover:bg-[#D8E6F7]"
        onClick={onPresent}
      >
        <MonitorPlay className="h-4 w-4" />
        演示
        <Kbd className="hidden xl:inline-flex">⌘⇧P</Kbd>
      </button>

      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === 'brand' && <BrandKitDialog onClose={() => setDialog(null)} />}
    </div>
  );

  async function exportJson() {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${deck.title || 'deck'}.json`);
  }

  async function exportSvg() {
    const { slideToSvg } = await import('@jkinco/renderer');
    const { getTheme } = await import('@jkinco/scene-schema');
    const slide = engine.currentSlide;
    if (!slide) return toast('没有可导出的页面', { tone: 'danger' });
    const svg = slideToSvg(slide, getTheme(deck.themeId));
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `slide-${deck.slides.indexOf(slide) + 1}.svg`);
  }

  async function exportPrint() {
    const { deckToPrintHtml } = await import('@jkinco/renderer');
    const { getTheme } = await import('@jkinco/scene-schema');
    const html = deckToPrintHtml(deck, getTheme(deck.themeId));
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  }
});

function requireThemeCommand(themeId: string) {
  return applyThemeCommand({ themeId, restyle: false }, { label: '切换主题' });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { downloadBlob };
