'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn, formatNumber, getNarrativeLabel, getDimensionLabel, getDimensionPlainLabel, getChartInterpretation, NARRATIVE_COLORS } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const TABS = [
  { key: 'overview', label: '总览', desc: 'KPI + 研究发现' },
  { key: 'emotion', label: '情感地图', desc: '效价·唤醒·情感分布' },
  { key: 'narrative', label: '叙事分析', desc: '类型分布·平台交叉' },
  { key: 'risk', label: '风险监测', desc: '伦理风险·叙事风险交叉' },
  { key: 'emotion-space', label: '情感空间', desc: 'Russell情感环·效价分布' },
  { key: 'topic-mining', label: '主题挖掘', desc: '关键词频次·情感词统计' },
  { key: 'identity-profile', label: '认同画像', desc: '六维雷达·认同画像' },
] as const;

type TabKey = typeof TABS[number]['key'];

const NARRATIVE_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

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

// ─── Empty State ────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass-card p-8 text-center animate-fade-in">
      <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>
    </div>
  );
}

// ─── Module 3: Identity Profile (认同画像) ──────────────────────
function IdentityProfileTab({ analyzed, getDimLabel }: { analyzed: any[]; getDimLabel: (d: string) => string }) {
  const DIM_KEYS = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
  const DIM_LABELS = ['D1 认知深度', 'D2 情感效价', 'D2 情感唤醒', 'D3 认同层级', 'D4 行为意向', 'D5 叙事卷入', 'D6 伦理风险(反)'];

  const stats = useMemo(() => {
    if (analyzed.length === 0) return null;
    return DIM_KEYS.map((dim, i) => {
      const values = analyzed
        .filter(c => c.analysis?.[dim] != null && !isNaN(Number(c.analysis[dim])))
        .map(c => Number(c.analysis[dim]));
      if (values.length === 0) return { dim, label: DIM_LABELS[i], mean: 0, std: 0, min: 0, max: 0, n: 0 };
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      return {
        dim,
        label: DIM_LABELS[i],
        mean: Number(mean.toFixed(3)),
        std: Number(Math.sqrt(variance).toFixed(3)),
        min: Math.min(...values),
        max: Math.max(...values),
        n: values.length,
      };
    });
  }, [analyzed]);

  const radarOption = useMemo(() => {
    if (!stats || analyzed.length === 0) return null;
    // Normalize to 0-10 scale for radar display
    const maxVals = [10, 1, 1, 6, 5, 10, 1]; // max possible for each dim
    const meanValues = stats.map((s, i) => {
      // D6: invert (1 - risk) so higher = safer
      if (s.dim === 'd6') return Number(((1 - s.mean) * 10).toFixed(2));
      return Number(((s.mean / maxVals[i]) * 10).toFixed(2));
    });

    return {
      tooltip: { trigger: 'item' as const },
      radar: {
        indicator: DIM_LABELS.map(name => ({ name, max: 10 })),
        shape: 'polygon' as const,
        splitNumber: 5,
        axisName: { color: '#94A3B8', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
        splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.04)'] } },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: meanValues,
          name: '均值',
          areaStyle: { color: 'rgba(59,130,246,0.2)' },
          lineStyle: { color: '#3B82F6', width: 2 },
          itemStyle: { color: '#3B82F6' },
        }],
      }],
    };
  }, [stats, analyzed]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;
  if (!stats) return <EmptyState text="暂无统计数据" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="chart-academic animate-fade-in">
          <div className="chart-title">六维度认同画像</div>
          <div className="chart-subtitle">基于 ELM-情感环-文化记忆-TPB-叙事传输-媒介伦理六维框架</div>
          {radarOption ? (
            <ReactECharts option={radarOption} style={{ height: 400 }} />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              数据不足，无法生成雷达图
            </div>
          )}
          <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              D6 伦理风险取反向显示（1-风险值），使雷达图中高值=安全。各维度均归一化至 0-10 量纲。
            </p>
          </div>
        </div>

        {/* Stats Table */}
        <div className="chart-academic animate-fade-in stagger-1">
          <div className="chart-title">维度描述统计</div>
          <div className="chart-subtitle">各维度均值、标准差、极值</div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]">
                  <th className="text-left py-2 px-3 text-[var(--color-text-muted)] font-normal">维度</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">均值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">标准差</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">最小值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">最大值</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">N</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.dim} className="border-b border-[var(--color-border-subtle)]/50">
                    <td className="py-2 px-3 text-[var(--color-text-primary)]">{s.label}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.mean.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.std.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.min.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.max.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Module 1: Emotion Space (情感空间) ─────────────────────────
