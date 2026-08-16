import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from './cn';

// ---------------------------------------------------------------------------
// Tabs / Switch / Slider
// ---------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1', className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, children, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-md px-3 py-1.5 text-[13px] font-medium text-[#475569] outline-none transition-colors duration-100',
        'hover:text-[#1E293B] data-[state=active]:bg-white data-[state=active]:text-[#1E56A0] data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, children, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('outline-none', className)} {...props}>
      {children}
    </TabsPrimitive.Content>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-5 w-9 rounded-full bg-[#CBD5E1] outline-none transition-colors duration-100 data-[state=checked]:bg-[#1E56A0]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-100 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn('relative flex h-5 w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#E2E8F0]">
        <SliderPrimitive.Range className="absolute h-full bg-[#1E56A0]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border border-[#1E56A0] bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-[#1E56A0]/40" />
    </SliderPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Toast (minimal, deterministic)
// ---------------------------------------------------------------------------

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'danger';
}

let toastListeners = new Set<(toasts: ToastItem[]) => void>();
let toastState: ToastItem[] = [];
let toastId = 0;

function emitToasts(): void {
  for (const listener of toastListeners) listener(toastState);
}

export function toast(title: string, opts: { description?: string; tone?: ToastItem['tone']; duration?: number } = {}): void {
  const item: ToastItem = { id: ++toastId, title, description: opts.description, tone: opts.tone ?? 'default' };
  toastState = [...toastState, item];
  emitToasts();
  const duration = opts.duration ?? 2600;
  setTimeout(() => dismissToast(item.id), duration);
}

export function dismissToast(id: number): void {
  toastState = toastState.filter((t) => t.id !== id);
  emitToasts();
}

export function subscribeToasts(listener: (toasts: ToastItem[]) => void): () => void {
  toastListeners.add(listener);
  listener(toastState);
  return () => toastListeners.delete(listener);
}

export function ToastViewport(): React.ReactElement {
  const [toasts, setToasts] = React.useState<ToastItem[]>(toastState);
  React.useEffect(() => subscribeToasts(setToasts), []);
  const tones = {
    default: 'border-[#CBD5E1]',
    success: 'border-[#1F9D55]',
    danger: 'border-[#C0392B]',
  } as const;
  return (
    <div className="pointer-events-none fixed bottom-14 right-4 z-50 flex w-80 flex-col gap-2" data-testid="toast-viewport">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          className={cn(
            'pointer-events-auto rounded-lg border bg-white px-4 py-3 shadow-[0_4px_16px_rgba(15,23,42,0.12)] animate-[popIn_160ms_cubic-bezier(0.2,0.8,0.2,1)]',
            tones[t.tone ?? 'default'],
          )}
        >
          <div className="text-[13px] font-medium text-[#1E293B]">{t.title}</div>
          {t.description && <div className="mt-0.5 text-xs text-[#475569]">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}
