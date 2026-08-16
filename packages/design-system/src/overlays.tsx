import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

// ---------------------------------------------------------------------------
// Dialog (modal, 180–220ms §8.1)
// ---------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  onClose,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title?: string; description?: string; onClose?: () => void }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.45)] animate-[fadeIn_150ms_ease-out]" />
      <DialogPrimitive.Content
        {...props}
        className={cn(
          'fixed left-1/2 top-1/2 z-40 max-h-[86vh] w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2',
          'overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)]',
          'animate-[popIn_180ms_cubic-bezier(0.2,0.8,0.2,1)] outline-none',
          className,
        )}
      >
        {title && (
          <div className="flex items-start justify-between border-b border-[#E2E8F0] px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-[#1E293B]">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-0.5 text-xs text-[#94A3B8]">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] outline-none"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
        )}
        <div className={cn('overflow-y-auto px-5 py-4', !title && 'px-0 py-0')}>{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// DropdownMenu / ContextMenu (120–160ms)
// ---------------------------------------------------------------------------

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export interface MenuItemProps extends React.ComponentProps<typeof DropdownPrimitive.Item> {
  danger?: boolean;
}

function menuItemClasses(className?: string, danger?: boolean): string {
  return cn(
    'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[#1E293B] outline-none',
    'data-[highlighted]:bg-[#F1F5F9] data-[disabled]:opacity-40',
    danger && 'text-[#C0392B] data-[highlighted]:bg-[#FBECEA]',
    className,
  );
}

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(function DropdownMenuItem(
  { className, danger, ...props },
  ref,
) {
  return <DropdownPrimitive.Item ref={ref} className={menuItemClasses(className, danger)} {...props} />;
});

export function DropdownMenuContent({
  className,
  children,
  align = 'start',
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-40 min-w-[180px] rounded-lg border border-[#CBD5E1] bg-white p-1 shadow-[0_4px_16px_rgba(15,23,42,0.08)]',
          'animate-[popIn_140ms_cubic-bezier(0.2,0.8,0.2,1)]',
          className,
        )}
        {...props}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-[#E2E8F0]" />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DropdownPrimitive.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">{children}</DropdownPrimitive.Label>
);

// Context menu variant
import * as ContextPrimitive from '@radix-ui/react-context-menu';

export const ContextMenu = ContextPrimitive.Root;
export const ContextMenuTrigger = ContextPrimitive.Trigger;
export const ContextMenuItem = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof ContextPrimitive.Item>>(function ContextMenuItem(
  { className, ...props },
  ref,
) {
  return (
    <ContextPrimitive.Item
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[#1E293B] outline-none',
        'data-[highlighted]:bg-[#F1F5F9]',
        className,
      )}
      {...props}
    />
  );
});

export function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextPrimitive.Content>) {
  return (
    <ContextPrimitive.Portal>
      <ContextPrimitive.Content
        className={cn(
          'z-40 min-w-[200px] rounded-lg border border-[#CBD5E1] bg-white p-1 shadow-[0_4px_16px_rgba(15,23,42,0.08)]',
          'animate-[popIn_140ms_cubic-bezier(0.2,0.8,0.2,1)]',
          className,
        )}
        {...props}
      >
        {children}
      </ContextPrimitive.Content>
    </ContextPrimitive.Portal>
  );
}
export const ContextMenuSeparator = () => <ContextPrimitive.Separator className="my-1 h-px bg-[#E2E8F0]" />;

// ---------------------------------------------------------------------------
// Tooltip / Popover
// ---------------------------------------------------------------------------

import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ children, className, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className={cn(
          'z-50 rounded-md bg-[#1E293B] px-2 py-1 text-xs text-white shadow-md animate-[fadeIn_100ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipPrimitive };
