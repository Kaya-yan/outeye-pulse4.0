'use client';

import { useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useChartStore } from '@/stores/useChartStore';
import { computeDemoStats } from '@/lib/demo-data';
import { cn, formatNumber, formatPercent, getDimensionLabel, getNarrativeLabel, NARRATIVE_COLORS } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Dynamic import for ECharts to avoid SSR issues
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function DashboardPage() {
  const { posts, comments, filters, setFilters } = useAppStore();
  const { selectedNarrativeType, selectedRiskLevel, setSelectedNarrativeType, setSelectedRiskLevel, clearSelections } = useChartStore();

  const stats = useMemo(() => {
    if (posts.length === 0) return null;
    return computeDemoStats(posts, comments);
  }, [posts, comments]);

  const filteredComments = useMemo(() => {
    const now = Date.now();
    const rangeMs: Record<string, number> = { '7d': 7 * 86400000, '30d': 30 * 86400000, '90d': 90 * 86400000 };
    const cutoff = rangeMs[filters.timeRange] ? now - rangeMs[filters.timeRange] : 0;

    return comments.filter(c => {
      // Time range filter
      if (cutoff > 0) {
        const commentTime = new Date(c.created_at).getTime();
        if (commentTime < cutoff) return false;
      }
      if (filters.platform !== 'all') {
        const post = posts.find(p => p.id === c.post_id);
        if (post && post.platform !== filters.platform) return false;
      }
      if (filters.contentType !== 'all') {
        const post = posts.find(p => p.id === c.post_id);
        if (post) {
          if (filters.contentType === 'aigc' && !post.is_aigc) return false;
          if (filters.contentType === 'human' && post.is_aigc) return false;
        }
      }
      if (filters.sentiment !== 'all' && c.analysis) {
        if (filters.sentiment === 'positive' && (c.analysis.d2_valence || 0) < 0.2) return false;
        if (filters.sentiment === 'negative' && (c.analysis.d2_valence || 0) > -0.2) return false;
        if (filters.sentiment === 'neutral' && Math.abs(c.analysis.d2_valence || 0) > 0.2) return false;
      }
      if (filters.riskLevel !== 'all' && c.analysis) {
        if (c.analysis.risk_level !== filters.riskLevel) return false;
      }
      if (filters.narrativeTypes.length > 0 && c.analysis) {
        if (!filters.narrativeTypes.includes(c.analysis.narrative_type || '')) return false;
      }
      return true;
    });
  }, [comments, posts, filters]);

  const analyzedComments = useMemo(() => {
    return filteredComments.filter(c => c.analysis);
  }, [filteredComments]);

  // Chart linking: filter by narrative type selection
  const linkedComments = useMemo(() => {
    let result = analyzedComments;
    if (selectedNarrativeType) {
      result = result.filter(c => c.analysis?.narrative_type === selectedNarrativeType);
    }
    if (selectedRiskLevel) {
      result = result.filter(c => c.analysis?.risk_level === selectedRiskLevel);
    }
    return result;
  }, [analyzedComments, selectedNarrativeType, selectedRiskLevel]);

  const onSunburstClick = useCallback((params: { data?: { name?: string } }) => {
    if (params.data?.name) {
      // Find the narrative type by reversing the label lookup
      const types = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
      const matched = types.find(t => getNarrativeLabel(t) === params.data!.name);
      if (matched) {
        setSelectedNarrativeType(selectedNarrativeType === matched ? null : matched);
      }
    }
  }, [selectedNarrativeType, setSelectedNarrativeType]);

  const onHeatmapClick = useCallback((params: { data?: [number, number, number] }) => {
    if (params.data) {
      const riskLevels = ['safe', 'low', 'medium', 'high'];
      const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
      const nt = narrativeTypes[params.data[0]];
      const rl = riskLevels[params.data[1]];
      if (selectedNarrativeType === nt && selectedRiskLevel === rl) {
        clearSelections();
      } else {
        setSelectedNarrativeType(nt);
        setSelectedRiskLevel(rl);
      }
    }
  }, [selectedNarrativeType, selectedRiskLevel, setSelectedNarrativeType, setSelectedRiskLevel, clearSelections]);

  // KPI Stats
  const kpiStats = useMemo(() => {
    if (!stats) return [];
    const highRisk = filteredComments.filter(c => c.analysis?.risk_level === 'high').length;
    const aigcPosts = posts.filter(p => p.is_aigc);
    const aigcRatio = posts.length > 0 ? aigcPosts.length / posts.length : 0;

    return [
      { label: '总笔记数', value: posts.length, color: '#3B82F6' },
      { label: '总评论数', value: filteredComments.length, color: '#3B82F6' },
      { label: '高危风险', value: highRisk, color: '#EF4444' },
      { label: 'AIGC 占比', value: aigcRatio, isPercent: true, color: '#8B5CF6' },
      { label: '采样评论', value: analyzedComments.length, color: '#10B981' },
      { label: '叙事类型数', value: stats.narrativeDistribution ? Object.keys(stats.narrativeDistribution).length : 0, color: '#F59E0B' },
    ];
  }, [stats, posts, filteredComments, analyzedComments]);

  // Scatter chart option (Russell Model: Valence vs Arousal)
  const scatterOption = useMemo(() => {
    const data = linkedComments.map(c => ({
      value: [c.analysis?.d2_valence || 0, c.analysis?.d2_arousal || 0],
      symbolSize: Math.max(8, Math.min(30, (c.likes || 0) / 10)),
      itemStyle: {
        color: c.analysis?.risk_level === 'high' ? '#EF4444' :
               c.analysis?.risk_level === 'medium' ? '#F59E0B' :
               c.analysis?.risk_level === 'low' ? '#6EE7B7' : '#3B82F6',
        opacity: 0.7,
      },
      commentId: c.id,
    }));

    return {
      backgroundColor: 'transparent',
      grid: { top: 40, right: 40, bottom: 40, left: 50 },
      xAxis: {
        name: '情感效价 (D2_valence)',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        type: 'value',
        min: -1,
        max: 1,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B' },
        splitLine: { lineStyle: { color: '#1E293B', type: 'dashed' } },
      },
      yAxis: {
        name: '情感唤醒 (D2_arousal)',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        type: 'value',
        min: 0,
        max: 1,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B' },
        splitLine: { lineStyle: { color: '#1E293B', type: 'dashed' } },
      },
      series: [{
        type: 'scatter',
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(59, 130, 246, 0.5)',
          },
        },
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
        formatter: (params: { value: number[] }) => {
          return `效价: ${params.value[0]?.toFixed(2)}<br/>唤醒: ${params.value[1]?.toFixed(2)}`;
        },
      },
    };
  }, [linkedComments]);

  // Radar chart option (6 dimensions)
  const radarOption = useMemo(() => {
    if (!stats) return {};

    const aigcComments = linkedComments.filter(c => {
      const post = posts.find(p => p.id === c.post_id);
      return post?.is_aigc;
    });
    const humanComments = linkedComments.filter(c => {
      const post = posts.find(p => p.id === c.post_id);
      return post && !post.is_aigc;
    });

    const calcAvg = (arr: typeof linkedComments, dim: string) => {
      const vals = arr.map(c => {
        const val = c.analysis?.[dim as keyof typeof c.analysis];
        return typeof val === 'number' ? val : 0;
      });
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const dimensions = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
    const dimLabels = dimensions.map(d => getDimensionLabel(d));

    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: dimLabels.map(name => ({ name, max: 10 })),
        shape: 'polygon',
        splitNumber: 5,
        axisName: { color: '#94A3B8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1E293B' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [{
        type: 'radar',
        data: [
          {
            value: dimensions.map(d => calcAvg(aigcComments, d)),
            name: 'AIGC 组',
            lineStyle: { color: '#3B82F6', width: 2 },
            areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
            itemStyle: { color: '#3B82F6' },
          },
          {
            value: dimensions.map(d => calcAvg(humanComments, d)),
            name: '人工组',
            lineStyle: { color: '#10B981', width: 2 },
            areaStyle: { color: 'rgba(16, 185, 129, 0.15)' },
            itemStyle: { color: '#10B981' },
          },
        ],
      }],
      legend: {
        data: ['AIGC 组', '人工组'],
        bottom: 0,
        textStyle: { color: '#94A3B8' },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
    };
  }, [stats, linkedComments, posts]);

  // Sunburst chart option (Narrative types)
  const sunburstOption = useMemo(() => {
    if (!stats) return {};

    const children = Object.entries(stats.narrativeDistribution).map(([type, count]) => ({
      name: getNarrativeLabel(type),
      value: count,
      itemStyle: { color: NARRATIVE_COLORS[type] || '#3B82F6' },
    }));

    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'sunburst',
        data: children,
        radius: ['20%', '80%'],
        label: {
          color: '#F8FAFC',
          fontSize: 11,
        },
        itemStyle: {
          borderRadius: 4,
          borderColor: '#030712',
          borderWidth: 2,
        },
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
    };
  }, [stats]);

  // Heatmap option (Ethical risk)
  const heatmapOption = useMemo(() => {
    const riskData: Record<string, Record<string, number>> = {};
    const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

    narrativeTypes.forEach(t => {
      riskData[t] = { safe: 0, low: 0, medium: 0, high: 0 };
    });

    linkedComments.forEach(c => {
      if (c.analysis?.narrative_type && c.analysis?.risk_level) {
        const nt = c.analysis.narrative_type;
        const rl = c.analysis.risk_level;
        if (riskData[nt]) {
          riskData[nt][rl] = (riskData[nt][rl] || 0) + 1;
        }
      }
    });

    const data: number[][] = [];
    const riskLevels = ['safe', 'low', 'medium', 'high'];

    narrativeTypes.forEach((t, ti) => {
      riskLevels.forEach((r, ri) => {
        data.push([ti, ri, riskData[t]?.[r] || 0]);
      });
    });

    return {
      backgroundColor: 'transparent',
      grid: { top: 40, right: 20, bottom: 40, left: 60 },
      xAxis: {
        type: 'category',
        data: narrativeTypes.map(t => getNarrativeLabel(t)),
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: ['安全', '低危', '中危', '高危'],
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: 50,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: ['#030712', '#064E3B', '#065F46', '#047857', '#059669', '#10B981', '#F59E0B', '#EF4444'],
        },
        textStyle: { color: '#64748B' },
      },
      series: [{
        type: 'heatmap',
        data,
        label: {
          show: true,
          color: '#F8FAFC',
          fontSize: 11,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(59, 130, 246, 0.5)',
          },
        },
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
    };
  }, [linkedComments]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-[#64748B] mb-4">暂无数据，请先在入口控制台加载项目</p>
          <a href="/p0" className="px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm">
            前往入口控制台
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
            数据驾驶舱
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            宏观数据可视化 · 一屏掌握传播态势
          </p>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="glass-card p-4 animate-fade-in">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.platform}
            onChange={(e) => setFilters({ platform: e.target.value as typeof filters.platform })}
            aria-label="平台筛选"
            className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
          >
            <option value="all">平台: 全部</option>
            <option value="xhs">小红书</option>
            <option value="bilibili">B站</option>
          </select>

          <select
            value={filters.timeRange}
            onChange={(e) => setFilters({ timeRange: e.target.value as typeof filters.timeRange })}
            aria-label="时间范围"
            className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
          >
            <option value="7d">近7天</option>
            <option value="30d">近30天</option>
            <option value="90d">近90天</option>
          </select>

          <select
            value={filters.contentType}
            onChange={(e) => setFilters({ contentType: e.target.value as typeof filters.contentType })}
            aria-label="内容类型"
            className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
          >
            <option value="all">类型: 全部</option>
            <option value="aigc">AIGC</option>
            <option value="human">人工</option>
          </select>

          <select
            value={filters.riskLevel}
            onChange={(e) => setFilters({ riskLevel: e.target.value as typeof filters.riskLevel })}
            aria-label="风险等级"
            className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
          >
            <option value="all">风险: 全部</option>
            <option value="safe">安全</option>
            <option value="low">低危</option>
            <option value="medium">中危</option>
            <option value="high">高危</option>
          </select>

          <button
            onClick={() => setFilters({ narrativeTypes: [] })}
            className="px-3 py-1.5 rounded-lg bg-[#3B82F6]/10 text-[#60A5FA] text-sm hover:bg-[#3B82F6]/20 transition-colors"
          >
            清除叙事筛选
          </button>
          <button
            onClick={() => setFilters({ platform: 'all', timeRange: '30d', contentType: 'all', narrativeTypes: [], sentiment: 'all', riskLevel: 'all' })}
            className="px-3 py-1.5 rounded-lg bg-[#111827] text-[#64748B] text-sm hover:text-[#94A3B8] border border-[#1E293B] hover:border-[#334155] transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiStats.map((kpi, i) => (
          <div key={kpi.label} className={cn('glass-card p-4 animate-fade-in', `stagger-${i + 1}`)}>
            <div className="text-xs text-[#64748B] mb-2">{kpi.label}</div>
            <div
              className="text-2xl font-bold text-[#F8FAFC]"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {kpi.isPercent ? formatPercent(kpi.value as number) : formatNumber(kpi.value as number)}
            </div>
          </div>
        ))}
      </div>

      {/* Chart Linking Indicator */}
      {(selectedNarrativeType || selectedRiskLevel) && (
        <div className="glass-card p-3 animate-fade-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8]">图表联动筛选:</span>
            {selectedNarrativeType && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#8B5CF6]/20 text-[#A78BFA]">
                叙事: {getNarrativeLabel(selectedNarrativeType)}
                <button onClick={() => setSelectedNarrativeType(null)} className="ml-1.5 text-[#64748B] hover:text-[#F8FAFC]">×</button>
              </span>
            )}
            {selectedRiskLevel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#EF4444]/20 text-[#FCA5A5]">
                风险: {selectedRiskLevel}
                <button onClick={() => setSelectedRiskLevel(null)} className="ml-1.5 text-[#64748B] hover:text-[#F8FAFC]">×</button>
              </span>
            )}
          </div>
          <button
            onClick={clearSelections}
            className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors"
          >
            清除全部
          </button>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter Plot (Russell Model) */}
        <div className="glass-card p-5 animate-fade-in stagger-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">情感效价-唤醒散点图</h3>
              <p className="text-xs text-[#64748B] mt-0.5">基于 Russell 情感环状模型</p>
            </div>
            <span className="text-[10px] text-[#64748B] bg-[#030712] px-2 py-1 rounded">
              数据来源: {linkedComments.length} 条评论
            </span>
          </div>
          <ReactECharts option={scatterOption} style={{ height: 300 }} />
        </div>

        {/* Radar Chart (6 Dimensions) */}
        <div className="glass-card p-5 animate-fade-in stagger-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">六维态度雷达图</h3>
              <p className="text-xs text-[#64748B] mt-0.5">ELM + 阿斯曼 + 叙事传输</p>
            </div>
          </div>
          <ReactECharts option={radarOption} style={{ height: 300 }} />
        </div>

        {/* Sunburst (Narrative Types) */}
        <div className="glass-card p-5 animate-fade-in stagger-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">叙事类型旭日图</h3>
              <p className="text-xs text-[#64748B] mt-0.5">基于 Labov 叙事结构理论 · 点击筛选</p>
            </div>
          </div>
          <ReactECharts
            option={sunburstOption}
            style={{ height: 300 }}
            onEvents={{ click: onSunburstClick }}
          />
        </div>

        {/* Heatmap (Ethical Risk) */}
        <div className="glass-card p-5 animate-fade-in stagger-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">伦理风险热力图</h3>
              <p className="text-xs text-[#64748B] mt-0.5">媒介伦理框架 · 点击筛选</p>
            </div>
          </div>
          <ReactECharts
            option={heatmapOption}
            style={{ height: 300 }}
            onEvents={{ click: onHeatmapClick }}
          />
        </div>
      </div>
    </div>
  );
}
