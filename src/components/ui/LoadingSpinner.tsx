'use client';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          sizeClass,
          'border-2 border-[#1E293B] border-t-[#3B82F6] rounded-full animate-spin'
        )}
      />
    </div>
  );
}
