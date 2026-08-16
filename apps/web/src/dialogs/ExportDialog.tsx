import React, { memo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Dialog, DialogContent, Progress, Spinner, toast } from '@jkinco/design-system';
import { getEngine, useDeck } from '../state/appState';
import { downloadBlob } from '../editor/TopBar';

/**
 * PPTX export (§17): true objects — text stays text, shapes stay shapes.
 * Export runs in the background and the editor stays usable.
 */
export const ExportDialog = memo(function ExportDialog({ onClose }: { onClose: () => void }) {
  const engine = getEngine();
  const deck = useDeck();
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const exportPptx = async () => {
    setBusy(true);
    try {
      const { exportDeckToPptx } = await import('@jkinco/pptx-export');
      const data = await exportDeckToPptx(deck, {
        progress: (done, total) => setProgress(Math.round((done / Math.max(total, 1)) * 100)),
      });
      downloadBlob(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${deck.title || 'presentation'}.pptx`);
      toast('导出成功', { description: 'PowerPoint 打开后仍是原生可编辑对象', tone: 'success' });
      onClose();
    } catch (err) {
      toast('导出失败', { description: String((err as Error)?.message ?? err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const exportPng = async () => {
    setBusy(true);
    try {
      const { slideToSvg } = await import('@jkinco/renderer');
      const { getTheme } = await import('@jkinco/scene-schema');
      const slide = engine.currentSlide;
      if (!slide) return;
      const svg = slideToSvg(slide, getTheme(deck.themeId));
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, `slide-${deck.slides.indexOf(slide) + 1}.png`);
          URL.revokeObjectURL(url);
          toast('PNG 导出成功', { tone: 'success' });
          onClose();
        }, 'image/png');
      };
      img.src = url;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="导出演示文稿" description="§17 导出的是真 PPT，不是截图 PPT">
        <div className="space-y-3 py-2">
          <button
            data-testid="export-pptx-action"
            disabled={busy}
            onClick={() => void exportPptx()}
            className="flex w-full items-center gap-3 rounded-lg border border-[#CBD5E1] p-3 text-left hover:border-[#1E56A0] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <Download className="h-5 w-5 text-[#1E56A0]" />
            <div className="flex-1">
              <div className="text-sm font-medium text-[#1E293B]">PPTX（推荐）</div>
              <div className="text-xs text-[#94A3B8]">文本/形状/箭头/图表/表格全部保持原生可编辑</div>
            </div>
            {busy && <Spinner />}
          </button>
          <button
            data-testid="export-png-action"
            disabled={busy}
            onClick={() => void exportPng()}
            className="flex w-full items-center gap-3 rounded-lg border border-[#CBD5E1] p-3 text-left hover:border-[#1E56A0] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <Download className="h-5 w-5 text-[#475569]" />
            <div className="flex-1">
              <div className="text-sm font-medium text-[#1E293B]">PNG（当前页）</div>
              <div className="text-xs text-[#94A3B8]">1920×1080 高清位图</div>
            </div>
          </button>
          {busy && (
            <div className="flex items-center gap-2">
              <Progress value={progress} className="flex-1" />
              <span className="text-xs text-[#475569]">{progress}%</span>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>取消</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
