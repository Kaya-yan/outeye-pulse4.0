'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn, formatNumber, getNarrativeLabel, getDimensionLabel, getDimensionPlainLabel, getChartInterpretation, NARRATIVE_COLORS } from '@/lib/utils';
import { computeDemoStats } from '@/lib/demo-data';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const TABS = [
  { key: 'overview', label: '总览', desc: 'KPI + 研究发现' },
  { key: 'emotion', label: '情感地图', desc: '效价·唤醒·情感分布' },
  { key: 'narrative', label: '叙事分析', desc: '类型分布·平台交叉' },
  { key: 'risk', label: '风险监测', desc: '伦理风险·高危评论' },
  { key: 'compare', label: '统计检验', desc: 'AIGC vs 人工·t检验' },
] as const;

type TabKey = typeof TABS[number]['key'];

const DIMENSIONS = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
const NARRATIVE_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

function avgDim(arr: { analysis: any }[], dim: string): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, c) => s + (Number(c.analysis?.[dim]) || 0), 0) / arr.length;
}

// ─── Findings Generator ────────────────────────────────────────
function generateFindings(posts: any[], comments: any[], analyzed: any[]): string[] {
  if (analyzed.length === 0) return [];

  const findings: string[] = [];

  // Top narrative
  const nc: Record<string, number> = {};
  for (const c of analyzed) {
    const nt = c.analysis?.narrative_type;
    if (nt) nc[nt] = (nc[nt] || 0) + 1;
  }
  const sorted = Object.entries(nc).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const pct = ((sorted[0][1] / analyzed.length) * 100).toFixed(1);
    findings.push(`评论中占比最高的叙事类型是"${getNarrativeLabel(sorted[0][0])}"（${pct}%），共 ${sorted[0][1]} 条。`);
  }

  // Emotion
  const avgV = analyzed.reduce((s, c) => s + (c.analysis?.d2_valence || 0), 0) / analyzed.length;
  if (avgV > 0.2) {
    findings.push(`情感效价总体偏正向（均值 ${avgV.toFixed(2)}），公众情感以正面为主。`);
  } else if (avgV < -0.2) {
    findings.push(`情感效价偏负向（均值 ${avgV.toFixed(2)}），需关注负面情感来源。`);
  } else {
    findings.push(`情感效价接近中性（均值 ${avgV.toFixed(2)}），公众态度较为理性。`);
  }

  // Identity
  const avgD3 = analyzed.reduce((s, c) => s + (c.analysis?.d3 || 0), 0) / analyzed.length;
  if (avgD3 > 4) {
    findings.push(`认同层级较高（D3 均值 ${avgD3.toFixed(1)}），公众倾向于将郭永怀置于集体记忆框架中。`);
  }

  // Risk
  const highRisk = analyzed.filter(c => c.analysis?.risk_level === 'high');
  if (highRisk.length > 0) {
    findings.push(`检测到 ${highRisk.length} 条高风险评论，建议进行人工审查。`);
  }

  return findings;
}

// ─── Overview Tab ───────────────────────────────────────────────
function OverviewTab({ posts, comments, analyzed, stats }: { posts: any[]; comments: any[]; analyzed: any[]; stats: any }) {
  const findings = useMemo(() => generateFindings(posts, comments, analyzed), [posts, comments, analyzed]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '内容数', value: posts.length, unit: '篇' },
          { label: '评论数', value: comments.length, unit: '条' },
          { label: '已分析', value: analyzed.length, unit: '条' },
          { label: '高风险', value: analyzed.filter(c => c.analysis?.risk_level === 'high').length, unit: '条' },
        ].map((kpi, i) => (
          <div
            key={kpi.label}
            className={cn('glass-card p-4 text-center animate-fade-in-up', `stagger-${i + 1}`)}
          >
            <div className="text-2xl font-bold text-[var(--color-text-primary)] font-mono">{formatNumber(kpi.value)}</div>
            <div className="text-[10px] text-[var(--color-text-muted)] mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div className="finding-card p-5 animate-fade-in-up stagger-5">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
            研究发现
          </h3>
          <div className="space-y-3">
            {findings.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] text-[10px] flex items-center justify-center font-mono mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis pending */}
      {posts.length > 0 && analyzed.length === 0 && comments.length > 0 && (
        <div className="glass-card p-6 text-center animate-fade-in">
          <p className="text-sm text-[var(--color-accent-amber)] mb-2">数据已采集，AI 分析正在自动进行</p>
          <p className="text-xs text-[var(--color-text-muted)]">分析完成后即可查看可视化图表</p>
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="glass-card p-8 text-center animate-fade-in">
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">暂无数据</p>
          <p className="text-xs text-[var(--color-text-muted)]">前往采集台粘贴链接开始采集</p>
        </div>
      )}
    </div>
  );
}

