import React, { memo, useEffect, useState } from 'react';
import { Check, Copy, Link2, Users } from 'lucide-react';
import { Button, Dialog, DialogContent, Input, Label, toast } from '@jkinco/design-system';
import { useDeck } from '../state/appState';
import { useCollaboration } from '../collab/useCollaboration';

/**
 * §19 sharing: permission levels, live collaborators, share link.
 */
export const ShareDialog = memo(function ShareDialog({ onClose }: { onClose: () => void }) {
  const deck = useDeck();
  const [permission, setPermission] = useState<'read' | 'comment' | 'edit'>('edit');
  const [copied, setCopied] = useState(false);
  const collab = useCollaboration();
  const others = collab.users.filter((u) => u.id !== collab.localId);

  const shareUrl = `${window.location.origin}${window.location.pathname}#share=${encodeURIComponent(deck.id)}`;

  const copyLink = () => {
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast('链接已复制', { tone: 'success' });
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="分享演示文稿" description="多人实时协作（§19）">
        <div className="space-y-4 py-2">
          <div>
            <Label>权限</Label>
            <div className="mt-1.5 flex gap-2" data-testid="permission-select">
              {([['read', '只读'], ['comment', '可评论'], ['edit', '可编辑']] as const).map(([value, label]) => (
                <button
                  key={value}
                  data-testid={`perm-${value}`}
                  className={`rounded-md border px-3 py-1.5 text-[13px] ${permission === value ? 'border-[#1E56A0] bg-[#E8F0FA] text-[#1E56A0]' : 'border-[#CBD5E1] text-[#475569]'}`}
                  onClick={() => setPermission(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>分享链接</Label>
            <div className="mt-1.5 flex gap-2">
              <Input readOnly value={shareUrl} className="font-mono text-xs" data-testid="share-url" />
              <Button size="md" onClick={copyLink} data-testid="copy-link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                复制
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
              <Users className="h-3.5 w-3.5" /> 正在协作（{others.length}）
            </div>
            <div className="mt-1.5 space-y-1" data-testid="collaborators">
              {others.length === 0 && <div className="text-xs text-[#94A3B8]">暂无其他协作者。在另一个浏览器标签打开链接即可实时协作。</div>}
              {others.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-[13px] text-[#1E293B]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: u.color }} />
                  {u.name}
                  <span className="text-[11px] text-[#94A3B8]">{u.cursor ? `在 ${u.cursor.slideId.slice(0, 6)} 页` : '在线'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end border-t border-[#E2E8F0] pt-3">
            <Button variant="ghost" onClick={onClose}>关闭</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
