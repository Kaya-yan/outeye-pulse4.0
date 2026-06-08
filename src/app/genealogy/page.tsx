'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { getNarrativeLabel, NARRATIVE_COLORS } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function GenealogyPage() {
  const { posts, comments } = useAppStore();

  // Sunburst data
  const sunburstOption = useMemo(() => {
    const platformData: Record<string, Record<string, number>> = {
      xhs: {},
      bilibili: {},
    };

    comments.forEach(c => {
      if (!c.analysis?.narrative_type) return;
      const post = posts.find(p => p.id === c.post_id);
      if (!post) return;

      const platform = post.platform;
      const nt = c.analysis.narrative_type;

      if (!platformData[platform][nt]) {
        platformData[platform][nt] = 0;
      }
      platformData[platform][nt]++;
    });

    const children = Object.entries(platformData).map(([platform, types]) => ({
      name: platform === 'xhs' ? '小红书' : 'B站',
      children: Object.entries(types).map(([type, count]) => ({
        name: getNarrativeLabel(type),
        value: count,
        itemStyle: { color: NARRATIVE_COLORS[type] },
      })),
    }));

    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'sunburst',
        data: children,
        radius: ['15%', '85%'],
        sort: undefined,
        emphasis: {
          focus: 'ancestor',
        },
        levels: [
          {},
          {
            r0: '15%',
            r: '45%',
            itemStyle: { borderWidth: 2 },
            label: { rotate: 'tangential', fontSize: 12 },
          },
          {
            r0: '45%',
            r: '85%',
            label: { align: 'right', fontSize: 11 },
          },
        ],
        label: { color: '#F8FAFC' },
        itemStyle: { borderColor: '#030712', borderWidth: 2 },
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
    };
  }, [posts, comments]);

  // Heatmap (Platform x Narrative)
  const heatmapOption = useMemo(() => {
    const platforms = ['xhs', 'bilibili'];
    const platformLabels = ['小红书', 'B站'];
    const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

    const data: number[][] = [];

    platforms.forEach((platform, pi) => {
      narrativeTypes.forEach((nt, ni) => {
        const count = comments.filter(c => {
          if (c.analysis?.narrative_type !== nt) return false;
          const post = posts.find(p => p.id === c.post_id);
          return post?.platform === platform;
        }).length;
        data.push([pi, ni, count]);
      });
    });

    return {
      backgroundColor: 'transparent',
      grid: { top: 40, right: 20, bottom: 40, left: 60 },
      xAxis: {
        type: 'category',
        data: platformLabels,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8' },
      },
      yAxis: {
        type: 'category',
        data: narrativeTypes.map(t => `${t} ${getNarrativeLabel(t)}`),
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: Math.max(...data.map(d => d[2] as number), 1),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: ['#030712', '#1E3A5F', '#1E293B', '#3B82F6', '#60A5FA'],
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
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
    };
  }, [posts, comments]);

  // Narrative distribution bar chart
  const barOption = useMemo(() => {
    const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const counts = narrativeTypes.map(nt =>
      comments.filter(c => c.analysis?.narrative_type === nt).length
    );

    return {
      backgroundColor: 'transparent',
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      xAxis: {
        type: 'category',
        data: narrativeTypes.map(t => `${t}\n${getNarrativeLabel(t)}`),
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B' },
        splitLine: { lineStyle: { color: '#1E293B', type: 'dashed' } },
      },
      series: [{
        type: 'bar',
        data: counts.map((v, i) => ({
          value: v,
          itemStyle: {
            color: NARRATIVE_COLORS[narrativeTypes[i]],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: 40,
        label: {
          show: true,
          position: 'top',
          color: '#94A3B8',
          fontSize: 11,
        },
      }],
    };
  }, [comments]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          叙事谱系图谱
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          中观层面的叙事类型分布与演化分析
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sunburst */}
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">叙事类型旭日图</h3>
          <p className="text-xs text-[#64748B] mb-3">内环: 平台 | 外环: 叙事类型</p>
          <ReactECharts option={sunburstOption} style={{ height: 400 }} />
        </div>

        {/* Heatmap */}
        <div className="glass-card p-5 animate-fade-in stagger-1">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">平台-叙事交叉矩阵</h3>
          <ReactECharts option={heatmapOption} style={{ height: 400 }} />
        </div>
      </div>

      {/* Bar Chart */}
      <div className="glass-card p-5 animate-fade-in stagger-2">
        <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">叙事类型分布</h3>
        <ReactECharts option={barOption} style={{ height: 300 }} />
      </div>
    </div>
  );
}
