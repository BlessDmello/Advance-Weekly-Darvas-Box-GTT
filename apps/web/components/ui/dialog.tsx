'use client';
import { Dialog as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;
export function DialogContent({ children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <Primitive.Content
        className="public-page fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl"
        {...props}
        style={{ minHeight: 0, background: 'var(--landing-card)', ...props.style }}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