// ─── Emotion Tab ────────────────────────────────────────────────
function EmotionTab({ analyzed }: { analyzed: any[] }) {
  const scatterOption = useMemo(() => {
    const data = analyzed
      .filter(c => c.analysis?.d2_valence != null && c.analysis?.d2_arousal != null)
      .map(c => ({
        value: [c.analysis.d2_valence, c.analysis.d2_arousal, c.analysis.d3 || 1],
        itemStyle: {
          color: c.analysis?.risk_level === 'high' ? '#EF4444' :
                 c.analysis?.risk_level === 'medium' ? '#F59E0B' :
                 c.analysis?.narrative_type ? NARRATIVE_COLORS[c.analysis.narrative_type] : '#3B82F6',
          opacity: 0.7,
        },
      }));

    return {
      tooltip: { formatter: (p: { value: number[] }) => `效价: ${p.value[0]?.toFixed(2)}<br/>唤醒: ${p.value[1]?.toFixed(2)}<br/>认同: ${p.value[2]?.toFixed(1)}` },
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      xAxis: { name: '情感效价', nameLocation: 'center', nameGap: 25, nameTextStyle: { color: '#94A3B8', fontSize: 11 }, type: 'value', min: -1, max: 1, splitLine: { lineStyle: { color: '#1E293B' } }, axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      yAxis: { name: '情感唤醒', nameLocation: 'center', nameGap: 35, nameTextStyle: { color: '#94A3B8', fontSize: 11 }, type: 'value', min: 0, max: 1, splitLine: { lineStyle: { color: '#1E293B' } }, axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      series: [{ type: 'scatter', symbolSize: (val: number[]) => Math.max(6, Math.min(20, val[2] * 3)), data, emphasis: { scale: 1.5 } }],
    };
  }, [analyzed]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  return (
    <div className="space-y-6">
      <div className="chart-academic">
        <div className="chart-title">情感空间分布</div>
        <div className="chart-subtitle">Russell 情感环状模型：效价 × 唤醒度（点大小=认同层级）</div>
        <ReactECharts option={scatterOption} style={{ height: 400 }} />
        <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {getChartInterpretation('emotion-scatter')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Narrative Tab ──────────────────────────────────────────────
function NarrativeTab({ analyzed, posts }: { analyzed: any[]; posts: any[] }) {
  const postMap = useMemo(() => new Map(posts.map(p => [p.id, p])), [posts]);

  const pieOption = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of analyzed) {
      const nt = c.analysis?.narrative_type;
      if (nt) counts[nt] = (counts[nt] || 0) + 1;
    }
    const data = NARRATIVE_TYPES.map(t => ({
      name: getNarrativeLabel(t),
      value: counts[t] || 0,
      itemStyle: { color: NARRATIVE_COLORS[t] },
    })).filter(d => d.value > 0);

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#94A3B8', fontSize: 11 } },
      series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'], avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: '#030712', borderWidth: 2 }, label: { show: true, color: '#CBD5E1', fontSize: 11, formatter: '{b}\n{d}%' }, data }],
    };
  }, [analyzed]);

  const sunburstOption = useMemo(() => {
    const platformData: Record<string, Record<string, number>> = {};
    for (const c of analyzed) {
      const platform = postMap.get(c.post_id)?.platform || 'unknown';
      const nt = c.analysis?.narrative_type || 'unknown';
      if (!platformData[platform]) platformData[platform] = {};
      platformData[platform][nt] = (platformData[platform][nt] || 0) + 1;
    }
    const platformColors: Record<string, string> = { bilibili: '#00A1D6', xhs: '#FE2C55' };
    const children = Object.entries(platformData).map(([platform, ntMap]) => ({
      name: platform === 'bilibili' ? 'B站' : '小红书',
      itemStyle: { color: platformColors[platform] || '#64748B' },
      children: Object.entries(ntMap).map(([nt, count]) => ({
        name: getNarrativeLabel(nt), value: count, itemStyle: { color: NARRATIVE_COLORS[nt] },
      })),
    }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 条' },
      series: [{ type: 'sunburst', data: children, radius: ['12%', '90%'], sort: undefined, emphasis: { focus: 'ancestor' }, levels: [{}, { r0: '12%', r: '45%', label: { rotate: 'tangential', fontSize: 11, color: '#F8FAFC' } }, { r0: '45%', r: '90%', label: { align: 'right', fontSize: 10, color: '#CBD5E1' } }] }],
    };
  }, [analyzed, postMap]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="chart-academic">
          <div className="chart-title">叙事类型分布</div>
          <div className="chart-subtitle">基于 Labov 叙事分析框架的六类叙事编码</div>
          <ReactECharts option={pieOption} style={{ height: 350 }} />
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('narrative-pie')}</p>
          </div>
        </div>
        <div className="chart-academic">
          <div className="chart-title">平台 × 叙事类型</div>
          <div className="chart-subtitle">内环=平台，外环=叙事类型</div>
          <ReactECharts option={sunburstOption} style={{ height: 350 }} />
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('sunburst')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Risk Tab ───────────────────────────────────────────────────
function RiskTab({ analyzed }: { analyzed: any[] }) {
  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { safe: 0, low: 0, medium: 0, high: 0 };
    for (const c of analyzed) {
      const rl = c.analysis?.risk_level;
      if (rl && rl in counts) counts[rl]++;
    }
    return counts;
  }, [analyzed]);

  const donutOption = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { color: '#94A3B8', fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['35%', '50%'], avoidLabelOverlap: false, label: { show: false },
      itemStyle: { borderRadius: 6, borderColor: '#030712', borderWidth: 2 },
      emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#F8FAFC' } },
      data: [
        { name: '安全', value: riskCounts.safe, itemStyle: { color: '#10B981' } },
        { name: '低危', value: riskCounts.low, itemStyle: { color: '#6EE7B7' } },
        { name: '中危', value: riskCounts.medium, itemStyle: { color: '#F59E0B' } },
        { name: '高危', value: riskCounts.high, itemStyle: { color: '#EF4444' } },
      ].filter(d => d.value > 0),
    }],
  }), [riskCounts]);

  const highRiskComments = useMemo(() =>
    analyzed.filter(c => c.analysis?.risk_level === 'high').slice(0, 20),
    [analyzed]
  );

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="chart-academic">
          <div className="chart-title">伦理风险分布</div>
          <div className="chart-subtitle">基于媒介伦理框架的风险等级划分</div>
          <ReactECharts option={donutOption} style={{ height: 350 }} />
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('risk-donut')}</p>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="chart-title mb-3">高风险评论（前 20 条）</div>
          {highRiskComments.length === 0 ? (
            <p className="text-xs text-[var(--color-accent-green)]">未检测到高风险评论</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {highRiskComments.map(c => (
                <div key={c.id} className="p-2.5 bg-[var(--color-accent-red)]/5 border border-[var(--color-accent-red)]/10 rounded-lg text-xs text-[var(--color-text-secondary)]">
                  {c.text?.slice(0, 100)}...
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compare Tab ────────────────────────────────────────────────
function CompareTab({ analyzed, posts, getDimLabel }: { analyzed: any[]; posts: any[]; getDimLabel: (d: string) => string }) {
  const aigcPostIds = useMemo(() => new Set(posts.filter(p => p.is_aigc).map(p => p.id)), [posts]);
  const aigcComments = useMemo(() => analyzed.filter(c => aigcPostIds.has(c.post_id)), [analyzed, aigcPostIds]);
  const humanComments = useMemo(() => analyzed.filter(c => !aigcPostIds.has(c.post_id)), [analyzed, aigcPostIds]);

  const radarOption = useMemo(() => {
    if (aigcComments.length === 0 || humanComments.length === 0) return null;
    return {
      tooltip: {},
      legend: { data: ['AIGC', '人工'], textStyle: { color: '#94A3B8', fontSize: 11 }, bottom: 0 },
      radar: {
        indicator: DIMENSIONS.map(d => ({ name: getDimLabel(d), max: 10 })),
        shape: 'polygon' as const, splitNumber: 4,
        axisName: { color: '#94A3B8', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
        splitArea: { areaStyle: { color: ['transparent'] } },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      series: [{
        type: 'radar',
        data: [
          { value: DIMENSIONS.map(d => Number(avgDim(aigcComments, d).toFixed(2))), name: 'AIGC', areaStyle: { color: 'rgba(139, 92, 246, 0.15)' }, lineStyle: { color: '#8B5CF6', width: 2 }, itemStyle: { color: '#8B5CF6' } },
          { value: DIMENSIONS.map(d => Number(avgDim(humanComments, d).toFixed(2))), name: '人工', areaStyle: { color: 'rgba(16, 185, 129, 0.15)' }, lineStyle: { color: '#10B981', width: 2 }, itemStyle: { color: '#10B981' } },
        ],
      }],
    };
  }, [aigcComments, humanComments]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;
  if (!radarOption) return <EmptyState text="需要同时包含 AIGC 和人工内容才能进行对比分析" />;

  return (
    <div className="space-y-6">
      <div className="chart-academic">
        <div className="chart-title">AIGC vs 人工内容</div>
        <div className="chart-subtitle">AI 生成内容与人工内容的六维对比</div>
        <ReactECharts option={radarOption} style={{ height: 400 }} />
        <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('aigc-radar')}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass-card p-8 text-center animate-fade-in">
      <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function AnalyzePage() {
  const { posts, comments, setPosts, setComments, setProjects, setCurrentProject, terminologyMode, setTerminologyMode } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const getDimLabel = terminologyMode === 'plain' ? getDimensionPlainLabel : getDimensionLabel;

  const analyzedComments = useMemo(() => comments.filter(c => c.analysis), [comments]);
  const stats = useMemo(() => posts.length > 0 ? computeDemoStats(posts, comments) : null, [posts, comments]);

  const loadData = useCallback(async () => {
    try {
      const { fetchProjects, fetchPosts, fetchComments } = await import('@/lib/supabase-service');
      const projects = await fetchProjects();
      if (projects.length > 0) {
        setProjects(projects);
        setCurrentProject(projects[0]);
        const [p, c] = await Promise.all([fetchPosts(projects[0].id), fetchComments(projects[0].id)]);
        setPosts(p);
        setComments(c);
      }
    } catch { /* ignore */ }
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  useEffect(() => {
    loadData().then(() => setLoading(false));
  }, [loadData]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-48 skeleton-shimmer rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="glass-card p-4 h-24 skeleton-shimmer" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
            分析台
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {posts.length} 篇内容 · {comments.length} 条评论 · {analyzedComments.length} 已分析
          </p>
        </div>
        <button
          onClick={() => setTerminologyMode(terminologyMode === 'academic' ? 'plain' : 'academic')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200',
            terminologyMode === 'plain'
              ? 'bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] border border-[var(--color-accent-amber)]/20'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)]'
          )}
        >
          {terminologyMode === 'plain' ? '通俗模式' : '学术模式'}
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-[var(--color-bg-card)] rounded-lg p-1 border border-[var(--color-border-subtle)] overflow-x-auto animate-fade-in stagger-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-md text-sm transition-all duration-200',
              activeTab === tab.key
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'overview' && <OverviewTab posts={posts} comments={comments} analyzed={analyzedComments} stats={stats} />}
        {activeTab === 'emotion' && <EmotionTab analyzed={analyzedComments} />}
        {activeTab === 'narrative' && <NarrativeTab analyzed={analyzedComments} posts={posts} />}
        {activeTab === 'risk' && <RiskTab analyzed={analyzedComments} />}
        {activeTab === 'compare' && <CompareTab analyzed={analyzedComments} posts={posts} getDimLabel={getDimLabel} />}
      </div>
    </div>
  );
}
