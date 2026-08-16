import * as React from 'react';
import { cn } from './cn';

// ---------------------------------------------------------------------------
// Button / IconButton / Badge / Kbd / Input / Textarea / Label / Progress
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[#1E56A0] text-white hover:bg-[#163E75] shadow-sm',
  secondary: 'bg-[#E8F0FA] text-[#1E56A0] hover:bg-[#D8E6F7]',
  ghost: 'bg-transparent text-[#475569] hover:bg-[#E2E8F0]',
  danger: 'bg-[#C0392B] text-white hover:bg-[#A93226]',
  outline: 'bg-white border border-[#CBD5E1] text-[#1E293B] hover:bg-[#F8FAFC]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-9 px-3.5 text-sm gap-1.5',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-8 w-8 p-0 justify-center',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-100',
        'disabled:opacity-45 disabled:pointer-events-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[#1E56A0]/40',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, active, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-[#475569] transition-colors duration-100',
        'hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-[#1E56A0]/40',
        active && 'bg-[#E8F0FA] text-[#1E56A0]',
        className,
      )}
      {...props}
    />
  );
});

export function Badge({ className, children, tone = 'default' }: { className?: string; children: React.ReactNode; tone?: 'default' | 'primary' | 'danger' | 'success' | 'warning' }) {
  const tones = {
    default: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
    primary: 'bg-[#E8F0FA] text-[#1E56A0] border-[#BBD3EE]',
    danger: 'bg-[#FBECEA] text-[#C0392B] border-[#EEC5C0]',
    success: 'bg-[#EAF6EF] text-[#1F9D55] border-[#BFE4CD]',
    warning: 'bg-[#FBF3E4] text-[#B98A2F] border-[#EBD9B4]',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex min-w-[20px] items-center justify-center rounded border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[11px] text-[#475569] shadow-[0_1px_0_#CBD5E1]', className)}>
      {children}
    </kbd>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#1E293B] placeholder:text-[#94A3B8]',
        'outline-none focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 transition-shadow',
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8]',
        'outline-none focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 resize-none transition-shadow',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('text-xs font-medium text-[#475569]', className)}>
      {children}
    </label>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]', className)}>
      <div data-testid="progress-bar" className="h-full rounded-full bg-[#1E56A0] transition-[width] duration-200" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#1E56A0]', className)} />
  );
}
