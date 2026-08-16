import React, { memo, useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button, Dialog, DialogContent, Input, toast } from '@jkinco/design-system';
import { getEngine } from '../state/appState';
import type { NamedVersion } from '@jkinco/scene-schema';

/**
 * §34 version history: named checkpoints, compare-ready snapshots, restore.
 */
export const HistoryDialog = memo(function HistoryDialog({ onClose }: { onClose: () => void }) {
  const engine = getEngine();
  const [versions, setVersions] = useState<NamedVersion[]>([]);
  const [name, setName] = useState('');

  const refresh = () => {
    void engine.listVersions().then(setVersions);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="版本历史" description="重要修改自动保存 checkpoint（§34）">
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Input data-testid="version-name" placeholder="版本名称，例如：v1 初稿" value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              data-testid="save-version"
              onClick={() => {
                if (!name.trim()) return;
                void engine.saveNamedVersion(name.trim()).then(() => {
                  setName('');
                  refresh();
                  toast('已保存版本', { tone: 'success' });
                });
              }}
            >
              保存 checkpoint
            </Button>
          </div>
          <div data-testid="version-list" className="space-y-1">
            {versions.length === 0 && (
              <div className="flex items-center gap-2 py-4 text-sm text-[#94A3B8]">
                <History className="h-4 w-4" /> 还没有命名版本 — 保存一个 checkpoint 以便日后对比和恢复
              </div>
            )}
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-[#E2E8F0] px-3 py-2">
                <div>
                  <div className="text-[13px] font-medium text-[#1E293B]">{v.name}</div>
                  <div className="text-[11px] text-[#94A3B8]">{new Date(v.at).toLocaleString()}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid={`restore-version`}
                  onClick={() => {
                    void engine.restoreNamedVersion(v.id).then((ok) => {
                      toast(ok ? '已恢复该版本' : '恢复失败', { tone: ok ? 'success' : 'danger' });
                      if (ok) onClose();
                    });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 恢复
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
