import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function TaskActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t bg-card px-1 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]', className)} {...props} />;
}
