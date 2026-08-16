import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDeck, createSlide, createText, createShape } from '@jkinco/scene-schema';
import { createSessionEngine } from '../state/appState';
import { PresenterView } from './PresenterView';

function makeDeck() {
  const slide = createSlide({
    notes: '第一页备注内容',
    elements: [
      createText(40, 40, 400, 60, '演示标题', { id: 't1', zIndex: 0 }),
      createShape('rect', 100, 100, 200, 100, { id: 's1', zIndex: 1, text: '框图' }),
    ],
  });
  const slide2 = createSlide({ elements: [createText(40, 40, 400, 60, '第二页', { id: 't2', zIndex: 0 })] });
  return createDeck({ slides: [slide, slide2] });
}

beforeEach(() => {
  localStorage.clear();
});

describe('Presenter (§18)', () => {
  it('renders current slide with page counter and timer', () => {
    createSessionEngine(makeDeck());
    render(<PresenterView onExit={() => undefined} />);
    expect(screen.getByTestId('presenter')).toBeInTheDocument();
    expect(screen.getByTestId('presenter-page')).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('presenter-timer')).toBeInTheDocument();
    expect(screen.getByTestId('presenter-notes')).toBeInTheDocument();
  });

  it('navigates with arrow keys and buttons', async () => {
    createSessionEngine(makeDeck());
    const onExit = vi.fn();
    render(<PresenterView onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('presenter-page')).toHaveTextContent('2 / 2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('presenter-page')).toHaveTextContent('1 / 2');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalled();
  });

  it('shows speaker notes, script and Q&A prediction', () => {
    createSessionEngine(makeDeck());
    render(<PresenterView onExit={() => undefined} />);
    expect(screen.getByText('第一页备注内容')).toBeInTheDocument();
    expect(screen.getByTestId('presenter-script')).toBeInTheDocument();
    expect(screen.getByTestId('presenter-qa')).toBeInTheDocument();
    expect(screen.getByText(/本页建议 \d+ 秒/)).toBeInTheDocument();
  });

  it('toggles laser / pen / spotlight via toolbar and keys', async () => {
    createSessionEngine(makeDeck());
    render(<PresenterView onExit={() => undefined} />);
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'p' });
    fireEvent.keyDown(window, { key: 's' });
    // toolbar buttons reflect the toggled state via aria-labels
    expect(screen.getByRole('button', { name: '关闭激光笔' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭画笔' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭聚光灯' })).toBeInTheDocument();
  });

  it('timer runs and can be paused', () => {
    vi.useFakeTimers();
    try {
      createSessionEngine(makeDeck());
      render(<PresenterView onExit={() => undefined} />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('presenter-timer')).toHaveTextContent('0:03');
      fireEvent.click(screen.getByRole('button', { name: '暂停计时' }));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('presenter-timer')).toHaveTextContent('0:03');
    } finally {
      vi.useRealTimers();
    }
  });

  it('exits via the exit button', () => {
    createSessionEngine(makeDeck());
    const onExit = vi.fn();
    render(<PresenterView onExit={onExit} />);
    fireEvent.click(screen.getByTestId('presenter-exit'));
    expect(onExit).toHaveBeenCalled();
  });
});
