'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn, formatNumber, getNarrativeLabel, getDimensionLabel, getDimensionPlainLabel, getChartInterpretation, NARRATIVE_COLORS } from '@/lib/utils';
import { welchTTest } from '@/lib/statistics';
import type { TTestResult } from '@/lib/statistics';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const TABS = [
  { key: 'overview', label: '总览', desc: 'KPI + 研究发现' },
  { key: 'emotion', label: '情感地图', desc: '效价·唤醒·情感分布' },
  { key: 'narrative', label: '叙事分析', desc: '类型分布·平台交叉' },
  { key: 'risk', label: '风险监测', desc: '伦理风险·高危评论' },
  { key: 'compare', label: '统计检验', desc: 'AIGC vs 人工·t检验' },
  { key: 'timeline', label: '时序对比', desc: '时间段对比·趋势分析' },
] as const;

type TabKey = typeof TABS[number]['key'];

const DIMENSIONS = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
const NARRATIVE_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

function avgDim(arr: { analysis: any }[], dim: string): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, c) => s + (Number(c.analysis?.[dim]) || 0), 0) / arr.length;
}

function getDimValues(arr: { analysis: any }[], dim: string): number[] {
  return arr
    .filter(c => c.analysis?.[dim] != null && !isNaN(Number(c.analysis[dim])))
    .map(c => Number(c.analysis[dim]));
}

// ─── Findings Generator ────────────────────────────────────────
function generateFindings(posts: any[], comments: any[], analyzed: any[], isPlain: boolean): string[] {
  if (analyzed.length === 0) return [];

  const findings: string[] = [];
  const dimLabel = (d: string) => isPlain ? getDimensionPlainLabel(d) : getDimensionLabel(d);

  // Top narrative
  const nc: Record<string, number> = {};
  for (const c of analyzed) {
    const nt = c.analysis?.narrative_type;
    if (nt) nc[nt] = (nc[nt] || 0) + 1;
  }
  const sorted = Object.entries(nc).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const pct = ((sorted[0][1] / analyzed.length) * 100).toFixed(1);
    findings.push(isPlain
      ? `评论中最常见的叙事类型是"${getNarrativeLabel(sorted[0][0])}"（占 ${pct}%），共 ${sorted[0][1]} 条。`
      : `评论中占比最高的叙事类型是"${getNarrativeLabel(sorted[0][0])}"（${pct}%），共 ${sorted[0][1]} 条。`
    );
  }

  // Emotion
  const avgV = analyzed.reduce((s, c) => s + (c.analysis?.d2_valence || 0), 0) / analyzed.length;
  if (avgV > 0.2) {
    findings.push(isPlain
      ? `${dimLabel('d2_valence')}总体偏正面（均值 ${avgV.toFixed(2)}），大家的情感以积极为主。`
      : `${dimLabel('d2_valence')}总体偏正向（均值 ${avgV.toFixed(2)}），公众情感以正面为主。`
    );
  } else if (avgV < -0.2) {
    findings.push(isPlain
      ? `${dimLabel('d2_valence')}偏负面（均值 ${avgV.toFixed(2)}），需要关注负面情感的来源。`
      : `${dimLabel('d2_valence')}偏负向（均值 ${avgV.toFixed(2)}），需关注负面情感来源。`
    );
  } else {
    findings.push(isPlain
      ? `${dimLabel('d2_valence')}接近中性（均值 ${avgV.toFixed(2)}），大家的态度比较理性。`
      : `${dimLabel('d2_valence')}接近中性（均值 ${avgV.toFixed(2)}），公众态度较为理性。`
    );
  }

  // Identity
  const avgD3 = analyzed.reduce((s, c) => s + (c.analysis?.d3 || 0), 0) / analyzed.length;
  if (avgD3 > 4) {
    findings.push(isPlain
      ? `${dimLabel('d3')}较高（均值 ${avgD3.toFixed(1)}），大家倾向于把郭永怀放在集体记忆的框架里看待。`
      : `${dimLabel('d3')}较高（D3 均值 ${avgD3.toFixed(1)}），公众倾向于将郭永怀置于集体记忆框架中。`
    );
  }

  // Risk
  const highRisk = analyzed.filter(c => c.analysis?.risk_level === 'high');
  if (highRisk.length > 0) {
    findings.push(isPlain
      ? `发现 ${highRisk.length} 条高风险评论，建议人工检查一下。`
      : `检测到 ${highRisk.length} 条高风险评论，建议进行人工审查。`
    );
  }

  return findings;
}

