'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useChartStore } from '@/stores/useChartStore';
import { computeDemoStats } from '@/lib/demo-data';
import { cn, formatNumber, formatPercent, getNarrativeLabel, getDimensionLabel, getRiskLabel, NARRATIVE_COLORS } from '@/lib/utils';
import type { Post, Comment } from '@/types';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const NARRATIVE_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const DIMENSIONS = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function avgDim(arr: { analysis: any }[], dim: string): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, c) => s + (Number(c.analysis?.[dim]) || 0), 0) / arr.length;
}

const RADAR_BASE = {
  indicator: DIMENSIONS.map(d => ({ name: getDimensionLabel(d), max: 10 })),
  shape: 'polygon' as const,
  splitNumber: 4,
  axisName: { color: '#94A3B8', fontSize: 10 },
  splitLine: { lineStyle: { color: '#1E293B' } },
  splitArea: { areaStyle: { color: ['transparent'] } },
  axisLine: { lineStyle: { color: '#334155' } },
};

const CARD_STYLE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  blue: { bg: 'bg-[#3B82F6]/10', text: 'text-[#60A5FA]', label: '发现' },
  amber: { bg: 'bg-[#F59E0B]/10', text: 'text-[#FCD34D]', label: '提示' },
  red: { bg: 'bg-[#EF4444]/10', text: 'text-[#F87171]', label: '警告' },
};

function computeNarrativeCounts(analyzed: Comment[]): { topType: string | null; topCount: number; total: number } {
  const counts: Record<string, number> = {};
  for (const c of analyzed) {
    const nt = c.analysis?.narrative_type;
    if (nt) counts[nt] = (counts[nt] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { topType: null, topCount: 0, total: analyzed.length };
  return { topType: sorted[0][0], topCount: sorted[0][1], total: analyzed.length };
}

// ─── Quick Collect Bar ──────────────────────────────────────────

function QuickCollectBar({ onCollected }: { onCollected: () => void }) {
  const [url, setUrl] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; video_title: string } | null>(null);

  const handleCollect = async () => {
    const bvidMatch = url.match(/(BV\w{10})/);
    if (!bvidMatch) {
      setProgress('请输入包含 BV 号的 B站视频链接');
      return;
    }

    setCollecting(true);
    setProgress('正在连接 B站 API...');
    setResult(null);

    try {
      const res = await fetch('/api/collect/bilibili', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), max_comments: 5000 }),
      });

      const data = await res.json();
      if (data.error) {
        setProgress(`采集失败: ${data.error}`);
      } else {
        setResult({ imported: data.imported, video_title: data.video_title });
        setProgress(null);
        setUrl('');
        onCollected();
      }
    } catch {
      setProgress('网络错误，请重试');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="collect-bar p-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !collecting && url.trim() && handleCollect()}
            placeholder="粘贴 B站视频链接，如 https://www.bilibili.com/video/BV1xx411c7mD"
            className="w-full bg-transparent text-[#F8FAFC] text-sm outline-none placeholder:text-[#475569] font-mono"
            disabled={collecting}
          />
        </div>
        <button
          onClick={handleCollect}
          disabled={collecting || !url.trim()}
          className={cn(
            'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            collecting
              ? 'bg-[#3B82F6]/20 text-[#60A5FA] collecting'
              : 'bg-[#3B82F6] text-white hover:bg-[#2563EB]'
          )}
        >
          {collecting ? '采集中...' : '一键采集'}
        </button>
      </div>

      {progress && (
        <div className="mt-3 text-xs text-[#F59E0B] flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
          {progress}
        </div>
      )}

      {result && (
        <div className="mt-3 text-xs text-[#10B981] flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          采集完成：{result.video_title} — {result.imported} 条评论已入库
        </div>
      )}
    </div>
  );
}

// ─── Research Status Banner ─────────────────────────────────────

