'use client';

import { cn, getRiskColor, getRiskLabel } from '@/lib/utils';

interface RiskBadgeProps {
  level: 'safe' | 'low' | 'medium' | 'high';
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  const color = getRiskColor(level);
  const label = getRiskLabel(level);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        className
      )}
      style={{
        color,
        backgroundColor: `${color}15`,
        borderColor: `${color}30`,
        borderWidth: 1,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