function EmotionSpaceTab({ analyzed }: { analyzed: any[] }) {
  const D3_COLORS: Record<number, string> = { 1: '#60A5FA', 2: '#818CF8', 3: '#3B82F6' };
  const D3_LABELS: Record<number, string> = { 1: '个体记忆', 2: '集体记忆', 3: '国家认同' };

  const scatterOption = useMemo(() => {
    const data = analyzed
      .filter(c => c.analysis?.d2_valence != null && c.analysis?.d2_arousal != null)
      .map(c => {
        const d3 = Math.round(c.analysis.d3 || 1);
        return {
          value: [c.analysis.d2_valence, c.analysis.d2_arousal, c.likes || 0],
          itemStyle: { color: D3_COLORS[d3] || '#64748B', opacity: 0.7 },
          _text: (c.text || '').slice(0, 30),
          _d3: d3,
        };
      });

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: { value: number[]; data: { _text: string; _d3: number } }) =>
          `效价: ${p.value[0]?.toFixed(2)}<br/>唤醒: ${p.value[1]?.toFixed(2)}<br/>点赞: ${p.value[2]}<br/>认同: ${D3_LABELS[p.data._d3] || '?'}<br/>${p.data._text}...`,
      },
      legend: {
        data: ['个体记忆', '集体记忆', '国家认同'],
        bottom: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      grid: { top: 30, right: 30, bottom: 50, left: 50 },
      xAxis: {
        name: '情感效价 (D2_valence)',
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        type: 'value',
        min: -1,
        max: 1,
        splitLine: { lineStyle: { color: '#1E293B' } },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      yAxis: {
        name: '情感唤醒 (D2_arousal)',
        nameLocation: 'center',
        nameGap: 35,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        type: 'value',
        min: 0,
        max: 1,
        splitLine: { lineStyle: { color: '#1E293B' } },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [{
        type: 'scatter',
        symbolSize: (val: number[]) => Math.max(6, Math.min(25, val[2] / 50 + 6)),
        data,
        emphasis: { scale: 1.5 },
      }],
    };
  }, [analyzed]);

  const barOption = useMemo(() => {
    const bins = [
      { label: '负面\n(-1~-0.6)', min: -1, max: -0.6 },
      { label: '偏负面\n(-0.6~-0.2)', min: -0.6, max: -0.2 },
      { label: '中性\n(-0.2~+0.2)', min: -0.2, max: 0.2 },
      { label: '偏正面\n(+0.2~+0.6)', min: 0.2, max: 0.6 },
      { label: '正面\n(+0.6~+1)', min: 0.6, max: 1.01 },
    ];
    const counts = bins.map(b =>
      analyzed.filter(c => {
        const v = c.analysis?.d2_valence;
        return v != null && v >= b.min && v < b.max;
      }).length
    );

    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      grid: { top: 20, right: 20, bottom: 60, left: 50 },
      xAxis: {
        type: 'category' as const,
        data: bins.map(b => b.label),
        axisLabel: { color: '#94A3B8', fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        name: '评论数',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [{
        type: 'bar',
        data: counts,
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const colors = ['#EF4444', '#F59E0B', '#6B7280', '#10B981', '#3B82F6'];
            return colors[params.dataIndex] || '#3B82F6';
          },
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '60%',
      }],
    };
  }, [analyzed]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  return (
    <div className="space-y-6">
      <div className="chart-academic animate-fade-in">
        <div className="chart-title">情感空间散点图</div>
        <div className="chart-subtitle">Russell 情感环状模型：效价 × 唤醒度（颜色=D3认同层级，大小=点赞数）</div>
        <ReactECharts option={scatterOption} style={{ height: 400 }} />
      </div>
      <div className="chart-academic animate-fade-in stagger-1">
        <div className="chart-title">情感效价分布</div>
        <div className="chart-subtitle">评论情感效价五段分布统计</div>
        <ReactECharts option={barOption} style={{ height: 300 }} />
        <div className="mt-3 p-3 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-subtle)]">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">基于 Russell 情感环状模型，将情感效价（D2_valence）分为五个区间进行统计。</p>
        </div>
      </div>
    </div>
  );
}

// ─── Module 2: Topic Mining (主题挖掘) ──────────────────────────
function TopicMiningTab({ comments }: { comments: any[] }) {
  const STOPWORDS = new Set([
    '的', '了', '是', '我', '你', '他', '她', '它', '们', '在', '有', '和', '就', '不', '人',
    '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
    '看', '好', '自己', '这', '那', '她', '他', '吗', '什么', '啊', '呢', '吧', '哦', '嗯',
    '哈', '呀', '哇', '啦', '么', '吗', '把', '被', '给', '让', '用', '向', '从', '以',
    '而', '但', '还', '所以', '因为', '如果', '虽然', '可以', '这个', '那个', '怎么',
    '真的', '真', '太', '最', '更', '比较', '非常', '特别', '已经', '还是', '只是',
    '不是', '没有', '没', '能', '会', '应该', '可能', '已', '才', '又', '再', '也',
    '过', '来', '去', '做', '对', '里', '中', '下', '大', '小', '多', '少',
  ]);

  const POSITIVE_WORDS = ['感动', '致敬', '震撼', '伟大', '泪目', '敬佩', '英雄', '铭记'];
  const NEGATIVE_WORDS = ['假', '消费', '质疑', '无感', '过度', '商业化', '失真', '炒作'];
  const NEUTRAL_WORDS = ['技术', '修复', '历史', '影像', 'AI', '生成', '数字', '纪念馆'];

  const { topWords, sentimentTable } = useMemo(() => {
    const allText = comments.map(c => c.text || '').join('');
    // Simple tokenization: split by punctuation and spaces
    const tokens = allText
      .replace(/[，。！？、；：""''（）【】《》\s\.\,\!\?\;\:\"\'\(\)\[\]\{\}\<\>\/\\~`@#\$%\^&\*\-_\+=|]+/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));

    const freq = new Map<string, number>();
    for (const t of tokens) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }

    const topWords = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    // Sentiment word counts
    const sentimentTable = [
      ...POSITIVE_WORDS.map(w => ({ word: w, count: freq.get(w) || 0, polarity: '正面' as const })),
      ...NEGATIVE_WORDS.map(w => ({ word: w, count: freq.get(w) || 0, polarity: '负面' as const })),
      ...NEUTRAL_WORDS.map(w => ({ word: w, count: freq.get(w) || 0, polarity: '中性' as const })),
    ];

    return { topWords, sentimentTable };
  }, [comments]);

  const barOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { top: 10, right: 30, bottom: 20, left: 80 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { color: '#64748B', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1E293B' } },
    },
    yAxis: {
      type: 'category' as const,
      data: topWords.map(w => w.word).reverse(),
      axisLabel: { color: '#94A3B8', fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: topWords.map(w => w.count).reverse(),
      itemStyle: { color: '#3B82F6', borderRadius: [0, 4, 4, 0] },
      barWidth: '60%',
    }],
  }), [topWords]);

  if (comments.length === 0) return <EmptyState text="暂无评论数据" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Keyword Frequency */}
        <div className="chart-academic animate-fade-in">
          <div className="chart-title">高频关键词 TOP 20</div>
          <div className="chart-subtitle">前端分词提取，过滤停用词</div>
          {topWords.length > 0 ? (
            <ReactECharts option={barOption} style={{ height: 400 }} />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              未提取到有效关键词
            </div>
          )}
        </div>

        {/* Sentiment Word Table */}
        <div className="chart-academic animate-fade-in stagger-1">
          <div className="chart-title">情感词频统计</div>
          <div className="chart-subtitle">预设情感词库匹配统计</div>
          <div className="overflow-x-auto mt-4 max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]">
                  <th className="text-left py-2 px-3 text-[var(--color-text-muted)] font-normal">词</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">出现次数</th>
                  <th className="text-center py-2 px-3 text-[var(--color-text-muted)] font-normal">情感极性</th>
                </tr>
              </thead>
              <tbody>
                {sentimentTable.map(s => (
                  <tr key={s.word} className="border-b border-[var(--color-border-subtle)]/50">
                    <td className="py-2 px-3 text-[var(--color-text-primary)]">{s.word}</td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">{s.count}</td>
                    <td className={cn(
                      'py-2 px-3 text-center',
                      s.polarity === '正面' ? 'text-[var(--color-accent-green)]' :
                      s.polarity === '负面' ? 'text-[var(--color-accent-red)]' :
                      'text-[var(--color-text-muted)]'
                    )}>
                      {s.polarity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Module 4: Narrative & Risk (叙事与风险分组) ────────────────
function NarrativeRiskTab({ analyzed }: { analyzed: any[] }) {
  const NARRATIVE_MAP: Record<string, string> = {
    T1: '历史叙事', T2: '个人叙事', T3: '技术叙事', T4: '情感叙事', T5: '批判叙事', T6: '其他',
  };
  const RISK_LEVELS = ['safe', 'low', 'medium', 'high'];
  const RISK_LABELS: Record<string, string> = { safe: '无风险', low: '低风险', medium: '中风险', high: '高风险' };
  const RISK_COLORS: Record<string, string> = { safe: '#3B82F6', low: '#6EE7B7', medium: '#F59E0B', high: '#EF4444' };

  const crossTable = useMemo(() => {
    const table: Record<string, Record<string, number>> = {};
    const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5'];
    for (const nt of narrativeTypes) {
      table[nt] = {};
      for (const rl of RISK_LEVELS) {
        table[nt][rl] = 0;
      }
    }
    for (const c of analyzed) {
      const nt = c.analysis?.narrative_type;
      const rl = c.analysis?.risk_level;
      if (nt && table[nt] && rl && RISK_LEVELS.includes(rl)) {
        table[nt][rl]++;
      }
    }
    return table;
  }, [analyzed]);

  const barOption = useMemo(() => {
    const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5'];
    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      legend: {
        data: RISK_LEVELS.map(rl => RISK_LABELS[rl]),
        bottom: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      grid: { top: 20, right: 20, bottom: 50, left: 50 },
      xAxis: {
        type: 'category' as const,
        data: narrativeTypes.map(nt => NARRATIVE_MAP[nt]),
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        name: '评论数',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      series: RISK_LEVELS.map(rl => ({
        name: RISK_LABELS[rl],
        type: 'bar' as const,
        stack: 'total',
        data: narrativeTypes.map(nt => crossTable[nt]?.[rl] || 0),
        itemStyle: { color: RISK_COLORS[rl], borderRadius: [2, 2, 0, 0] },
      })),
    };
  }, [crossTable]);

  if (analyzed.length === 0) return <EmptyState text="暂无分析数据" />;

  const narrativeTypes = ['T1', 'T2', 'T3', 'T4', 'T5'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grouped Bar Chart */}
        <div className="chart-academic animate-fade-in">
          <div className="chart-title">叙事类型 × 风险等级</div>
          <div className="chart-subtitle">基于叙事传输理论与媒介伦理框架</div>
          <ReactECharts option={barOption} style={{ height: 400 }} />
        </div>

        {/* Cross Table */}
        <div className="chart-academic animate-fade-in stagger-1">
          <div className="chart-title">交叉统计表</div>
          <div className="chart-subtitle">叙事类型 × 风险等级 评论数量矩阵</div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]">
                  <th className="text-left py-2 px-3 text-[var(--color-text-muted)] font-normal">叙事类型</th>
                  {RISK_LEVELS.map(rl => (
                    <th key={rl} className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">{RISK_LABELS[rl]}</th>
                  ))}
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-normal">合计</th>
                </tr>
              </thead>
              <tbody>
                {narrativeTypes.map(nt => {
                  const rowTotal = RISK_LEVELS.reduce((s, rl) => s + (crossTable[nt]?.[rl] || 0), 0);
                  return (
                    <tr key={nt} className="border-b border-[var(--color-border-subtle)]/50">
                      <td className="py-2 px-3 text-[var(--color-text-primary)]">{NARRATIVE_MAP[nt]}</td>
                      {RISK_LEVELS.map(rl => (
                        <td key={rl} className="py-2 px-3 text-right text-[var(--color-text-secondary)] font-mono">
                          {crossTable[nt]?.[rl] || 0}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right text-[var(--color-text-primary)] font-mono font-medium">{rowTotal}</td>
                    </tr>
                  );
                })}
                {/* Column totals */}
                <tr className="border-t-2 border-[var(--color-border-subtle)]">
                  <td className="py-2 px-3 text-[var(--color-text-primary)] font-medium">合计</td>
                  {RISK_LEVELS.map(rl => {
                    const colTotal = narrativeTypes.reduce((s, nt) => s + (crossTable[nt]?.[rl] || 0), 0);
                    return (
                      <td key={rl} className="py-2 px-3 text-right text-[var(--color-text-primary)] font-mono font-medium">{colTotal}</td>
                    );
                  })}
                  <td className="py-2 px-3 text-right text-[var(--color-text-primary)] font-mono font-bold">
                    {narrativeTypes.reduce((s, nt) => s + RISK_LEVELS.reduce((ss, rl) => ss + (crossTable[nt]?.[rl] || 0), 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
        {activeTab === 'risk' && <NarrativeRiskTab analyzed={analyzedComments} />}
        {activeTab === 'emotion-space' && <EmotionSpaceTab analyzed={analyzedComments} />}
        {activeTab === 'topic-mining' && <TopicMiningTab comments={comments} />}
        {activeTab === 'identity-profile' && <IdentityProfileTab analyzed={analyzedComments} getDimLabel={getDimLabel} />}
      </div>
    </div>
  );
}
