import React, { memo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Dialog, DialogContent, Input, Label, Switch, toast } from '@jkinco/design-system';
import { getEngine, useDeck } from '../state/appState';
import { createBrandKit, applyBrandKit, lockRule, unlockRule, isRuleLocked, validateBrandKit, BRAND_RULES, type BrandKit, type BrandRule } from '@jkinco/brand-engine';
import { getTheme } from '@jkinco/scene-schema';

const LOCAL_KEY = 'jkinco:brandKit';

/**
 * §30 enterprise Brand Kit: logo, colors, fonts, footer, confidentiality,
 * watermark; admin-locked rules.
 */
export const BrandKitDialog = memo(function BrandKitDialog({ onClose }: { onClose: () => void }) {
  const engine = getEngine();
  const deck = useDeck();
  const theme = getTheme(deck.themeId);
  const [kit, setKit] = useState<BrandKit>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return JSON.parse(raw) as BrandKit;
    } catch {
      // ignore
    }
    return createBrandKit({ name: '我的企业品牌', colors: { primary: theme.colors.primary } });
  });
  const [logo, setLogo] = useState<string | undefined>(kit.logo);

  const update = (patch: Partial<BrandKit>) => setKit((k) => ({ ...k, ...patch }));

  const apply = () => {
    const errors = validateBrandKit(kit);
    if (errors.length > 0) {
      toast('品牌套件配置有误', { description: errors[0], tone: 'danger' });
      return;
    }
    const next = applyBrandKit(deck, { ...kit, logo }, theme);
    engine.executor.setDeck(next, { resetHistory: false });
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...kit, logo }));
    toast('品牌套件已应用', { description: 'Logo、页脚、保密标识、水印已应用到全部页面', tone: 'success' });
  };

  const toggleLock = (rule: BrandRule) => {
    update(isRuleLocked(kit, rule) ? unlockRule(kit, rule) : lockRule(kit, rule));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="企业 Brand Kit" description="管理员可锁定品牌规则（§30）">
        <div className="space-y-4 py-2">
          <div>
            <Label>品牌名称</Label>
            <Input className="mt-1" value={kit.name} onChange={(e) => update({ name: e.target.value })} data-testid="brand-name" />
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Logo</Label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setLogo(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </div>
            {logo && <img src={logo} alt="logo" className="h-9 rounded border border-[#E2E8F0] bg-white p-0.5" />}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>主色</Label>
              <input type="color" className="mt-1 h-8 w-full rounded border border-[#CBD5E1]" value={kit.colors?.primary ?? theme.colors.primary} onChange={(e) => update({ colors: { ...kit.colors, primary: e.target.value } })} />
            </div>
            <div>
              <Label>辅色</Label>
              <input type="color" className="mt-1 h-8 w-full rounded border border-[#CBD5E1]" value={kit.colors?.secondary ?? theme.colors.secondary} onChange={(e) => update({ colors: { ...kit.colors, secondary: e.target.value } })} />
            </div>
            <div>
              <Label>强调色</Label>
              <input type="color" className="mt-1 h-8 w-full rounded border border-[#CBD5E1]" value={kit.colors?.accent ?? theme.colors.accent} onChange={(e) => update({ colors: { ...kit.colors, accent: e.target.value } })} />
            </div>
          </div>

          <div>
            <Label>页脚文字</Label>
            <Input className="mt-1" placeholder="例如：上海建科咨询" value={kit.footer?.text ?? ''} onChange={(e) => update({ footer: { ...kit.footer, text: e.target.value } })} />
          </div>

          <div>
            <Label>保密标识</Label>
            <Input className="mt-1" placeholder="例如：内部资料 · 注意保密" value={kit.confidentiality ?? ''} onChange={(e) => update({ confidentiality: e.target.value })} data-testid="confidentiality" />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={Boolean(kit.watermark)}
              onCheckedChange={(v) => update({ watermark: v ? { text: kit.watermark?.text ?? '内部资料', opacity: kit.watermark?.opacity ?? 0.08 } : undefined })}
              aria-label="水印"
            />
            <Label>添加全页水印</Label>
          </div>

          <div>
            <Label>锁定规则（管理员）</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BRAND_RULES.map((rule) => (
                <button
                  key={rule}
                  data-testid={`lock-${rule}`}
                  className={`rounded-md border px-2 py-1 text-[11px] ${isRuleLocked(kit, rule) ? 'border-[#1E56A0] bg-[#E8F0FA] text-[#1E56A0]' : 'border-[#CBD5E1] text-[#475569]'}`}
                  onClick={() => toggleLock(rule)}
                >
                  {isRuleLocked(kit, rule) ? '🔒 ' : ''}{rule}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button data-testid="apply-brand" onClick={apply}>
              <Building2 className="h-4 w-4" /> 应用到全部页面
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
