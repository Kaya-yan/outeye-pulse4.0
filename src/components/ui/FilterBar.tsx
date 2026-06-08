'use client';

import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  className?: string;
}

export function FilterBar({ className }: FilterBarProps) {
  const { filters, setFilters, resetFilters } = useAppStore();

  return (
    <div className={cn('glass-card p-4', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.platform}
          onChange={(e) => setFilters({ platform: e.target.value as typeof filters.platform })}
          className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none transition-colors"
        >
          <option value="all">平台: 全部</option>
          <option value="xhs">小红书</option>
          <option value="bilibili">B站</option>
        </select>

        <select
          value={filters.timeRange}
          onChange={(e) => setFilters({ timeRange: e.target.value as typeof filters.timeRange })}
          className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none transition-colors"
        >
          <option value="7d">近7天</option>
          <option value="30d">近30天</option>
          <option value="90d">近90天</option>
        </select>

        <select
          value={filters.contentType}
          onChange={(e) => setFilters({ contentType: e.target.value as typeof filters.contentType })}
          className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none transition-colors"
        >
          <option value="all">类型: 全部</option>
          <option value="aigc">AIGC</option>
          <option value="human">人工</option>
        </select>

        <select
          value={filters.riskLevel}
          onChange={(e) => setFilters({ riskLevel: e.target.value as typeof filters.riskLevel })}
          className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none transition-colors"
        >
          <option value="all">风险: 全部</option>
          <option value="safe">安全</option>
          <option value="low">低危</option>
          <option value="medium">中危</option>
          <option value="high">高危</option>
        </select>

        <select
          value={filters.sentiment}
          onChange={(e) => setFilters({ sentiment: e.target.value as typeof filters.sentiment })}
          className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none transition-colors"
        >
          <option value="all">情感: 全部</option>
          <option value="positive">正向</option>
          <option value="neutral">中性</option>
          <option value="negative">负向</option>
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={resetFilters}
            className="px-3 py-1.5 rounded-lg bg-[#111827] text-[#64748B] text-xs hover:text-[#94A3B8] transition-colors"
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
