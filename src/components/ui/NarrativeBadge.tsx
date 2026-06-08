'use client';

import { cn, getNarrativeLabel, NARRATIVE_COLORS } from '@/lib/utils';

interface NarrativeBadgeProps {
  type: string;
  className?: string;
}

export function NarrativeBadge({ type, className }: NarrativeBadgeProps) {
  const color = NARRATIVE_COLORS[type] || '#3B82F6';
  const label = getNarrativeLabel(type);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        className
      )}
      style={{
        color,
        backgroundColor: `${color}15`,
        borderColor: `${color}30`,
        borderWidth: 1,
      }}
    >
      {type} {label}
    </span>
  );
}
