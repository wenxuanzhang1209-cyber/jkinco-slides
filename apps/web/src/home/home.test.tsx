import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDeck, createSlide, createText } from '@jkinco/scene-schema';
import { createSessionEngine, getEngine } from '../state/appState';
import { HomePage } from './HomePage';

beforeEach(() => {
  localStorage.clear();
});

describe('HomePage (§25 — the entry is always 你要讲什么)', () => {
  it('renders the prompt hero', () => {
    createSessionEngine(createDeck());
    const onGenerate = vi.fn();
    render(<HomePage onGenerate={onGenerate} onOpenEditor={() => undefined} />);
    expect(screen.getByText('你要讲什么？')).toBeInTheDocument();
    expect(screen.getByTestId('home-prompt')).toHaveAttribute('placeholder', expect.stringContaining('Describe your presentation'));
  });

  it('generate button fires with the prompt', async () => {
    createSessionEngine(createDeck());
    const onGenerate = vi.fn();
    render(<HomePage onGenerate={onGenerate} onOpenEditor={() => undefined} />);
    await userEvent.type(screen.getByTestId('home-prompt'), '帮我做一个课题启动汇报');
    await userEvent.click(screen.getByTestId('home-generate'));
    expect(onGenerate).toHaveBeenCalledWith('帮我做一个课题启动汇报');
  });

  it('imports a JSON scene graph deck', async () => {
    const engine = createSessionEngine(createDeck());
    const onOpenEditor = vi.fn();
    render(<HomePage onGenerate={() => undefined} onOpenEditor={onOpenEditor} />);
    const deck = createDeck({ title: '导入的演示文稿', slides: [createSlide({ elements: [createText(0, 0, 100, 50, 'x')] })] });
    const file = new File([JSON.stringify(deck)], 'imported.json', { type: 'application/json' });
    const input = screen.getByTestId('home-file-input');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(engine.deck.title).toBe('导入的演示文稿');
    });
    expect(onOpenEditor).toHaveBeenCalled();
  });

  it('imports a PPTX file', { timeout: 15000 }, async () => {
    const engine = createSessionEngine(createDeck());
    const onOpenEditor = vi.fn();
    render(<HomePage onGenerate={() => undefined} onOpenEditor={onOpenEditor} />);
    // Build a real PPTX with the exporter, then import it back (§16/§17 round trip).
    const { exportDeckToPptx } = await import('@jkinco/pptx-export');
    const src = createDeck({ title: 'PPTX 导入测试', slides: [createSlide({ elements: [createText(40, 40, 400, 60, '来自PPTX', { id: 'x1', zIndex: 0 })] })] });
    const bytes = await exportDeckToPptx(src);
    const file = new File([bytes as BlobPart], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const input = screen.getByTestId('home-file-input');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(engine.deck.title).toBe('test'); // title derives from the imported file name
    }, { timeout: 8000 });
    expect(engine.deck.slides.length).toBe(1);
    expect(onOpenEditor).toHaveBeenCalled();
  });

  it('shows recent items when present', () => {
    localStorage.setItem(
      'jkinco:recent',
      JSON.stringify([{ id: 'd1', title: '课题研究启动会', at: new Date().toISOString() }]),
    );
    createSessionEngine(createDeck());
    render(<HomePage onGenerate={() => undefined} onOpenEditor={() => undefined} />);
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('课题研究启动会')).toBeInTheDocument();
  });
});
