import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { createDeck, createSlide, createText } from '@jkinco/scene-schema';

beforeEach(() => {
  localStorage.clear();
});

describe('App shell bootstrap', () => {
  it('shows the home page when no deck is saved', async () => {
    render(<App />);
    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('你要讲什么？')).toBeInTheDocument();
  });

  it('opens the editor directly when a deck exists in storage', async () => {
    const deck = createDeck({ id: 'deck-boot', slides: [createSlide({ elements: [createText(40, 40, 400, 60, '已保存内容', { id: 't1', zIndex: 0 })] })] });
    localStorage.setItem('deck:deck-boot', JSON.stringify(deck));
    localStorage.setItem('lastDeckId', 'deck:deck-boot');
    render(<App />);
    expect(await screen.findByTestId('editor-page')).toBeInTheDocument();
    expect(screen.getAllByText('已保存内容').length).toBeGreaterThan(0);
  });
});
