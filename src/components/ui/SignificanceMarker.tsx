'use client';

import { cn, getSignificanceLabel } from '@/lib/utils';

interface SignificanceMarkerProps {
  significance: '***' | '**' | '*' | '?' | 'ns';
  showLabel?: boolean;
  className?: string;
}

export function SignificanceMarker({ significance, showLabel = true, className }: SignificanceMarkerProps) {
  const getColor = () => {
    switch (significance) {
      case '***': return 'text-[#10B981]';
      case '**': return 'text-[#10B981]';
      case '*': return 'text-[#6EE7B7]';
      case '?': return 'text-[#F59E0B]';
      case 'ns': return 'text-[#64748B]';
    }
  };

  const getBg = () => {
    switch (significance) {
      case '***': return 'bg-[#10B981]/10 border-[#10B981]/30';
      case '**': return 'bg-[#10B981]/10 border-[#10B981]/20';
      case '*': return 'bg-[#6EE7B7]/10 border-[#6EE7B7]/20';
      case '?': return 'bg-[#F59E0B]/10 border-[#F59E0B]/20';
      case 'ns': return 'bg-[#64748B]/10 border-[#64748B]/20';
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold border',
        getColor(),
        getBg(),
        significance === '***' && 'shadow-[0_0_8px_rgba(16,185,129,0.3)]',
        className
      )}
    >
      {significance}
      {showLabel && (
        <span className="font-sans font-normal text-[10px] opacity-70">
          {getSignificanceLabel(significance)}
        </span>
      )}
    </span>
  );
}
