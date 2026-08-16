import React, { memo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { getTheme } from '@jkinco/scene-schema';
import { getEngine, useDeck, useSelection } from '../state/appState';
import { SlideView } from './SlideView';

const THUMB_W = 176;

/** §6 left rail: live thumbnails, reorder, sections, duplicate/delete, add. */
export const ThumbnailRail = memo(function ThumbnailRail() {
  const engine = getEngine();
  const deck = useDeck();
  const selection = useSelection();
  const theme = getTheme(deck.themeId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  };

  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      engine.moveSlideTo(deck.slides[dragIndex]!.id, index);
      setDragIndex(index);
    }
  };

  return (
    <div data-testid="thumbnail-rail" className="flex h-full w-60 flex-col border-r border-[#E2E8F0] bg-[#FAFBFC]">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
        <span className="text-xs font-medium text-[#475569]">页面 {deck.slides.length}</span>
        <div className="flex gap-1">
          <button
            data-testid="add-slide"
            className="rounded p-1 hover:bg-[#E2E8F0]"
            aria-label="新建页面"
            onClick={() => engine.insertSlide(deck.slides.length)}
          >
            <Plus className="h-4 w-4 text-[#475569]" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" data-testid="thumbnail-list">
        {deck.slides.map((slide, index) => {
          const active = selection.slideId === slide.id;
          const section = slide.section;
          const showSection = section && (index === 0 || deck.slides[index - 1]!.section !== section);
          return (
            <React.Fragment key={slide.id}>
              {showSection && (
                <div data-testid="section-label" className="mt-3 mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                  {section}
                </div>
              )}
              <div
                data-testid="thumbnail"
                data-slide-id={slide.id}
                draggable
                onDragStart={onDragStart(index)}
                onDragOver={onDragOver(index)}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => engine.selectSlide(slide.id)}
                onMouseDown={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    const ids = engine.selection.slideIds.includes(slide.id)
                      ? engine.selection.slideIds.filter((x) => x !== slide.id)
                      : [...engine.selection.slideIds, slide.id];
                    engine.setSlideMultiSelection(ids);
                  }
                }}
                className={`group relative mb-2 cursor-pointer rounded-md border p-1 transition-shadow ${
                  active ? 'border-[#1E56A0] ring-2 ring-[#1E56A0]/20' : 'border-transparent hover:border-[#CBD5E1]'
                }`}
                style={{ background: active ? '#E8F0FA' : 'transparent' }}
              >
                <div className="relative overflow-hidden rounded-sm" style={{ width: THUMB_W - 12, height: ((THUMB_W - 12) * 9) / 16 }}>
                  <SlideView slide={slide} theme={theme} zoom={(THUMB_W - 12) / 960} interactive={false} />
                </div>
                <div className="mt-1 flex items-center justify-between px-0.5">
                  <span className="text-[11px] text-[#475569]">
                    {index + 1}. {slide.name ?? slide.purpose ?? '页面'}
                  </span>
                  <span className="hidden gap-0.5 group-hover:flex">
                    <button
                      className="rounded p-0.5 hover:bg-[#E2E8F0]"
                      aria-label="复制页面"
                      data-testid="duplicate-slide"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.duplicateSlide(slide.id);
                      }}
                    >
                      <Copy className="h-3 w-3 text-[#94A3B8]" />
                    </button>
                    <button
                      className="rounded p-0.5 hover:bg-[#FBECEA]"
                      aria-label="删除页面"
                      data-testid="delete-slide"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.deleteSlide(slide.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-[#C0392B]" />
                    </button>
                  </span>
                </div>
                {slide.qaStatus === 'issues' && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#E8A33D]" title="QA 存在问题" />
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
});
