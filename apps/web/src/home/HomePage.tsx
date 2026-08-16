import React, { memo, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Image as ImageIcon, Presentation, Upload, Wand2 } from 'lucide-react';
import { Button, Input, toast } from '@jkinco/design-system';
import { getEngine } from '../state/appState';
import type { Deck } from '@jkinco/scene-schema';

export interface HomePageProps {
  onGenerate: (prompt: string) => void;
  onOpenEditor: () => void;
}

const RECENT_KEY = 'jkinco:recent';

export interface RecentItem {
  id: string;
  title: string;
  at: string;
}

/**
 * §25 homepage: the primary entry is always "你要讲什么？" — no template mall.
 */
export const HomePage = memo(function HomePage({ onGenerate, onOpenEditor }: HomePageProps) {
  const engine = getEngine();
  const [prompt, setPrompt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [recent] = useState<RecentItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentItem[];
    } catch {
      return [];
    }
  });

  const submit = () => {
    if (!prompt.trim()) return;
    onGenerate(prompt.trim());
  };

  const readFileAs = (file: File, as: 'arraybuffer' | 'text'): Promise<string | ArrayBuffer> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string | ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
      if (as === 'arraybuffer') reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    });

  const onImportFile = async (file: File) => {
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.pptx')) {
        const { importPptx } = await import('@jkinco/pptx-import');
        const buf = (await readFileAs(file, 'arraybuffer')) as ArrayBuffer;
        const { deck, report } = await importPptx(buf, { title: file.name.replace(/\.pptx$/i, '') });
        installDeck(deck, file.name);
        toast('PPTX 导入完成', {
          description: `${report.slideCount} 页 · ${report.elementCount} 个可编辑对象 · ${report.warnings.length} 条提示（§16 高保真导入）`,
          tone: 'success',
        });
        onOpenEditor();
      } else if (name.endsWith('.json')) {
        const deck = JSON.parse((await readFileAs(file, 'text')) as string) as Deck;
        installDeck(deck, file.name);
        toast('JSON Scene Graph 已打开', { tone: 'success' });
        onOpenEditor();
      } else {
        toast('文件已读取，将作为参考资料', { description: `${file.name}（${(file.size / 1024).toFixed(0)} KB）` });
      }
    } catch (err) {
      toast('导入失败', { description: String((err as Error)?.message ?? err), tone: 'danger' });
    }
  };

  function installDeck(deck: Deck, fileName: string) {
    deck.meta.updatedAt = new Date().toISOString();
    engine.executor.setDeck(deck);
    void engine.saveNow();
    const recent: RecentItem[] = [{ id: deck.id, title: deck.title, at: new Date().toISOString() }];
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    void fileName;
  }

  return (
    <div data-testid="home-page" className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E56A0] text-sm font-bold text-white">JK</div>
          <span className="text-[15px] font-semibold">JKinco Slides</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenEditor}>打开编辑器</Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center overflow-y-auto px-8 pt-[6vh]">
        <div className="text-[13px] font-medium uppercase tracking-[0.2em] text-[#94A3B8]">Tell it what you want to present</div>
        <h1 className="mt-3 text-4xl font-bold text-[#1E293B]">你要讲什么？</h1>

        <div className="mt-8 w-[680px] max-w-[92vw]">
          <div className="flex gap-2 rounded-xl border border-[#CBD5E1] bg-white p-2 shadow-[0_8px_32px_rgba(15,23,42,0.08)] focus-within:border-[#1E56A0] focus-within:ring-2 focus-within:ring-[#1E56A0]/15">
            <textarea
              data-testid="home-prompt"
              className="h-20 w-full resize-none border-0 px-2 py-1 text-[15px] outline-none placeholder:text-[#94A3B8]"
              placeholder="Describe your presentation…&#10;例如：帮我做一个多模态数据标注平台科研项目启动汇报，15页，给公司领导看"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button data-testid="home-generate" size="lg" onClick={submit} className="self-end">
              <Wand2 className="h-4 w-4" />
              生成
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-[#94A3B8]">上传资料：</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pptx,.json,.docx,.pdf,.xlsx,.csv,.md,.txt"
              className="hidden"
              data-testid="home-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
            <button data-testid="home-upload" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-[13px] text-[#475569] hover:border-[#1E56A0] hover:text-[#1E56A0]">
              <Upload className="h-4 w-4" />
              PPTX / 文档 / 图片
            </button>
            <span className="text-[11px] text-[#94A3B8]">拖入 PPTX 即可高保真导入</span>
          </div>

          {recent.length > 0 && (
            <div className="mt-12">
              <h2 className="text-sm font-semibold text-[#475569]">Recent</h2>
              <div className="mt-2 divide-y divide-[#F1F5F9] border-t border-[#F1F5F9]">
                {recent.map((item) => (
                  <button
                    key={item.id}
                    data-testid="recent-item"
                    className="flex w-full items-center justify-between py-2.5 text-left hover:bg-[#F8FAFC]"
                    onClick={onOpenEditor}
                  >
                    <span className="text-[13px] text-[#1E293B]">{item.title}</span>
                    <span className="text-xs text-[#94A3B8]">{formatTime(item.at)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 grid w-full grid-cols-5 gap-3 pb-10">
            {[
              [Presentation, '历史 PPT 上传', '提取 Style DNA（§10）'],
              [FileText, '申报书 → 汇报 PPT', '科研场景（§46）'],
              [FileSpreadsheet, '数据 → 图表', 'Data-native（§12）'],
              [ImageIcon, '图片素材', 'AI 图片能力（§32）'],
              [Wand2, '一句话生成', 'AI Pipeline（§4）'],
            ].map(([Icon, title, desc]) => {
              const I = Icon as typeof Presentation;
              return (
                <div key={title as string} className="rounded-xl border border-[#F1F5F9] p-4 text-center hover:border-[#CBD5E1]">
                  <I className="mx-auto h-5 w-5 text-[#1E56A0]" />
                  <div className="mt-2 text-[13px] font-medium text-[#1E293B]">{title as string}</div>
                  <div className="mt-0.5 text-[11px] text-[#94A3B8]">{desc as string}</div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60 * 60 * 1000) return `Edited ${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `Edited ${Math.round(diff / 3600000)}h ago`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
