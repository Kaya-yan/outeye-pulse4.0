'use client';

import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  theory?: string;
  dataSource?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, theory, dataSource, children, className }: ChartCardProps) {
  return (
    <div className={cn('glass-card p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3>
          {subtitle && (
            <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>
          )}
        </div>
        {theory && (
          <div className="group relative">
            <button className="w-5 h-5 rounded-full bg-[#111827] text-[#64748B] flex items-center justify-center text-[10px] hover:bg-[#1E293B] transition-colors">
              i
            </button>
            <div className="absolute right-0 top-8 w-48 p-2 rounded-lg bg-[#0B1221] border border-[#1E293B] text-xs text-[#94A3B8] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {theory}
            </div>
          </div>
        )}
      </div>
      {children}
      {dataSource && (
        <div className="mt-3 text-[10px] text-[#64748B] text-right">
          数据来源: {dataSource}
        </div>
      )}
    </div>
  );
}
