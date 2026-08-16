import React, { memo, useEffect, useState } from 'react';
import type { SlideElement } from '@jkinco/scene-schema';
import { getTheme, textFromPlain, textToPlain } from '@jkinco/scene-schema';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  SendToBack,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button, IconButton, Input, Label, Switch, toast } from '@jkinco/design-system';
import { replaceAssetCommand, updateChartDataCommand, updateElementPropsCommand, updateSlidePropsCommand } from '@jkinco/command-engine';
import { applyAutoFixes } from '@jkinco/qa-engine';
import { getEngine, useDeck, useSelection } from '../state/appState';
import { useQaReport } from '../qa/useQa';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label>{label}</Label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-[#CBD5E1] bg-white p-0.5" aria-label={label} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-24 font-mono text-xs" />
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-12 shrink-0">{label}</Label>
      <Input
        type="number"
        value={Math.round(value * 10) / 10}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="h-7 font-mono text-xs"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export const Inspector = memo(function Inspector() {
  const engine = getEngine();
  const deck = useDeck();
  const selection = useSelection();
  const slide = deck.slides.find((s) => s.id === selection.slideId);
  const theme = getTheme(deck.themeId);
  const selected = selection.elementIds
    .map((id) => slide?.elements.find((e) => e.id === id))
    .filter((e): e is SlideElement => Boolean(e));
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div data-testid="inspector" className="flex h-full w-72 flex-col border-l border-[#E2E8F0] bg-white">
      <div className="border-b border-[#E2E8F0] px-4 py-2.5 text-[13px] font-semibold text-[#1E293B]">
        {single ? (single.name ?? '元素') : selected.length > 1 ? `多选（${selected.length}）` : '页面设计'}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {selected.length === 0 && slide && <SlidePanel slideId={slide.id} themeId={deck.themeId} />}
        {selected.length > 1 && <MultiSelectPanel slideId={slide?.id} ids={selection.elementIds} />}
        {single && slide && <ElementPanel element={single} slideId={slide.id} themeId={deck.themeId} />}
      </div>
      <div className="border-t border-[#E2E8F0] px-4 py-2 text-[11px] text-[#94A3B8]">
        对象级可编辑 · AI 与您使用同一套编辑命令
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------

function SlidePanel({ slideId, themeId }: { slideId: string; themeId: string }) {
  const engine = getEngine();
  const deck = useDeck();
  const slide = deck.slides.find((s) => s.id === slideId)!;
  const [notes, setNotes] = useState(slide.notes ?? '');
  useEffect(() => setNotes(slide.notes ?? ''), [slide.notes]);
  const qa = useQaReport(deck, slideId);

  const density = qa.density;
  const bandColor = density.band === 'good' ? '#1F9D55' : density.band === 'warn' ? '#B98A2F' : density.band === 'auto_suggest' ? '#E8A33D' : '#C0392B';

  return (
    <div className="space-y-4" data-testid="slide-panel">
      <div>
        <Label>页面类型</Label>
        <select
          data-testid="slide-purpose"
          className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-white px-2 text-xs"
          value={slide.purpose ?? 'content'}
          onChange={(e) => engine.apply({ ...purposeCmd(slideId, e.target.value as never) })}
        >
          {['cover', 'agenda', 'section', 'situation', 'architecture', 'process', 'timeline', 'comparison', 'kpi', 'data_story', 'table', 'quote', 'summary', 'thanks', 'content', 'blank'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <Label>章节</Label>
        <Input data-testid="slide-section" className="mt-1 h-8 text-xs" placeholder="例如：第一部分" value={slide.section ?? ''} onChange={(e) => engine.updateSlideSection(slideId, e.target.value)} />
      </div>

      <div>
        <Label>背景</Label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={slide.background?.type === 'solid' ? (slide.background.color ?? '#FFFFFF') : '#FFFFFF'}
            onChange={(e) => engine.apply({ ...backgroundCmd(slideId, { type: 'solid', color: e.target.value }) })}
            className="h-7 w-9 cursor-pointer rounded border border-[#CBD5E1]"
            aria-label="背景色"
          />
          <Button size="sm" variant="outline" onClick={() => engine.apply({ ...backgroundCmd(slideId, { type: 'none' }) })}>无背景</Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>内容密度（§5.2）</Label>
          <span data-testid="density-score" className="text-xs font-semibold" style={{ color: bandColor }}>
            {density.score} · {density.band === 'good' ? '良好' : density.band === 'warn' ? '提醒' : density.band === 'auto_suggest' ? '建议精简' : '需拆页'}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, density.score)}%`, background: bandColor }} />
        </div>
        {qa.issues.length > 0 && (
          <ul data-testid="qa-issues" className="mt-2 space-y-1">
            {qa.issues.slice(0, 5).map((issue) => (
              <li key={issue.id} className="flex items-start gap-1.5 text-[11px] leading-4">
                <span className={issue.severity === 'error' ? 'text-[#C0392B]' : issue.severity === 'warning' ? 'text-[#B98A2F]' : 'text-[#94A3B8]'}>●</span>
                <span className="text-[#475569]">{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label>备注（演讲者备注）</Label>
        <textarea
          data-testid="slide-notes"
          className="mt-1 h-24 w-full rounded-md border border-[#CBD5E1] p-2 text-xs outline-none focus:border-[#1E56A0]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => engine.updateSlideNotes(slideId, notes)}
          placeholder="这页讲什么…"
        />
      </div>

      <Button data-testid="auto-fix" size="sm" variant="secondary" onClick={autoFix} disabled={qa.issues.length === 0}>
        自动修复 QA 问题（{qa.issues.length}）
      </Button>
    </div>
  );

  function autoFix() {
    const result = applyAutoFixes(engine.executor, engine.deck);
    toast('QA 自动修复完成', { description: `已应用 ${result.applied} 项修复`, tone: result.applied > 0 ? 'success' : 'default' });
  }
}

function purposeCmd(slideId: string, purpose: string) {
  return updateSlidePropsCommand({ slideId, patch: { purpose: purpose as never } });
}

function backgroundCmd(slideId: string, background: { type: 'solid'; color: string } | { type: 'none' }) {
  return updateSlidePropsCommand({ slideId, patch: { background } });
}

// ---------------------------------------------------------------------------

function MultiSelectPanel({ slideId, ids }: { slideId: string | undefined; ids: string[] }) {
  const engine = getEngine();
  if (!slideId) return null;
  const anyLocked = engine.deck.slides.find((s) => s.id === slideId)?.elements.some((e) => ids.includes(e.id) && e.locked);
  return (
    <div className="space-y-3" data-testid="multiselect-panel">
      <div className="grid grid-cols-4 gap-1">
        <IconButton data-testid="align-left" aria-label="左对齐" onClick={() => engine.alignSelected('left')}><AlignStartVertical className="h-4 w-4" /></IconButton>
        <IconButton aria-label="水平居中" onClick={() => engine.alignSelected('centerX')}><AlignCenterHorizontal className="h-4 w-4" /></IconButton>
        <IconButton aria-label="右对齐" onClick={() => engine.alignSelected('right')}><AlignEndVertical className="h-4 w-4" /></IconButton>
        <IconButton aria-label="顶对齐" onClick={() => engine.alignSelected('top')}><AlignStartHorizontal className="h-4 w-4" /></IconButton>
        <IconButton aria-label="垂直居中" onClick={() => engine.alignSelected('centerY')}><AlignCenterVertical className="h-4 w-4" /></IconButton>
        <IconButton aria-label="底对齐" onClick={() => engine.alignSelected('bottom')}><AlignEndHorizontal className="h-4 w-4" /></IconButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => engine.groupSelected()}>组合 ⌘G</Button>
        <Button size="sm" onClick={() => engine.ungroupSelected()}>取消组合</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => engine.alignSelected('centerX', 'canvas')}>画布水平居中</Button>
        <Button size="sm" variant="outline" onClick={() => engine.alignSelected('centerY', 'canvas')}>画布垂直居中</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => engine.setLocked(ids, !anyLocked)}>
          {anyLocked ? '解锁' : '锁定'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => engine.deleteSelected()}>删除</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ElementPanel({ element, slideId, themeId }: { element: SlideElement; slideId: string; themeId: string }) {
  const engine = getEngine();
  const theme = getTheme(themeId);
  const updateStyle = (patch: Parameters<typeof engine.updateStyle>[1]) => engine.updateStyle(element.id, patch);
  const updateProps = (patch: { locked?: boolean; hidden?: boolean; opacity?: number; rotation?: number; name?: string }) =>
    engine.apply({ ...propsCmd(slideId, element.id, patch) });

  return (
    <div className="space-y-4" data-testid="element-panel">
      {/* geometry — pixel-level coordinate inspector (§7.1) */}
      <div className="space-y-1.5 rounded-lg bg-[#F8FAFC] p-3">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={element.x} onChange={(v) => engine.moveElements([{ id: element.id, x: v, y: element.y }])} />
          <NumberField label="Y" value={element.y} onChange={(v) => engine.moveElements([{ id: element.id, x: element.x, y: v }])} />
          <NumberField label="W" value={element.w} min={1} onChange={(v) => engine.resizeElement(element.id, element.x, element.y, v, element.h)} />
          <NumberField label="H" value={element.h} min={1} onChange={(v) => engine.resizeElement(element.id, element.x, element.y, element.w, v)} />
          <NumberField label="旋转" value={element.rotation} onChange={(v) => engine.rotateElement(element.id, v)} />
          <div className="flex items-center gap-2">
            <Label className="w-12 shrink-0">透明度</Label>
            <Input
              type="number"
              value={Math.round(element.opacity * 100)}
              min={0}
              max={100}
              onChange={(e) => updateProps({ opacity: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
              className="h-7 font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {element.type === 'text' && (
        <div className="space-y-2.5" data-testid="text-panel">
          <div className="flex items-center justify-between">
            <Label>字号</Label>
            <Input type="number" value={element.style.fontSize ?? 22} className="h-7 w-20 font-mono text-xs" onChange={(e) => updateStyle({ style: { fontSize: Number(e.target.value) || 22 } })} />
          </div>
          <ColorField label="颜色" value={element.style.color ?? theme.colors.text} onChange={(color) => updateStyle({ style: { color } })} />
          <div className="flex gap-2">
            <Button size="sm" variant={element.style.bold ? 'primary' : 'outline'} onClick={() => updateStyle({ style: { bold: !element.style.bold } })}><b>B</b></Button>
            <Button size="sm" variant={element.style.italic ? 'primary' : 'outline'} onClick={() => updateStyle({ style: { italic: !element.style.italic } })}><i>I</i></Button>
            <Button size="sm" variant={element.style.underline ? 'primary' : 'outline'} onClick={() => updateStyle({ style: { underline: !element.style.underline } })}><u>U</u></Button>
            <select
              className="h-8 rounded-md border border-[#CBD5E1] bg-white px-2 text-xs"
              value={element.style.align ?? 'left'}
              onChange={(e) => updateStyle({ style: { align: e.target.value as never } })}
              aria-label="对齐方式"
            >
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={element.autoFit ?? false} onCheckedChange={(v) => updateStyle({ style: {} } as never) || updateProps({})} aria-label="自动适应" />
            <Label>自动适应（最后手段缩小字号 §5.3）</Label>
          </div>
        </div>
      )}

      {element.type === 'shape' && (
        <div className="space-y-2.5" data-testid="shape-panel">
          <ColorField label="填充" value={element.fill.type === 'solid' ? (element.fill.color ?? '#FFFFFF') : '#FFFFFF'} onChange={(color) => updateStyle({ fill: { type: 'solid', color, opacity: 1 } })} />
          <div className="flex items-center gap-2">
            <Label>填充类型</Label>
            <select className="h-7 rounded-md border border-[#CBD5E1] text-xs" value={element.fill.type} onChange={(e) => updateStyle({ fill: e.target.value === 'none' ? { type: 'none' } : { type: 'solid', color: element.fill.color ?? '#FFFFFF', opacity: 1 } })}>
              <option value="solid">纯色</option>
              <option value="none">无</option>
            </select>
          </div>
          <ColorField label="描边" value={element.stroke.color} onChange={(color) => updateStyle({ stroke: { ...element.stroke, color } })} />
          <div className="flex items-center gap-2">
            <Label>描边宽</Label>
            <Input type="number" value={element.stroke.width} className="h-7 w-20 font-mono text-xs" onChange={(e) => updateStyle({ stroke: { ...element.stroke, width: Number(e.target.value) || 0 } })} />
            <select className="h-7 rounded-md border border-[#CBD5E1] text-xs" value={element.stroke.style ?? 'solid'} onChange={(e) => updateStyle({ stroke: { ...element.stroke, style: e.target.value as never } })}>
              <option value="solid">实线</option>
              <option value="dashed">虚线</option>
              <option value="dotted">点线</option>
            </select>
          </div>
          <NumberField label="圆角" value={element.radius ?? 0} min={0} onChange={(v) => updateStyle({ radius: v })} />
        </div>
      )}

      {element.type === 'image' && (
        <div className="space-y-2.5" data-testid="image-panel">
          <div className="flex items-center gap-2">
            <Label>裁剪模式</Label>
            <select className="h-7 flex-1 rounded-md border border-[#CBD5E1] text-xs" value={element.objectFit} onChange={(e) => engine.apply({ ...imageFitCmd(slideId, element.id, e.target.value as never) })}>
              <option value="cover">覆盖（Canva 式裁剪）</option>
              <option value="contain">包含</option>
              <option value="fill">拉伸</option>
            </select>
          </div>
          <NumberField label="圆角" value={element.radius ?? 0} min={0} onChange={(v) => engine.apply({ ...imageRadiusCmd(slideId, element.id, v) })} />
          <Button
            size="sm"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => engine.apply({ ...replaceAssetCmd(slideId, element.id, String(reader.result)) });
                reader.readAsDataURL(file);
              };
              input.click();
            }}
          >
            替换图片（§32 Replace）
          </Button>
        </div>
      )}

      {element.type === 'chart' && <ChartPanel element={element} slideId={slideId} />}

      {/* common actions */}
      <div className="space-y-2 border-t border-[#E2E8F0] pt-3">
        <div className="flex items-center gap-2">
          <IconButton aria-label={element.locked ? '解锁' : '锁定'} active={element.locked} onClick={() => updateProps({ locked: !element.locked })}>
            {element.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </IconButton>
          <IconButton aria-label={element.hidden ? '显示' : '隐藏'} onClick={() => updateProps({ hidden: !element.hidden })}>
            {element.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </IconButton>
          <IconButton aria-label="置于顶层" onClick={() => engine.changeZOrder([element.id], 'front')}><BringToFront className="h-4 w-4" /></IconButton>
          <IconButton aria-label="置于底层" onClick={() => engine.changeZOrder([element.id], 'back')}><SendToBack className="h-4 w-4" /></IconButton>
          <IconButton aria-label="上移一层" onClick={() => engine.changeZOrder([element.id], 'forward')}><ArrowUp className="h-4 w-4" /></IconButton>
          <IconButton aria-label="下移一层" onClick={() => engine.changeZOrder([element.id], 'backward')}><ArrowDown className="h-4 w-4" /></IconButton>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#94A3B8]">角色: {element.role ?? '未设置'}</span>
          <span className="text-[11px] text-[#94A3B8]">ID: {element.id.slice(0, 10)}</span>
        </div>
      </div>
    </div>
  );
}

function ChartPanel({ element, slideId }: { element: Extract<SlideElement, { type: 'chart' }>; slideId: string }) {
  const engine = getEngine();
  const [title, setTitle] = useState(textToPlain(element.title));
  useEffect(() => setTitle(textToPlain(element.title)), [element.title]);
  return (
    <div className="space-y-2.5" data-testid="chart-panel">
      <div className="flex items-center gap-2">
        <Label>图表类型</Label>
        <select
          className="h-7 flex-1 rounded-md border border-[#CBD5E1] text-xs"
          value={element.chartType}
          onChange={(e) => engine.apply({ ...chartTypeCmd(slideId, element.id, e.target.value as never) })}
        >
          {['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'radar', 'scatter'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <Label>标题</Label>
        <Input className="mt-1 h-7 text-xs" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => engine.apply({ ...chartTitleCmd(slideId, element.id, title) })} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={element.legend?.show ?? true} onCheckedChange={(v) => engine.apply({ ...chartLegendCmd(slideId, element.id, v) })} aria-label="图例" />
        <Label>显示图例</Label>
      </div>
      <div className="rounded-md border border-[#E2E8F0] p-2">
        <Label>数据（§12 Data-native：图表绑定数据，不是图片）</Label>
        <div className="mt-1 space-y-1">
          {element.series.map((s, si) => (
            <div key={si} className="text-[11px] text-[#475569]">
              <span className="font-medium">{s.name}:</span> {s.data.map(String).join(', ')}
            </div>
          ))}
        </div>
        <Button size="sm" className="mt-2" onClick={() => openDataEditor()}>编辑数据…</Button>
      </div>
      {element.story?.message && (
        <div className="rounded-md bg-[#E8F0FA] px-2 py-1.5 text-[11px] text-[#1E56A0]">
          📊 {element.story.message}
          {element.story.highlight ? `（${element.story.highlight}）` : ''}
        </div>
      )}
    </div>
  );

  function openDataEditor() {
    toast('数据编辑', { description: '可直接修改 Excel 并「Update deck」自动刷新（§12）' });
  }
}

function propsCmd(slideId: string, id: string, patch: Record<string, unknown>) {
  return updateElementPropsCommand({ slideId, id, patch: patch as never });
}

function imageFitCmd(slideId: string, id: string, objectFit: 'cover' | 'contain' | 'fill') {
  return updateElementPropsCommand({ slideId, id, patch: { objectFit } as never });
}

function imageRadiusCmd(slideId: string, id: string, radius: number) {
  return updateElementPropsCommand({ slideId, id, patch: { radius } as never });
}

function replaceAssetCmd(slideId: string, id: string, src: string) {
  return replaceAssetCommand({ slideId, id, src });
}

function chartTypeCmd(slideId: string, id: string, chartType: string) {
  return updateChartDataCommand({ slideId, id, chartType: chartType as never });
}

function chartTitleCmd(slideId: string, id: string, title: string) {
  return updateChartDataCommand({ slideId, id, title: textFromPlain(title) });
}

function chartLegendCmd(slideId: string, id: string, show: boolean) {
  return updateChartDataCommand({ slideId, id, legend: { show } });
}
