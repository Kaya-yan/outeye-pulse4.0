'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { welchTTest, type TTestResult } from '@/lib/statistics';
import { cn, getDimensionLabel, getSignificanceLabel, getDimensionShortLabel } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const DIMENSIONS = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'] as const;

export default function IdentityLabPage() {
  const { posts, comments } = useAppStore();

  // Split comments into AIGC and Human groups
  const { aigcComments, humanComments } = useMemo(() => {
    const aigc: typeof comments = [];
    const human: typeof comments = [];

    comments.forEach(c => {
      if (!c.analysis) return;
      const post = posts.find(p => p.id === c.post_id);
      if (!post) return;

      if (post.is_aigc) {
        aigc.push(c);
      } else {
        human.push(c);
      }
    });

    return { aigcComments: aigc, humanComments: human };
  }, [posts, comments]);

  // Calculate statistics for each dimension
  const dimensionStats = useMemo(() => {
    return DIMENSIONS.map(dim => {
      const groupA = aigcComments
        .map(c => c.analysis?.[dim as keyof typeof c.analysis])
        .filter((v): v is number => typeof v === 'number');

      const groupB = humanComments
        .map(c => c.analysis?.[dim as keyof typeof c.analysis])
        .filter((v): v is number => typeof v === 'number');

      const result = welchTTest(groupA, groupB);

      return {
        dimension: dim,
        label: getDimensionLabel(dim),
        shortLabel: getDimensionShortLabel(dim),
        groupA,
        groupB,
        result,
      };
    });
  }, [aigcComments, humanComments]);

  // Radar chart option
  const radarOption = useMemo(() => {
    const aigcAvg = DIMENSIONS.map(dim => {
      const vals = aigcComments
        .map(c => c.analysis?.[dim as keyof typeof c.analysis])
        .filter((v): v is number => typeof v === 'number');
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });

    const humanAvg = DIMENSIONS.map(dim => {
      const vals = humanComments
        .map(c => c.analysis?.[dim as keyof typeof c.analysis])
        .filter((v): v is number => typeof v === 'number');
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });

    // Add significance markers to labels
    const indicators = DIMENSIONS.map((dim, i) => {
      const stat = dimensionStats[i];
      const sigMark = stat.result.significance !== 'ns' ? ` ${stat.result.significance}` : '';
      return {
        name: `${getDimensionLabel(dim)}${sigMark}`,
        max: 10,
      };
    });

    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: indicators,
        shape: 'polygon',
        splitNumber: 5,
        axisName: {
          color: '#94A3B8',
          fontSize: 11,
          formatter: (name: string) => {
            if (name.includes('***')) return `{sig|***} ${name.replace(' ***', '')}`;
            if (name.includes('**')) return `{sig|**} ${name.replace(' **', '')}`;
            if (name.includes('*')) return `{sig|*} ${name.replace(' *', '')}`;
            return name;
          },
          rich: {
            sig: {
              color: '#10B981',
              fontWeight: 'bold',
              fontSize: 12,
            },
          },
        },
        splitLine: { lineStyle: { color: '#1E293B' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [{
        type: 'radar',
        data: [
          {
            value: aigcAvg,
            name: `AIGC 组 (n=${aigcComments.length})`,
            lineStyle: { color: '#3B82F6', width: 2 },
            areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
            itemStyle: { color: '#3B82F6' },
          },
          {
            value: humanAvg,
            name: `人工组 (n=${humanComments.length})`,
            lineStyle: { color: '#10B981', width: 2 },
            areaStyle: { color: 'rgba(16, 185, 129, 0.15)' },
            itemStyle: { color: '#10B981' },
          },
        ],
      }],
      legend: {
        data: [`AIGC 组 (n=${aigcComments.length})`, `人工组 (n=${humanComments.length})`],
        bottom: 0,
        textStyle: { color: '#94A3B8' },
      },
    };
  }, [aigcComments, humanComments, dimensionStats]);

  // Funnel chart option (Identity levels)
  const funnelOption = useMemo(() => {
    const levels = [
      { name: '无认同', min: 1, max: 1.5 },
      { name: '个体钦佩', min: 1.5, max: 2.5 },
      { name: '职业认同', min: 2.5, max: 3.5 },
      { name: '地域认同', min: 3.5, max: 4.5 },
      { name: '民族认同', min: 4.5, max: 5.5 },
      { name: '国家使命认同', min: 5.5, max: 6.1 },
    ];

    const data = levels.map(level => {
      const count = comments.filter(c => {
        if (!c.analysis?.d3) return false;
        return c.analysis.d3 >= level.min && c.analysis.d3 < level.max;
      }).length;

      return {
        name: level.name,
        value: count,
      };
    });

    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'funnel',
        left: '10%',
        top: 20,
        bottom: 20,
        width: '80%',
        min: 0,
        max: Math.max(...data.map(d => d.value)),
        minSize: '10%',
        maxSize: '100%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          color: '#F8FAFC',
          fontSize: 11,
        },
        itemStyle: {
          borderColor: '#030712',
          borderWidth: 1,
        },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: {
            color: ['#EF4444', '#F59E0B', '#FBBF24', '#34D399', '#3B82F6', '#8B5CF6'][i],
          },
        })),
      }],
    };
  }, [comments]);

  // Hypotheses
  const hypotheses = [
    {
      id: 'H1',
      statement: 'AIGC 内容在 D3(认同层级) 上显著低于人工内容',
      dimension: 'd3',
      result: dimensionStats.find(d => d.dimension === 'd3')?.result,
    },
    {
      id: 'H2',
      statement: 'AIGC 内容在 D2_arousal(情感唤醒) 上显著高于人工内容',
      dimension: 'd2_arousal',
      result: dimensionStats.find(d => d.dimension === 'd2_arousal')?.result,
    },
    {
      id: 'H3',
      statement: 'AIGC 内容在 D5(叙事卷入) 上显著低于人工内容',
      dimension: 'd5',
      result: dimensionStats.find(d => d.dimension === 'd5')?.result,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          认同效果实验室
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          AIGC vs 人工内容的认同效果对比实验 · 含统计显著性检验
        </p>
      </div>

      {/* Group Info */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in">
        <div className="glass-card p-4 border-l-4 border-[#3B82F6]">
          <div className="text-xs text-[#64748B] mb-1">A组: AIGC 内容</div>
          <div className="text-2xl font-bold text-[#3B82F6]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
            n = {aigcComments.length}
          </div>
        </div>
        <div className="glass-card p-4 border-l-4 border-[#10B981]">
          <div className="text-xs text-[#64748B] mb-1">B组: 人工内容</div>
          <div className="text-2xl font-bold text-[#10B981]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
            n = {humanComments.length}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Comparison */}
        <div className="glass-card p-5 animate-fade-in stagger-1">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">六维雷达图对比</h3>
          <ReactECharts option={radarOption} style={{ height: 350 }} />
        </div>

        {/* Statistical Test Panel */}
        <div className="glass-card p-5 animate-fade-in stagger-2">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">统计检验面板</h3>
          <div className="space-y-4">
            {dimensionStats.map(stat => (
              <div key={stat.dimension} className="bg-[#030712] rounded-lg p-3 border border-[#1E293B]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#F8FAFC] font-medium">{stat.label}</span>
                  <span className={cn(
                    'text-sm font-bold',
                    stat.result.significance === '***' && 'text-[#10B981]',
                    stat.result.significance === '**' && 'text-[#10B981]',
                    stat.result.significance === '*' && 'text-[#6EE7B7]',
                    stat.result.significance === '?' && 'text-[#F59E0B]',
                    stat.result.significance === 'ns' && 'text-[#64748B]',
                  )}>
                    {stat.result.significance}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[#64748B]">t = </span>
                    <span className="text-[#F8FAFC] font-mono">{stat.result.t.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">p = </span>
                    <span className="text-[#F8FAFC] font-mono">{stat.result.p.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">d = </span>
                    <span className="text-[#F8FAFC] font-mono">{stat.result.cohensD.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-[#64748B]">
                    AIGC: {stat.result.mean1.toFixed(2)} | 人工: {stat.result.mean2.toFixed(2)}
                  </span>
                  <span className="text-[#94A3B8]">
                    {getSignificanceLabel(stat.result.significance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hypotheses */}
      <div className="glass-card p-5 animate-fade-in stagger-3">
        <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">核心假设检验</h3>
        <div className="space-y-3">
          {hypotheses.map(h => {
            const supported = h.result && h.result.p < 0.05;
            return (
              <div key={h.id} className="bg-[#030712] rounded-lg p-4 border border-[#1E293B]">
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'px-2 py-1 rounded text-xs font-bold',
                    supported ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#64748B]/10 text-[#64748B]'
                  )}>
                    {h.id}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-[#F8FAFC]">{h.statement}</p>
                    {h.result && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-[#94A3B8]">
                        <span>t = {h.result.t.toFixed(2)}</span>
                        <span>p = {h.result.p.toFixed(3)}</span>
                        <span>Cohen's d = {h.result.cohensD.toFixed(2)}</span>
                        <span className={cn(
                          'font-medium',
                          supported ? 'text-[#10B981]' : 'text-[#64748B]'
                        )}>
                          {supported ? '支持' : '不支持'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Identity Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5 animate-fade-in stagger-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">认同层级漏斗图</h3>
          <ReactECharts option={funnelOption} style={{ height: 300 }} />
        </div>

        {/* Export Button */}
        <div className="glass-card p-5 flex flex-col justify-center items-center animate-fade-in stagger-5">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">导出检验报告</h3>
          <p className="text-xs text-[#94A3B8] text-center mb-4">
            导出完整的统计检验报告，包含原始数据、检验过程和结论
          </p>
          <button className="px-6 py-2 rounded-lg bg-[#3B82F6] text-white text-sm hover:bg-[#2563EB] transition-colors">
            导出检验报告
          </button>
        </div>
      </div>
    </div>
  );
}
