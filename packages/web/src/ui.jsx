import * as TabsPrimitive from '@radix-ui/react-tabs';
import { clsx as cn } from 'clsx';

export { cn };

// shadcn-style primitives reskinned to Notion: quiet by default, weight over size,
// no shadows, no rings — if a shadcn default shows through, it's wrong.

export function Button({ className, variant = 'ghost', ...props }) {
  return (
    <button
      className={cn(
        'inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-sm transition-colors select-none disabled:cursor-default disabled:opacity-50',
        variant === 'ghost' && 'text-ink-2 hover:bg-hover hover:text-ink',
        variant === 'accent' && 'font-medium text-accent hover:bg-accent/10',
        className,
      )}
      {...props}
    />
  );
}

export function Pill({ className, children, ...props }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-sm bg-hover px-1.5 text-xs text-ink-2', className)} {...props}>
      {children}
    </span>
  );
}

// Notion tag palette, hashed by email so a person keeps their color everywhere.
const AVATAR_BG = ['#D3E5EF', '#DBEDDB', '#FADEC9', '#E8DEEE', '#F5E0E9', '#FDECC8', '#EEE0DA'];

export function Avatar({ email, className }) {
  const i = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_BG.length;
  return (
    <span
      title={email}
      style={{ background: AVATAR_BG[i] }}
      className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-ink uppercase ring-1 ring-white', className)}
    >
      {email[0]}
    </span>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn('flex gap-4 border-b border-line', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px cursor-pointer border-b-2 border-transparent pb-1.5 text-sm text-ink-2 hover:text-ink',
        'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
