import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Highlighter,
  PenLine,
  Pause,
  Play,
  X,
  Zap,
} from 'lucide-react';
import { getTheme, textToPlain } from '@jkinco/scene-schema';
import { measureText } from '@jkinco/rich-text';
import { SlideView } from '../editor/SlideView';
import { useDeck } from '../state/appState';
import { Button, IconButton, toast } from '@jkinco/design-system';

export interface PresenterViewProps {
  onExit: () => void;
  startIndex?: number;
}

/**
 * §18 Presentation Mode: presenter view, notes, timer, laser, pen,
 * spotlight, estimated talk time, speech script, Q&A prediction.
 */
export const PresenterView = memo(function PresenterView({ onExit, startIndex = 0 }: PresenterViewProps) {
  const deck = useDeck();
  const theme = getTheme(deck.themeId);
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, deck.slides.length - 1)));
  const [notesOpen, setNotesOpen] = useState(true);
  const [laser, setLaser] = useState(false);
  const [pen, setPen] = useState(false);
  const [spotlight, setSpotlight] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [penPoints, setPenPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [penStrokes, setPenStrokes] = useState<Array<Array<{ x: number; y: number }>>>([]);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement>(null);

  const slide = deck.slides[index] ?? deck.slides[0];
  const total = deck.slides.length;
  const perSlideSec = 45;
  const overtime = elapsed > total * perSlideSec;

  // timer
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const next = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // keyboard remote control (§18)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          prev();
          break;
        case 'Escape':
          onExit();
          break;
        case 'l':
          setLaser((v) => !v);
          break;
        case 'p':
          setPen((v) => !v);
          break;
        case 's':
          setSpotlight((v) => !v);
          break;
        case 'n':
          setNotesOpen((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit]);

  // speech script + estimated time + Q&A prediction (rule-based, deterministic)
  const script = useMemo(() => {
    if (!slide) return { lines: [] as string[], estimate: 30, qa: [] as string[] };
    const texts = slide.elements
      .filter((e) => e.type === 'text' || e.type === 'shape')
      .map((e) => textToPlain((e as { text?: never }).text ?? { paragraphs: [] }))
      .filter((t) => t.trim().length > 0);
    const notesLines = (slide.notes ?? '').split('\n').filter((t) => t.trim().length > 0);
    const lines = texts.length > 0 ? texts : notesLines;
    const charCount = lines.join('').length;
    const estimate = Math.max(15, Math.round((charCount / 6) * 1.2)); // ~6 chars/sec Chinese speaking
    const qa: string[] = [];
    if (slide.elements.length < 3) qa.push('页面内容较少，可能被追问细节');
    if (texts.some((t) => t.length > 100)) qa.push('文字较多，可能被要求概括');
    if (slide.elements.some((e) => e.type === 'chart')) qa.push('图表数据来源与方法可能被追问（§33 来源标注）');
    if (qa.length === 0) qa.push('结论清晰，预计提问集中在落地时间表');
    return { lines: lines.length > 0 ? lines : ['（本页无文字内容）'], estimate, qa };
  }, [slide]);

  // pen drawing
  const onPointerDown = (e: React.PointerEvent) => {
    if (!pen || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPenStrokes((s) => [...s, [{ x, y }]]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) {
      setCursor({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
    }
    if (!pen) return;
    const x = ((e.clientX - rect!.left) / rect!.width) * 100;
    const y = ((e.clientY - rect!.top) / rect!.height) * 100;
    setPenStrokes((s) => {
      const next = [...s];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = [...last, { x, y }];
      return next;
    });
  };

  if (!slide) return null;
  const nextSlide = deck.slides[Math.min(index + 1, total - 1)];

  return (
    <div data-testid="presenter" className="fixed inset-0 z-100 flex flex-col bg-[#0B1220]">
      {/* main stage */}
      <div
        ref={stageRef}
        className="relative flex flex-1 items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setPenStrokes((s) => [...s, []])}
        style={{ cursor: pen ? 'crosshair' : 'default' }}
      >
        <div style={{ width: 'min(92vw, 86vh * 1.7778)' }}>
          <SlideView slide={slide} theme={theme} zoom={Math.min(window.innerWidth * 0.0011, 0.92)} interactive={false} />
        </div>
        {penStrokes.map((stroke, si) => (
          <svg key={si} className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#F43F5E"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ))}
        {laser && <div className="presenter-laser" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }} />}
        {spotlight && <div className="presenter-spotlight" style={{ ['--sx' as never]: `${cursor.x}%`, ['--sy' as never]: `${cursor.y}%` }} />}
      </div>

      {/* presenter control bar */}
      <div className="flex items-center justify-between border-t border-white/10 bg-[#0F1A2E] px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <IconButton aria-label="上一页" onClick={prev} disabled={index === 0} className="text-white/70 hover:bg-white/10">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span data-testid="presenter-page" className="w-16 text-center font-mono text-[13px] text-white/70">
            {index + 1} / {total}
          </span>
          <IconButton aria-label="下一页" onClick={next} disabled={index === total - 1} className="text-white/70 hover:bg-white/10">
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-white/70">
          <Clock className="h-4 w-4" />
          <span data-testid="presenter-timer" className={`font-mono ${overtime ? 'text-[#E8A33D]' : ''}`}>
            {formatTime(elapsed)} / 约 {formatTime(total * perSlideSec)}
            {overtime && ' · 超时'}
          </span>
          <span className="hidden text-white/40 sm:inline">本页建议 {script.estimate} 秒 · 只说三个点</span>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton aria-label={laser ? '关闭激光笔' : '激光笔'} className={`${laser ? 'bg-[#E8A33D]/20 text-[#E8A33D]' : 'text-white/70 hover:bg-white/10'}`} onClick={() => setLaser((v) => !v)}>
            <Zap className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label={pen ? '关闭画笔' : '画笔'} className={`${pen ? 'bg-[#F43F5E]/20 text-[#F43F5E]' : 'text-white/70 hover:bg-white/10'}`} onClick={() => { setPen((v) => !v); setPenStrokes([]); }}>
            <PenLine className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label={spotlight ? '关闭聚光灯' : '聚光灯'} className={`${spotlight ? 'bg-white/20' : 'text-white/70 hover:bg-white/10'}`} onClick={() => setSpotlight((v) => !v)}>
            <Highlighter className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label={notesOpen ? '收起备注' : '演讲者备注'} className={notesOpen ? 'bg-white/20' : 'text-white/70 hover:bg-white/10'} onClick={() => setNotesOpen((v) => !v)}>
            <FileText className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label={running ? '暂停计时' : '继续计时'} className="text-white/70 hover:bg-white/10" onClick={() => setRunning((v) => !v)}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </IconButton>
          <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={onExit} data-testid="presenter-exit">
            <X className="h-4 w-4" /> 退出
          </Button>
        </div>
      </div>

      {/* presenter notes panel */}
      {notesOpen && (
        <div data-testid="presenter-notes" className="grid grid-cols-2 gap-4 border-t border-white/10 bg-[#0F1A2E] px-6 py-4 text-white">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-white/40">演讲者备注 + 自动演讲稿（§18）</div>
            <p className="mt-2 text-[13px] leading-6 text-white/80">{slide.notes ?? '（未填写备注）'}</p>
            <div className="mt-2 space-y-1" data-testid="presenter-script">
              {script.lines.map((line, i) => (
                <p key={i} className="text-[12px] text-white/60">
                  {i === 0 ? '① ' : `　`}
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-white/40">下一页</div>
            {nextSlide && (
              <div className="mt-2 w-[240px]">
                <SlideView slide={nextSlide} theme={theme} zoom={0.25} interactive={false} />
              </div>
            )}
            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/40">Q&A 预测（§18）</div>
            <ul className="mt-1 space-y-1" data-testid="presenter-qa">
              {script.qa.map((q, i) => (
                <li key={i} className="text-[12px] text-[#E8A33D]">• {q}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
