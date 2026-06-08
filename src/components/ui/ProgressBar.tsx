'use client';

import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  color = '#3B82F6',
  showLabel = true,
  size = 'md',
  className,
}: ProgressBarProps) {
  const percent = Math.min((value / max) * 100, 100);
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[#64748B]">{value} / {max}</span>
          <span className="text-xs text-[#94A3B8] font-mono">{percent.toFixed(1)}%</span>
        </div>
      )}
      <div className={cn('w-full rounded-full bg-[#030712] overflow-hidden', height)}>
        <div
          className={cn('rounded-full transition-all duration-500', height)}
          style={{
            width: `${percent}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
