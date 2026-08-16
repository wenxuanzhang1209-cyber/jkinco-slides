import React, { memo } from 'react';
import type { Slide, Theme } from '@jkinco/scene-schema';
import { sortByZIndex } from '@jkinco/scene-schema';
import { ElementView } from './elements';

/**
 * SlideView renders one slide at a given zoom. Pure and memoized:
 * structural sharing means unchanged elements keep their references,
 * so only affected elements re-render.
 */
export const SlideView = memo(function SlideView({
  slide,
  theme,
  zoom,
  interactive = true,
  editingTextId,
}: {
  slide: Slide;
  theme: Theme;
  zoom: number;
  interactive?: boolean;
  editingTextId?: string | null;
}) {
  const bg = slide.background ?? { type: 'none' as const };
  const backgroundStyle: React.CSSProperties =
    bg.type === 'solid'
      ? { background: bg.color ?? '#FFFFFF' }
      : bg.type === 'gradient'
        ? { background: `linear-gradient(${bg.angle ?? 135}deg, ${bg.from}, ${bg.to})` }
        : { background: '#FFFFFF' };

  return (
    <div
      data-slide-id={slide.id}
      data-testid="slide"
      className={interactive ? '' : 'no-select'}
      style={{
        position: 'relative',
        width: 960,
        height: 540,
        transform: `scale(${zoom})`,
        transformOrigin: '0 0',
        background: '#FFFFFF',
        overflow: 'hidden',
        boxShadow: interactive ? '0 8px 32px rgba(15,23,42,0.16)' : '0 1px 6px rgba(15,23,42,0.12)',
        ...backgroundStyle,
      }}
    >
      {sortByZIndex(slide.elements).map((el) => (
        <ElementView key={el.id} element={el} theme={theme} selected={false} isEditing={editingTextId === el.id} />
      ))}
    </div>
  );
});
