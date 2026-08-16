import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Button, IconButton, Badge, Kbd, Input, Progress, Dialog, DialogContent, DialogTrigger, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Tabs, TabsList, TabsTrigger, TabsContent, Switch, Slider, toast, subscribeToasts, ToastViewport, motion, colors, cn } from './index';

describe('controls', () => {
  it('renders a primary button with text', () => {
    render(<Button variant="primary">生成 PPT</Button>);
    const btn = screen.getByRole('button', { name: '生成 PPT' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-[#1E56A0]');
  });

  it('icon button fires click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton aria-label="撤销" onClick={onClick}>←</IconButton>);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('badge and kbd render', () => {
    render(<><Badge tone="success">Ready</Badge><Kbd>⌘K</Kbd></>);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('input accepts text', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="输入主题" aria-label="主题" />);
    const input = screen.getByPlaceholderText('输入主题');
    await user.type(input, 'hello');
    expect((input as HTMLInputElement).value).toBe('hello');
  });

  it('progress clamps to 0..100', () => {
    const { getByTestId } = render(<Progress value={150} />);
    expect(getByTestId('progress-bar').style.width).toBe('100%');
  });
});

describe('dialog', () => {
  it('opens and closes', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild><button>打开</button></DialogTrigger>
        <DialogContent title="分享" data-testid="dlg">
          <p>内容</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByText('内容')).toBeInTheDocument();
    expect(screen.getByText('分享')).toBeInTheDocument();
  });
});

describe('dropdown', () => {
  it('opens menu with items', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button>菜单</button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>导出 PPTX</DropdownMenuItem>
          <DropdownMenuItem danger>删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: '菜单' }));
    expect(screen.getByRole('menuitem', { name: '导出 PPTX' })).toBeInTheDocument();
  });
});

describe('tabs and switch', () => {
  it('switches tabs', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList>
        <TabsContent value="a">内容A</TabsContent>
        <TabsContent value="b">内容B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('内容A')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByText('内容B')).toBeInTheDocument();
  });

  it('switch toggles checked', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="锁定" />);
    const sw = screen.getByRole('switch', { name: '锁定' });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    expect(sw).toBeChecked();
  });
});

describe('toast', () => {
  it('publishes and dismisses toasts', () => {
    const seen: string[][] = [];
    const unsub = subscribeToasts((t) => seen.push(t.map((x) => x.title)));
    toast('已保存', { tone: 'success' });
    expect(seen[seen.length - 1]).toContain('已保存');
    unsub();
  });

  it('renders toast viewport', () => {
    const { getByTestId } = render(<ToastViewport />);
    expect(getByTestId('toast-viewport')).toBeInTheDocument();
  });
});

describe('tokens', () => {
  it('motion follows §8.1 ranges', () => {
    expect(motion.hover).toBeGreaterThanOrEqual(80);
    expect(motion.hover).toBeLessThanOrEqual(120);
    expect(motion.popover).toBeGreaterThanOrEqual(120);
    expect(motion.popover).toBeLessThanOrEqual(160);
    expect(motion.inspector).toBeGreaterThanOrEqual(160);
    expect(motion.inspector).toBeLessThanOrEqual(200);
    expect(motion.modal).toBeGreaterThanOrEqual(180);
    expect(motion.modal).toBeLessThanOrEqual(220);
    expect(motion.morph).toBeGreaterThanOrEqual(220);
    expect(motion.morph).toBeLessThanOrEqual(350);
    expect(motion.instant).toBe(0); // drag has zero latency
  });

  it('cn merges tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('a', undefined, 'b')).toBe('a b');
  });
});
