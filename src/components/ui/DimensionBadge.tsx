'use client';

import { useState } from 'react';
import { cn, getDimensionLabel, getDimensionPlainLabel, getDimensionExplanation } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';

interface DimensionBadgeProps {
  dim: string;
  value?: number;
  showValue?: boolean;
  className?: string;
}

export function DimensionBadge({ dim, value, showValue = false, className }: DimensionBadgeProps) {
  const { terminologyMode } = useAppStore();
  const [showTooltip, setShowTooltip] = useState(false);

  const label = terminologyMode === 'plain' ? getDimensionPlainLabel(dim) : getDimensionLabel(dim);
  const explanation = getDimensionExplanation(dim);

  return (
    <span
      className={cn('relative inline-flex items-center gap-1 cursor-help', className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-xs text-[#94A3B8] border-b border-dotted border-[#475569]">
        {label}
      </span>
      {showValue && value != null && (
        <span className="text-xs text-[#60A5FA] font-mono">{typeof value === 'number' ? value.toFixed(1) : value}</span>
      )}
      {showTooltip && explanation && (
        <span className="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 bg-[#1E293B] border border-[#334155] rounded-lg text-xs text-[#CBD5E1] leading-relaxed shadow-lg">
          {explanation}
        </span>
      )}
    </span>
  );
}
