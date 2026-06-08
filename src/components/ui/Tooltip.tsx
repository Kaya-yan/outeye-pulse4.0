'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 px-2 py-1 rounded-lg text-xs',
            'bg-[#0B1221] border border-[#1E293B] text-[#94A3B8]',
            'shadow-lg whitespace-nowrap',
            'bottom-full left-1/2 -translate-x-1/2 mb-2',
            className
          )}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#0B1221] border-r border-b border-[#1E293B] transform rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}