// ─── Overview Tab ───────────────────────────────────────────────
function OverviewTab({ posts, comments, analyzed, isPlain, isAnalyzing, onStartAnalysis, analysisTriggering }: {
  posts: any[]; comments: any[]; analyzed: any[]; isPlain: boolean;
  isAnalyzing: boolean; onStartAnalysis: () => void; analysisTriggering: boolean;
}) {
  const findings = useMemo(() => generateFindings(posts, comments, analyzed, isPlain), [posts, comments, analyzed, isPlain]);

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
            {isPlain ? '主要发现' : '研究发现'}
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
          {isAnalyzing ? (
            <>
              <p className="text-sm text-[var(--color-accent-blue)] mb-2">AI 分析正在进行中...</p>
              <p className="text-xs text-[var(--color-text-muted)]">分析完成后即可查看可视化图表</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-accent-amber)] mb-2">已采集 {comments.length} 条评论，尚未分析</p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">点击下方按钮启动 AI 分析</p>
              <button
                onClick={onStartAnalysis}
                disabled={analysisTriggering}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent-blue)] text-white hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {analysisTriggering ? '启动中...' : '启动 AI 分析'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="glass-card p-8 text-center animate-fade-in">
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">暂无数据</p>
          <Link href="/collect" className="text-xs text-[var(--color-accent-blue)] hover:underline">
            前往采集台粘贴链接开始采集
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Emotion Tab ────────────────────────────────────────────────
function EmotionTab({ analyzed, isPlain }: { analyzed: any[]; isPlain: boolean }) {
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

    const valenceLabel = isPlain ? '情感正负' : '情感效价';
    const arousalLabel = isPlain ? '情感强度' : '情感唤醒';

    return {
      tooltip: { formatter: (p: { value: number[] }) => `${valenceLabel}: ${p.value[0]?.toFixed(2)}<br/>${arousalLabel}: ${p.value[1]?.toFixed(2)}<br/>${isPlain ? '认同程度' : '认同层级'}: ${p.value[2]?.toFixed(1)}` },
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      xAxis: { name: valenceLabel, nameLocation: 'center', nameGap: 25, nameTextStyle: { color: '#94A3B8', fontSize: 11 }, type: 'value', min: -1, max: 1, splitLine: { lineStyle: { color: '#1E293B' } }, axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      yAxis: { name: arousalLabel, nameLocation: 'center', nameGap: 35, nameTextStyle: { color: '#94A3B8', fontSize: 11 }, type: 'value', min: 0, max: 1, splitLine: { lineStyle: { color: '#1E293B' } }, axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      series: [{ type: 'scatter', symbolSize: (val: number[]) => Math.max(6, Math.min(20, val[2] * 3)), data, emphasis: { scale: 1.5 } }],
    };
  }, [analyzed, isPlain]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  return (
    <div className="space-y-6">
      <div className="chart-academic">
        <div className="chart-title">{isPlain ? '情感分布图' : '情感空间分布'}</div>
        <div className="chart-subtitle">
          {isPlain
            ? '横轴=情感正负，纵轴=情感强度，点越大=认同越强（可悬停查看详情）'
            : 'Russell 情感环状模型：效价 × 唤醒度（点大小=认同层级）'
          }
        </div>
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
function NarrativeTab({ analyzed, posts, isPlain }: { analyzed: any[]; posts: any[]; isPlain: boolean }) {
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
      name: platform === 'bilibili' ? 'B站' : platform === 'xhs' ? '小红书' : '未知平台',
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

  const hasNarrativeData = analyzed.some(c => c.analysis?.narrative_type);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="chart-academic">
          <div className="chart-title">叙事类型分布</div>
          <div className="chart-subtitle">
            {isPlain ? '评论中的叙事模式分类' : '基于 Labov 叙事分析框架的六类叙事编码'}
          </div>
          {hasNarrativeData ? (
            <ReactECharts option={pieOption} style={{ height: 350 }} />
          ) : (
            <div className="h-[350px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              暂无叙事类型数据
            </div>
          )}
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('narrative-pie')}</p>
          </div>
        </div>
        <div className="chart-academic">
          <div className="chart-title">平台 × 叙事类型</div>
          <div className="chart-subtitle">{isPlain ? '不同平台的叙事类型差异' : '内环=平台，外环=叙事类型'}</div>
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

  const allHighRisk = useMemo(() =>
    analyzed.filter(c => c.analysis?.risk_level === 'high'),
    [analyzed]
  );
  const [expanded, setExpanded] = useState(false);
  const displayComments = expanded ? allHighRisk : allHighRisk.slice(0, 10);

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
          <div className="flex items-center justify-between mb-3">
            <div className="chart-title">高风险评论</div>
            {allHighRisk.length > 0 && (
              <span className="text-[10px] text-[var(--color-accent-red)] bg-[var(--color-accent-red)]/10 px-2 py-0.5 rounded">
                共 {allHighRisk.length} 条
              </span>
            )}
          </div>
          {allHighRisk.length === 0 ? (
            <p className="text-xs text-[var(--color-accent-green)]">未检测到高风险评论</p>
          ) : (
            <>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {displayComments.map(c => (
                  <ExpandableComment key={c.id} comment={c} />
                ))}
              </div>
              {allHighRisk.length > 10 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-3 text-xs text-[var(--color-accent-blue)] hover:underline"
                >
                  {expanded ? '收起' : `展开全部 ${allHighRisk.length} 条`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Expandable Comment ─────────────────────────────────────────
function ExpandableComment({ comment }: { comment: any }) {
  const [expanded, setExpanded] = useState(false);
  const text = comment.text || '';
  const isLong = text.length > 80;

  return (
    <div
      className={cn(
        'p-2.5 bg-[var(--color-accent-red)]/5 border border-[var(--color-accent-red)]/10 rounded-lg text-xs text-[var(--color-text-secondary)] transition-colors',
        isLong && 'cursor-pointer hover:border-[var(--color-accent-red)]/20'
      )}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <p className="leading-relaxed">
        {expanded || !isLong ? text : text.slice(0, 80) + '...'}
      </p>
      {isLong && (
        <span className="text-[10px] text-[var(--color-accent-blue)] mt-1 inline-block">
          {expanded ? '收起' : '展开'}
        </span>
      )}
    </div>
  );
}

// ─── Compare Tab ────────────────────────────────────────────────
function CompareTab({ analyzed, posts, getDimLabel }: { analyzed: any[]; posts: any[]; getDimLabel: (d: string) => string }) {
  const aigcPostIds = useMemo(() => new Set(posts.filter(p => p.is_aigc).map(p => p.id)), [posts]);
  const aigcComments = useMemo(() => analyzed.filter(c => aigcPostIds.has(c.post_id)), [analyzed, aigcPostIds]);
  const humanComments = useMemo(() => analyzed.filter(c => !aigcPostIds.has(c.post_id)), [analyzed, aigcPostIds]);

  // Compute t-test results for each dimension
  const tTestResults = useMemo(() => {
    if (aigcComments.length < 2 || humanComments.length < 2) return null;
    return DIMENSIONS.map(dim => {
      const s1 = getDimValues(aigcComments, dim);
      const s2 = getDimValues(humanComments, dim);
      const result = welchTTest(s1, s2);
      return { dim, ...result };
    });
  }, [aigcComments, humanComments]);

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
  }, [aigcComments, humanComments, getDimLabel]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  if (aigcComments.length === 0 && humanComments.length === 0) {
    return <EmptyState text="暂无数据可对比，请先采集内容" />;
  }
  if (aigcComments.length === 0) {
    return <EmptyState text={`当前有 ${humanComments.length} 条人工内容，但没有 AIGC 内容。需要同时包含两种类型才能进行对比分析。`} />;
  }
  if (humanComments.length === 0) {
    return <EmptyState text={`当前有 ${aigcComments.length} 条 AIGC 内容，但没有人工内容。需要同时包含两种类型才能进行对比分析。`} />;
  }

  return (
    <div className="space-y-6">
      {/* Radar */}
      {radarOption && (
        <div className="chart-academic animate-fade-in">
          <div className="chart-title">AIGC vs 人工内容</div>
          <div className="chart-subtitle">
            AIGC ({aigcComments.length} 条) vs 人工 ({humanComments.length} 条) 的六维对比
          </div>
          <ReactECharts option={radarOption} style={{ height: 400 }} />
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{getChartInterpretation('aigc-radar')}</p>
          </div>
        </div>
      )}

      {/* T-Test Results Table */}
      {tTestResults && (
        <div className="chart-academic animate-fade-in stagger-1">
          <div className="chart-title">Welch t 检验结果</div>
          <div className="chart-subtitle">AIGC 组 vs 人工组的各维度差异检验</div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]">
                  <th className="text-left py-2 px-3 text-[var(--color-text-muted)] font-normal">维度</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">AIGC 均值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">人工均值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">t 值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">p 值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">Cohen's d</th>
                  <th className="text-center py-2 px-3 text-[var(--color-text-muted)] font-normal">显著性</th>
                </tr>
              </thead>
              <tbody>
                {tTestResults.map(r => (
                  <tr key={r.dim} className="border-b border-[var(--color-border-subtle)]/50">
                    <td className="py-2 px-3 text-[var(--color-text-primary)]">{getDimLabel(r.dim)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{r.mean1.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{r.mean2.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{r.t.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{r.p < 0.001 ? '<0.001' : r.p.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{r.cohensD.toFixed(3)}</td>
                    <td className={cn('py-2 px-3 text-center font-mono font-bold', getSignificanceColor(r.significance))}>
                      {r.significance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              *** p&lt;0.001 · ** p&lt;0.01 · * p&lt;0.05 · ? p&lt;0.10 · ns 不显著。
              Cohen's d: 0.2=小效应, 0.5=中效应, 0.8=大效应。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getSignificanceColor(sig: string): string {
  switch (sig) {
    case '***': return 'text-[var(--color-accent-green)]';
    case '**': return 'text-[var(--color-accent-green)]';
    case '*': return 'text-[#7DCCA0]';
    case '?': return 'text-[var(--color-accent-amber)]';
    default: return 'text-[var(--color-text-muted)]';
  }
}

// ─── Empty State ────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass-card p-8 text-center animate-fade-in">
      <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>
    </div>
  );
}

// ─── Timeline Tab ──────────────────────────────────────────────
function TimelineTab({ analyzed, posts, getDimLabel, isPlain }: { analyzed: any[]; posts: any[]; getDimLabel: (d: string) => string; isPlain: boolean }) {
  const [periodA, setPeriodA] = useState<'3m' | '6m' | '1y' | 'all'>('6m');
  const [periodB, setPeriodB] = useState<'3m' | '6m' | '1y' | 'all'>('3m');

  // Split analyzed comments into two time periods based on post collected_at
  const postIdToTime = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      map.set(p.id, new Date(p.collected_at || p.created_at).getTime());
    }
    return map;
  }, [posts]);

  const { groupA, groupB, labelA, labelB } = useMemo(() => {
    if (analyzed.length === 0) return { groupA: [], groupB: [], labelA: '', labelB: '' };

    const now = Date.now();
    const getMs = (p: string) => p === '3m' ? 90 * 86400000 : p === '6m' ? 180 * 86400000 : p === '1y' ? 365 * 86400000 : now;
    const cutoffA = now - getMs(periodA);
    const cutoffB = now - getMs(periodB);

    const withTime = analyzed.map(c => ({
      ...c,
      _time: postIdToTime.get(c.post_id) || 0,
    }));

    // Period A: older period (cutoffA to cutoffB)
    // Period B: recent period (cutoffB to now)
    const a = withTime.filter(c => c._time >= cutoffA && c._time < cutoffB);
    const b = withTime.filter(c => c._time >= cutoffB);

    const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' });

    return {
      groupA: a,
      groupB: b,
      labelA: `${fmtDate(cutoffA)} — ${fmtDate(cutoffB)}`,
      labelB: `${fmtDate(cutoffB)} — ${fmtDate(now)}`,
    };
  }, [analyzed, postIdToTime, periodA, periodB]);

  const tTestResults = useMemo(() => {
    if (groupA.length < 2 || groupB.length < 2) return null;
    return DIMENSIONS.map(dim => {
      const s1 = groupA.map(c => Number((c.analysis as any)?.[dim]) || 0).filter(v => v !== 0);
      const s2 = groupB.map(c => Number((c.analysis as any)?.[dim]) || 0).filter(v => v !== 0);
      return { dim, ...welchTTest(s1, s2) };
    });
  }, [groupA, groupB]);

  const radarOption = useMemo(() => {
    if (groupA.length === 0 || groupB.length === 0) return null;
    return {
      tooltip: {},
      legend: { data: [labelA, labelB], textStyle: { color: '#94A3B8', fontSize: 11 }, bottom: 0 },
      radar: {
        indicator: DIMENSIONS.map(d => ({ name: getDimLabel(d), max: d.startsWith('d2') ? 1 : d === 'd6' ? 10 : 10 })),
        shape: 'polygon',
        splitArea: { areaStyle: { color: ['rgba(91,141,239,0.02)', 'rgba(91,141,239,0.04)'] } },
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
      },
      series: [{
        type: 'radar',
        data: [
          { value: DIMENSIONS.map(d => Number(avgDim(groupA, d).toFixed(2))), name: labelA, areaStyle: { color: 'rgba(245,158,11,0.15)' }, lineStyle: { color: '#F59E0B', width: 2 }, itemStyle: { color: '#F59E0B' } },
          { value: DIMENSIONS.map(d => Number(avgDim(groupB, d).toFixed(2))), name: labelB, areaStyle: { color: 'rgba(16,185,129,0.15)' }, lineStyle: { color: '#10B981', width: 2 }, itemStyle: { color: '#10B981' } },
        ],
      }],
    };
  }, [groupA, groupB, labelA, labelB, getDimLabel]);

  const barOption = useMemo(() => {
    if (!tTestResults) return null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: tTestResults.map(r => getDimLabel(r.dim)), axisLabel: { fontSize: 10, color: '#94A3B8' } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#94A3B8' } },
      series: [
        { name: labelA, type: 'bar', data: tTestResults.map(r => Number(r.mean1.toFixed(3))), itemStyle: { color: '#F59E0B', borderRadius: [4, 4, 0, 0] } },
        { name: labelB, type: 'bar', data: tTestResults.map(r => Number(r.mean2.toFixed(3))), itemStyle: { color: '#10B981', borderRadius: [4, 4, 0, 0] } },
      ],
    };
  }, [tTestResults, labelA, labelB, getDimLabel]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  const PeriodSelect = ({ value, onChange, label }: { value: string; onChange: (v: any) => void; label: string }) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
      {(['3m', '6m', '1y', 'all'] as const).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'px-2 py-1 rounded text-[10px] transition-all',
            value === p
              ? 'bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] border border-[var(--color-accent-blue)]/20'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          )}
        >
          {p === '3m' ? '近3月' : p === '6m' ? '近半年' : p === '1y' ? '近1年' : '全部'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Period Selectors */}
      <div className="glass-card p-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-4">
          <PeriodSelect value={periodA} onChange={setPeriodA} label="时间段 A（较早）" />
          <PeriodSelect value={periodB} onChange={setPeriodB} label="时间段 B（较近）" />
        </div>
        <div className="mt-3 text-[10px] text-[var(--color-text-muted)]">
          A: {labelA} ({groupA.length} 条) &nbsp;|&nbsp; B: {labelB} ({groupB.length} 条)
        </div>
      </div>

      {groupA.length < 2 || groupB.length < 2 ? (
        <EmptyState text={`需要两个时间段各有至少 2 条已分析评论。当前 A: ${groupA.length} 条, B: ${groupB.length} 条。请调整时间范围或先采集更多数据。`} />
      ) : (
        <>
          {/* Radar + Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {radarOption && (
              <div className="chart-academic animate-fade-in">
                <div className="chart-title">维度雷达对比</div>
                <div className="chart-subtitle">A ({groupA.length}) vs B ({groupB.length}) 的六维对比</div>
                <ReactECharts option={radarOption} style={{ height: 350 }} />
              </div>
            )}
            {barOption && (
              <div className="chart-academic animate-fade-in">
                <div className="chart-title">维度均值柱状图</div>
                <div className="chart-subtitle">各维度在两个时间段的均值差异</div>
                <ReactECharts option={barOption} style={{ height: 350 }} />
              </div>
            )}
          </div>

          {/* T-Test Table */}
          {tTestResults && (
            <div className="glass-card p-5 animate-fade-in">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Welch's t 检验结果</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border-subtle)]">
                      <th className="text-left py-2 pr-3 text-[var(--color-text-muted)]">维度</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">A 均值</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">B 均值</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">变化</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">t 值</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">p 值</th>
                      <th className="text-right py-2 px-2 text-[var(--color-text-muted)]">Cohen's d</th>
                      <th className="text-right py-2 pl-2 text-[var(--color-text-muted)]">显著性</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tTestResults.map(r => {
                      const change = r.mean2 - r.mean1;
                      const changePct = r.mean1 !== 0 ? ((change / Math.abs(r.mean1)) * 100) : 0;
                      return (
                        <tr key={r.dim} className="border-b border-[var(--color-border-subtle)]/50">
                          <td className="py-2 pr-3 text-[var(--color-text-primary)]">{getDimLabel(r.dim)}</td>
                          <td className="py-2 px-2 text-right text-[var(--color-text-secondary)]">{r.mean1.toFixed(3)}</td>
                          <td className="py-2 px-2 text-right text-[var(--color-text-secondary)]">{r.mean2.toFixed(3)}</td>
                          <td className={cn('py-2 px-2 text-right font-medium', change > 0 ? 'text-[var(--color-accent-green)]' : change < 0 ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]')}>
                            {change > 0 ? '+' : ''}{changePct.toFixed(1)}%
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--color-text-secondary)] font-mono">{r.t.toFixed(3)}</td>
                          <td className="py-2 px-2 text-right text-[var(--color-text-secondary)] font-mono">{r.p < 0.001 ? '<0.001' : r.p.toFixed(3)}</td>
                          <td className="py-2 px-2 text-right text-[var(--color-text-secondary)] font-mono">{r.cohensD.toFixed(3)}</td>
                          <td className="py-2 pl-2 text-right font-bold">{r.significance}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function AnalyzePage() {
  const { posts, comments, setPosts, setComments, setProjects, setCurrentProject, currentProject, terminologyMode, setTerminologyMode, analysisProgress, setAnalysisProgress } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysisTriggering, setAnalysisTriggering] = useState(false);
  const isPlain = terminologyMode === 'plain';
  const getDimLabel = isPlain ? getDimensionPlainLabel : getDimensionLabel;

  const analyzedComments = useMemo(() => comments.filter(c => c.analysis), [comments]);

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
      setLoadError(null);
    } catch {
      setLoadError('加载数据失败');
    }
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleStartAnalysis = async () => {
    if (!currentProject) return;
    setAnalysisTriggering(true);
    const { runAnalysis } = await import('@/lib/analysis-runner');
    await runAnalysis(currentProject.id, undefined, {
      onProgress: (processed, total) => {
        setAnalysisProgress({ processed, total, status: 'processing' });
      },
      onDone: (processed, _failed, total) => {
        setAnalysisProgress({ processed, total, status: 'completed' });
        loadData();
      },
      onError: (error) => {
        setAnalysisProgress({ processed: 0, total: 0, status: 'failed' });
        console.error('Analysis error:', error);
      },
    });
    setAnalysisTriggering(false);
  };

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
      {/* Load error */}
      {loadError && (
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-accent-red)]">{loadError}</p>
            <button onClick={() => { setLoading(true); loadData().finally(() => setLoading(false)); }} className="text-xs text-[var(--color-accent-blue)] hover:underline">
              重试
            </button>
          </div>
        </div>
      )}

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
          onClick={() => setTerminologyMode(isPlain ? 'academic' : 'plain')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200',
            isPlain
              ? 'bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] border border-[var(--color-accent-amber)]/20'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)]'
          )}
        >
          {isPlain ? '通俗模式' : '学术模式'}
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-[var(--color-bg-card)] rounded-lg p-1 border border-[var(--color-border-subtle)] overflow-x-auto animate-fade-in stagger-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            title={tab.desc}
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
        {activeTab === 'overview' && <OverviewTab posts={posts} comments={comments} analyzed={analyzedComments} isPlain={isPlain} isAnalyzing={analysisProgress?.status === 'processing'} onStartAnalysis={handleStartAnalysis} analysisTriggering={analysisTriggering} />}
        {activeTab === 'emotion' && <EmotionTab analyzed={analyzedComments} isPlain={isPlain} />}
        {activeTab === 'narrative' && <NarrativeTab analyzed={analyzedComments} posts={posts} isPlain={isPlain} />}
        {activeTab === 'risk' && <RiskTab analyzed={analyzedComments} />}
        {activeTab === 'compare' && <CompareTab analyzed={analyzedComments} posts={posts} getDimLabel={getDimLabel} />}
        {activeTab === 'timeline' && <TimelineTab analyzed={analyzedComments} posts={posts} getDimLabel={getDimLabel} isPlain={isPlain} />}
      </div>
    </div>
  );
}