function ResearchBanner({ postCount, commentCount, analyzedCount }: { postCount: number; commentCount: number; analyzedCount: number }) {
  const stats = [
    { label: '已收集内容', value: postCount, unit: '篇' },
    { label: '评论总量', value: commentCount, unit: '条' },
    { label: '已分析', value: analyzedCount, unit: '条' },
    { label: '待分析', value: commentCount - analyzedCount, unit: '条' },
  ];

  return (
    <div className="research-banner p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-serif)' }}>
            郭永怀数字记忆研究
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">社交媒体评论量化分析</p>
        </div>
        <div className="flex items-center gap-6">
          {stats.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-mono)' }}>
                {formatNumber(s.value)}
              </div>
              <div className="text-[10px] text-[#64748B]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Insight Cards ──────────────────────────────────────────────

function InsightCards({ posts, analyzed, narrativeStats }: {
  posts: Post[];
  analyzed: Comment[];
  narrativeStats: { topType: string | null; topCount: number; total: number };
}) {
  const insights = useMemo(() => {
    const cards: { type: 'blue' | 'amber' | 'red'; title: string; body: string; action: string; targetId: string }[] = [];
    if (analyzed.length === 0) return cards;

    // Narrative dominance
    if (narrativeStats.topType) {
      const pct = ((narrativeStats.topCount / narrativeStats.total) * 100).toFixed(1);
      cards.push({
        type: 'blue',
        title: `主导叙事类型：${getNarrativeLabel(narrativeStats.topType)}`,
        body: `${getNarrativeLabel(narrativeStats.topType)}（${narrativeStats.topType}）占所有评论的 ${pct}%（n=${narrativeStats.topCount}），是当前数据中最主要的叙事模式。`,
        action: '查看叙事分布',
        targetId: 'chart-narrative',
      });
    }

    // Platform comparison
    const bilibiliPosts = posts.filter(p => p.platform === 'bilibili');
    const xhsPosts = posts.filter(p => p.platform === 'xhs');
    if (bilibiliPosts.length > 0 && xhsPosts.length > 0) {
      cards.push({
        type: 'amber',
        title: '平台差异',
        body: `已覆盖 B站（${bilibiliPosts.length} 篇）和小红书（${xhsPosts.length} 篇）两个平台，可进行跨平台叙事对比分析。`,
        action: '查看平台对比',
        targetId: 'chart-platform',
      });
    }

    // Risk alerts
    const highRisk = analyzed.filter(c => c.analysis?.risk_level === 'high');
    if (highRisk.length > 0) {
      cards.push({
        type: 'red',
        title: `${highRisk.length} 条高风险评论`,
        body: `检测到 ${highRisk.length} 条评论存在伦理风险标记，建议进行人工审查。`,
        action: '查看风险分布',
        targetId: 'chart-risk',
      });
    }

    // AIGC comparison
    const aigcCount = posts.filter(p => p.is_aigc).length;
    if (aigcCount > 0) {
      cards.push({
        type: 'amber',
        title: 'AIGC vs 人工内容',
        body: `数据中包含 ${aigcCount} 篇 AIGC 内容，可与人工内容进行六维对比分析。`,
        action: '查看对比分析',
        targetId: 'chart-aigc',
      });
    }

    return cards;
  }, [posts, analyzed, narrativeStats]);

  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {insights.map((card, i) => (
        <div key={i} className="insight-card p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-serif)' }}>
              {card.title}
            </h3>
            <span className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium',
              CARD_STYLE_MAP[card.type]?.bg,
              CARD_STYLE_MAP[card.type]?.text,
            )}>
              {CARD_STYLE_MAP[card.type]?.label}
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] leading-relaxed mb-3">{card.body}</p>
          <button
            onClick={() => document.getElementById(card.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="text-xs text-[#60A5FA] hover:text-[#93C5FD] transition-colors"
          >
            {card.action} →
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function ResearchPage() {
  const { posts, comments, setPosts, setComments, setProjects, setCurrentProject } = useAppStore();
  const { selectedNarrativeType, setSelectedNarrativeType } = useChartStore();
  const [loadError, setLoadError] = useState<string | null>(null);

  const analyzedComments = useMemo(() => comments.filter(c => c.analysis), [comments]) as Comment[];
  const postMap = useMemo(() => new Map(posts.map(p => [p.id, p])), [posts]);

  const narrativeStats = useMemo(() => computeNarrativeCounts(analyzedComments), [analyzedComments]);

  const stats = useMemo(() => {
    if (posts.length === 0) return null;
    return computeDemoStats(posts, comments);
  }, [posts, comments]);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const { fetchProjects, fetchPosts, fetchComments } = await import('@/lib/supabase-service');
      const projects = await fetchProjects();
      if (projects.length > 0) {
        setProjects(projects);
        setCurrentProject(projects[0]);
        const [postsData, commentsData] = await Promise.all([
          fetchPosts(projects[0].id),
          fetchComments(projects[0].id),
        ]);
        setPosts(postsData);
        setComments(commentsData);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载数据失败';
      setLoadError(msg);
    }
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Chart: Narrative Distribution (Pie) ───────────────────
  const narrativePieOption = useMemo(() => {
    if (!stats) return {};
    const data = NARRATIVE_TYPES.map(t => ({
      name: getNarrativeLabel(t),
      value: stats.narrativeDistribution[t] || 0,
      itemStyle: { color: NARRATIVE_COLORS[t] },
    })).filter(d => d.value > 0);

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#94A3B8', fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#030712', borderWidth: 2 },
        label: { show: true, color: '#CBD5E1', fontSize: 11, formatter: '{b}\n{d}%' },
        emphasis: { label: { fontSize: 13, fontWeight: 'bold' } },
        data,
      }],
    };
  }, [stats]);

  // ─── Chart: Emotion Scatter (Russell Model) ────────────────
  const emotionScatterOption = useMemo(() => {
    const data = analyzedComments
      .filter(c => c.analysis?.d2_valence != null && c.analysis?.d2_arousal != null)
      .map(c => ({
        value: [c.analysis!.d2_valence!, c.analysis!.d2_arousal!, c.analysis!.d3 || 1],
        itemStyle: {
          color: c.analysis?.risk_level === 'high' ? '#EF4444' :
                 c.analysis?.risk_level === 'medium' ? '#F59E0B' :
                 c.analysis?.narrative_type ? NARRATIVE_COLORS[c.analysis.narrative_type] : '#3B82F6',
          opacity: 0.7,
        },
      }));

    return {
      tooltip: {
        formatter: (p: { value: number[] }) =>
          `效价: ${p.value[0]?.toFixed(2)}<br/>唤醒: ${p.value[1]?.toFixed(2)}<br/>认同: ${p.value[2]?.toFixed(1)}`,
      },
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      xAxis: {
        name: '情感效价',
        nameLocation: 'center',
        nameGap: 25,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        type: 'value',
        min: -1,
        max: 1,
        splitLine: { lineStyle: { color: '#1E293B' } },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      yAxis: {
        name: '情感唤醒',
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
        symbolSize: (val: number[]) => Math.max(6, Math.min(20, val[2] * 3)),
        data,
        emphasis: { scale: 1.5 },
      }],
    };
  }, [analyzedComments]);

  // ─── Chart: Six-Dimension Radar ────────────────────────────
  const radarOption = useMemo(() => {
    if (!stats) return {};
    const dimValues = DIMENSIONS.map(d => stats.avgDimensions[d as keyof typeof stats.avgDimensions] || 0);

    return {
      tooltip: {},
      radar: RADAR_BASE,
      series: [{
        type: 'radar',
        data: [{
          value: dimValues,
          name: '平均维度',
          areaStyle: { color: 'rgba(139, 92, 246, 0.15)' },
          lineStyle: { color: '#8B5CF6', width: 2 },
          itemStyle: { color: '#8B5CF6' },
        }],
      }],
    };
  }, [stats]);

  // ─── Chart: Platform Comparison (Grouped Bar) ──────────────
  const platformBarOption = useMemo(() => {
    const bilibiliComments = analyzedComments.filter(c => postMap.get(c.post_id)?.platform === 'bilibili');
    const xhsComments = analyzedComments.filter(c => postMap.get(c.post_id)?.platform === 'xhs');

    return {
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['B站', '小红书'],
        textStyle: { color: '#94A3B8', fontSize: 11 },
        top: 0,
      },
      grid: { top: 30, right: 15, bottom: 40, left: 50 },
      xAxis: {
        type: 'category',
        data: DIMENSIONS.map(d => getDimensionLabel(d)),
        axisLabel: { color: '#64748B', fontSize: 10, rotate: 15 },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        max: 10,
        splitLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [
        {
          name: 'B站',
          type: 'bar',
          barWidth: '30%',
          itemStyle: { color: '#00A1D6', borderRadius: [4, 4, 0, 0] },
          data: DIMENSIONS.map(d => Number(avgDim(bilibiliComments, d).toFixed(2))),
        },
        {
          name: '小红书',
          type: 'bar',
          barWidth: '30%',
          itemStyle: { color: '#FE2C55', borderRadius: [4, 4, 0, 0] },
          data: DIMENSIONS.map(d => Number(avgDim(xhsComments, d).toFixed(2))),
        },
      ],
    };
  }, [analyzedComments, postMap]);

  // ─── Chart: Risk Distribution (Donut) ──────────────────────
  const riskDonutOption = useMemo(() => {
    const riskCounts: Record<string, number> = { safe: 0, low: 0, medium: 0, high: 0 };
    for (const c of analyzedComments) {
      const rl = c.analysis?.risk_level;
      if (rl && rl in riskCounts) riskCounts[rl]++;
    }

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        itemStyle: { borderRadius: 6, borderColor: '#030712', borderWidth: 2 },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#F8FAFC' } },
        data: [
          { name: '安全', value: riskCounts.safe, itemStyle: { color: '#10B981' } },
          { name: '低危', value: riskCounts.low, itemStyle: { color: '#6EE7B7' } },
          { name: '中危', value: riskCounts.medium, itemStyle: { color: '#F59E0B' } },
          { name: '高危', value: riskCounts.high, itemStyle: { color: '#EF4444' } },
        ].filter(d => d.value > 0),
      }],
    };
  }, [analyzedComments]);

  // ─── Chart: Likes Distribution (Histogram) ─────────────────
  const likesHistOption = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0]; // 0, 1-10, 11-50, 51-100, 101-500, 500+
    for (const c of comments) {
      const l = c.likes || 0;
      if (l === 0) buckets[0]++;
      else if (l <= 10) buckets[1]++;
      else if (l <= 50) buckets[2]++;
      else if (l <= 100) buckets[3]++;
      else if (l <= 500) buckets[4]++;
      else buckets[5]++;
    }

    return {
      tooltip: { trigger: 'axis' },
      grid: { top: 15, right: 15, bottom: 40, left: 50 },
      xAxis: {
        type: 'category',
        data: ['0', '1-10', '11-50', '51-100', '101-500', '500+'],
        axisLabel: { color: '#64748B', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [{
        type: 'bar',
        data: buckets,
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const colors = ['#334155', '#3B82F6', '#60A5FA', '#F59E0B', '#EF4444', '#DC2626'];
            return colors[params.dataIndex];
          },
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '60%',
      }],
    };
  }, [comments]);

  // ─── Chart: Narrative Sunburst ─────────────────────────────
  const sunburstOption = useMemo(() => {
    if (!stats) return {};

    const platformData: Record<string, Record<string, number>> = {};
    for (const c of analyzedComments) {
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
        name: getNarrativeLabel(nt),
        value: count,
        itemStyle: { color: NARRATIVE_COLORS[nt] },
      })),
    }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 条' },
      series: [{
        type: 'sunburst',
        data: children,
        radius: ['12%', '90%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' },
        levels: [
          {},
          {
            r0: '12%',
            r: '45%',
            label: { rotate: 'tangential', fontSize: 11, color: '#F8FAFC' },
          },
          {
            r0: '45%',
            r: '90%',
            label: { align: 'right', fontSize: 10, color: '#CBD5E1' },
          },
        ],
      }],
    };
  }, [analyzedComments, postMap]);

  // ─── Chart: AIGC vs Human Radar ────────────────────────────
  const aigcRadarOption = useMemo(() => {
    const aigcPostIds = new Set(posts.filter(p => p.is_aigc).map(p => p.id));
    const aigcComments = analyzedComments.filter(c => aigcPostIds.has(c.post_id));
    const humanComments = analyzedComments.filter(c => !aigcPostIds.has(c.post_id));

    if (aigcComments.length === 0 || humanComments.length === 0) return {};

    return {
      tooltip: {},
      legend: {
        data: ['AIGC', '人工'],
        textStyle: { color: '#94A3B8', fontSize: 11 },
        bottom: 0,
      },
      radar: RADAR_BASE,
      series: [{
        type: 'radar',
        data: [
          {
            value: DIMENSIONS.map(d => Number(avgDim(aigcComments, d).toFixed(2))),
            name: 'AIGC',
            areaStyle: { color: 'rgba(139, 92, 246, 0.15)' },
            lineStyle: { color: '#8B5CF6', width: 2 },
            itemStyle: { color: '#8B5CF6' },
          },
          {
            value: DIMENSIONS.map(d => Number(avgDim(humanComments, d).toFixed(2))),
            name: '人工',
            areaStyle: { color: 'rgba(16, 185, 129, 0.15)' },
            lineStyle: { color: '#10B981', width: 2 },
            itemStyle: { color: '#10B981' },
          },
        ],
      }],
    };
  }, [analyzedComments, posts]);

  // ─── Auto Insights ─────────────────────────────────────────
  const autoInsights = useMemo(() => {
    if (analyzedComments.length === 0) return [];

    const insights: string[] = [];

    // Top narrative (reuse shared stats)
    if (narrativeStats.topType) {
      const pct = ((narrativeStats.topCount / narrativeStats.total) * 100).toFixed(1);
      insights.push(`主导叙事类型为"${getNarrativeLabel(narrativeStats.topType)}"（${pct}%），共 ${narrativeStats.topCount} 条评论。`);
    }

    // Emotion tendency
    const avgValence = analyzedComments.reduce((s, c) => s + (c.analysis?.d2_valence || 0), 0) / analyzedComments.length;
    if (avgValence > 0.2) {
      insights.push(`情感效价总体偏正向（均值 ${avgValence.toFixed(2)}），公众对郭永怀的情感以正面为主。`);
    } else if (avgValence < -0.2) {
      insights.push(`情感效价偏负向（均值 ${avgValence.toFixed(2)}），需关注负面情感来源。`);
    }

    // Identity level
    const avgD3 = analyzedComments.reduce((s, c) => s + (c.analysis?.d3 || 0), 0) / analyzedComments.length;
    if (avgD3 > 4) {
      insights.push(`认同层级较高（D3 均值 ${avgD3.toFixed(1)}），表明公众倾向于将郭永怀置于集体记忆框架中。`);
    }

    return insights;
  }, [analyzedComments, narrativeStats]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-serif)' }}>
          研究台
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          郭永怀数字记忆研究 — 采集 · 分析 · 发现
        </p>
      </div>

      {/* Quick Collect */}
      <QuickCollectBar onCollected={loadData} />

      {/* Load Error */}
      {loadError && (
        <div className="glass-card p-4 border border-[#EF4444]/20">
          <p className="text-sm text-[#F87171]">数据加载失败：{loadError}</p>
          <button onClick={loadData} className="text-xs text-[#60A5FA] hover:text-[#93C5FD] mt-2">
            重试
          </button>
        </div>
      )}

      {/* Research Status Banner */}
      <ResearchBanner postCount={posts.length} commentCount={comments.length} analyzedCount={analyzedComments.length} />

      {/* Auto Insights */}
      {autoInsights.length > 0 && (
        <div className="finding-card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
            数据洞察
          </h3>
          <div className="space-y-2">
            {autoInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#8B5CF6]/10 text-[#A78BFA] text-[10px] flex items-center justify-center font-mono mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-[#CBD5E1] leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insight Cards */}
      <InsightCards posts={posts} analyzed={analyzedComments} narrativeStats={narrativeStats} />

      {/* Charts Grid */}
      {analyzedComments.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-serif)' }}>
            数据可视化
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Narrative Distribution */}
            <div id="chart-narrative" className="chart-academic">
              <div className="chart-title">叙事类型分布</div>
              <div className="chart-subtitle">基于 Labov 叙事分析框架的六类叙事编码</div>
              <ReactECharts
                option={narrativePieOption}
                style={{ height: 320 }}
                onEvents={{
                  click: (params: { data?: { name?: string } }) => {
                    if (params.data?.name) {
                      const types = NARRATIVE_TYPES;
                      const matched = types.find(t => getNarrativeLabel(t) === params.data!.name);
                      if (matched) setSelectedNarrativeType(selectedNarrativeType === matched ? null : matched);
                    }
                  },
                }}
              />
              <div className="figure-caption">
                <span className="figure-num">图 1</span> 郭永怀相关评论叙事类型分布（N={analyzedComments.length}）
              </div>
            </div>

            {/* Emotion Scatter */}
            <div className="chart-academic">
              <div className="chart-title">情感空间分布</div>
              <div className="chart-subtitle">Russell 情感环状模型：效价 × 唤醒度</div>
              <ReactECharts option={emotionScatterOption} style={{ height: 320 }} />
              <div className="figure-caption">
                <span className="figure-num">图 2</span> 评论情感效价与唤醒度散点分布（点大小=认同层级）
              </div>
            </div>

            {/* Six-Dimension Radar */}
            <div className="chart-academic">
              <div className="chart-title">六维分析雷达图</div>
              <div className="chart-subtitle">ELM + Russell + Assmann 综合维度均值</div>
              <ReactECharts option={radarOption} style={{ height: 320 }} />
              <div className="figure-caption">
                <span className="figure-num">图 3</span> 评论六维编码均值雷达图
              </div>
            </div>

            {/* Platform Comparison */}
            {posts.some(p => p.platform === 'bilibili') && posts.some(p => p.platform === 'xhs') && (
              <div id="chart-platform" className="chart-academic">
                <div className="chart-title">平台维度对比</div>
                <div className="chart-subtitle">B站 vs 小红书六维均值对比</div>
                <ReactECharts option={platformBarOption} style={{ height: 320 }} />
                <div className="figure-caption">
                  <span className="figure-num">图 4</span> B站与小红书评论六维编码均值对比
                </div>
              </div>
            )}

            {/* Narrative Sunburst */}
            <div className="chart-academic">
              <div className="chart-title">平台 × 叙事类型</div>
              <div className="chart-subtitle">内环=平台，外环=叙事类型</div>
              <ReactECharts option={sunburstOption} style={{ height: 320 }} />
              <div className="figure-caption">
                <span className="figure-num">图 5</span> 按平台和叙事类型的评论分布旭日图
              </div>
            </div>

            {/* Risk Distribution */}
            <div id="chart-risk" className="chart-academic">
              <div className="chart-title">伦理风险分布</div>
              <div className="chart-subtitle">基于媒介伦理框架的风险等级划分</div>
              <ReactECharts option={riskDonutOption} style={{ height: 320 }} />
              <div className="figure-caption">
                <span className="figure-num">图 6</span> 评论伦理风险等级分布
              </div>
            </div>

            {/* AIGC vs Human */}
            {aigcRadarOption && Object.keys(aigcRadarOption).length > 0 && (
              <div id="chart-aigc" className="chart-academic">
                <div className="chart-title">AIGC vs 人工内容</div>
                <div className="chart-subtitle">AI 生成内容与人工内容的六维对比</div>
                <ReactECharts option={aigcRadarOption} style={{ height: 320 }} />
                <div className="figure-caption">
                  <span className="figure-num">图 7</span> AIGC 与人工内容六维编码均值对比
                </div>
              </div>
            )}

            {/* Likes Distribution */}
            <div className="chart-academic">
              <div className="chart-title">点赞量分布</div>
              <div className="chart-subtitle">评论点赞数的频次分布直方图</div>
              <ReactECharts option={likesHistOption} style={{ height: 320 }} />
              <div className="figure-caption">
                <span className="figure-num">图 8</span> 评论点赞数频次分布（N={comments.length}）
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis pending guidance */}
      {posts.length > 0 && analyzedComments.length === 0 && comments.length > 0 && (
        <div className="finding-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#F59E0B]/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#FCD34D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC] mb-1">数据已采集，等待分析</h3>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                已采集 {comments.length} 条评论，但尚未进行 AI 六维分析。请前往
                <a href="/p0" className="text-[#60A5FA] hover:text-[#93C5FD] mx-1 underline">数据采集中心</a>
                的"AI 分析"板块启动分析，完成后即可查看可视化图表。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {analyzedComments.length === 0 && posts.length === 0 && (
        <div className="finding-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#3B82F6]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">开始你的研究</h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            在上方粘贴 B站视频链接，一键采集所有评论。采集完成后，前往数据采集中心启动 AI 分析，即可在此查看可视化图表。
          </p>
        </div>
      )}
    </div>
  );
}
