'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number;
  isPercent?: boolean;
  change?: number;
  color?: string;
  className?: string;
}

export function KPICard({ label, value, isPercent = false, change, color = '#3B82F6', className }: KPICardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, value);
      setDisplayValue(current);

      if (step >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const formatValue = (v: number) => {
    if (isPercent) {
      return (v * 100).toFixed(1) + '%';
    }
    if (v >= 10000) {
      return (v / 10000).toFixed(1) + '万';
    }
    return Math.round(v).toLocaleString();
  };

  return (
    <div
      ref={ref}
      className={cn(
        'glass-card p-4 animate-fade-in',
        'transition-all duration-200',
        className
      )}
    >
      <div className="text-xs text-[var(--color-text-muted)] mb-2">{label}</div>
      <div
        className="text-2xl font-bold tabular-nums"
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          color: color,
        }}
      >
        {formatValue(displayValue)}
      </div>
      {change !== undefined && change !== 0 && (
        <div className={cn(
          'text-xs mt-1 flex items-center gap-1',
          change > 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'
        )}>
          <span>{change > 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(change)}%</span>
          <span className="text-[var(--color-text-muted)]">vs 上期</span>
        </div>
      )}
    </div>
  );
}
