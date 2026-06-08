'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn, formatNumber, getRiskColor, getRiskLabel, getNarrativeLabel, getDimensionLabel, NARRATIVE_COLORS } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function AnatomyPage() {
  const { posts, comments, selectedPostId, setSelectedPostId, selectedCommentId, setSelectedCommentId } = useAppStore();
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [narrativeFilter, setNarrativeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'likes' | 'risk'>('likes');

  // Get selected post
  const selectedPost = useMemo(() => {
    return posts.find(p => p.id === selectedPostId) || posts[0] || null;
  }, [posts, selectedPostId]);

  // Get comments for selected post
  const postComments = useMemo(() => {
    if (!selectedPost) return [];
    return comments.filter(c => c.post_id === selectedPost.id);
  }, [comments, selectedPost]);

  // Filtered comments
  const filteredComments = useMemo(() => {
    let result = postComments;

    if (sentimentFilter !== 'all') {
      result = result.filter(c => {
        if (!c.analysis) return false;
        const v = c.analysis.d2_valence || 0;
        if (sentimentFilter === 'positive') return v > 0.2;
        if (sentimentFilter === 'negative') return v < -0.2;
        return Math.abs(v) <= 0.2;
      });
    }

    if (riskFilter !== 'all') {
      result = result.filter(c => c.analysis?.risk_level === riskFilter);
    }

    if (narrativeFilter !== 'all') {
      result = result.filter(c => c.analysis?.narrative_type === narrativeFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => c.text.toLowerCase().includes(q));
    }

    // Sort
    if (sortBy === 'likes') {
      result = [...result].sort((a, b) => b.likes - a.likes);
    } else {
      const riskOrder = { high: 4, medium: 3, low: 2, safe: 1 };
      result = [...result].sort((a, b) => {
        const ra = riskOrder[a.analysis?.risk_level as keyof typeof riskOrder] || 0;
        const rb = riskOrder[b.analysis?.risk_level as keyof typeof riskOrder] || 0;
        return rb - ra;
      });
    }

    return result;
  }, [postComments, sentimentFilter, riskFilter, narrativeFilter, searchQuery, sortBy]);

  // Selected comment
  const selectedComment = useMemo(() => {
    return comments.find(c => c.id === selectedCommentId) || filteredComments[0] || null;
  }, [comments, selectedCommentId, filteredComments]);

  // Radar option for selected comment
  const radarOption = useMemo(() => {
    if (!selectedComment?.analysis) return {};

    const dims = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
    const values = dims.map(d => {
      const val = selectedComment.analysis?.[d as keyof typeof selectedComment.analysis];
      return typeof val === 'number' ? val : 0;
    });

    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: dims.map(d => ({ name: getDimensionLabel(d), max: 10 })),
        shape: 'polygon',
        splitNumber: 5,
        axisName: { color: '#94A3B8', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: values,
          name: '六维评分',
          lineStyle: { color: '#3B82F6', width: 2 },
          areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
          itemStyle: { color: '#3B82F6' },
        }],
      }],
    };
  }, [selectedComment]);

  // Labov weights bar chart
  const labovOption = useMemo(() => {
    if (!selectedComment?.analysis?.labov_weights) return {};

    const elements = ['摘要', '指向', '进展', '评价', '结局', '尾声'];
    const weights = selectedComment.analysis.labov_weights;

    return {
      backgroundColor: 'transparent',
      grid: { top: 10, right: 10, bottom: 30, left: 50 },
      xAxis: {
        type: 'category',
        data: elements,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        max: 1,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B', type: 'dashed' } },
      },
      series: [{
        type: 'bar',
        data: weights.map((w: number) => ({
          value: w,
          itemStyle: {
            color: '#8B5CF6',
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: 20,
      }],
    };
  }, [selectedComment]);

  // Highlight evidence keywords in text
  const highlightText = (text: string, keywords?: { word: string; weight: number }[]) => {
    if (!keywords || keywords.length === 0) return text;

    let result = text;
    keywords.forEach(kw => {
      const regex = new RegExp(`(${kw.word})`, 'gi');
      result = result.replace(regex, `<mark class="bg-[#3B82F6]/30 text-[#60A5FA] px-0.5 rounded">$1</mark>`);
    });
    return result;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          单条内容解剖室
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          微观级内容深度分析 · 逐条笔记的可视化体检报告
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Post + Comments List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Post Card */}
          {selectedPost && (
            <div className="glass-card p-5 animate-fade-in">
              <div className="flex gap-4">
                {/* Post Cover (placeholder) */}
                <div className="w-40 h-24 rounded-lg bg-[#030712] border border-[#1E293B] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs text-[#64748B]">16:9 封面</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#F8FAFC] line-clamp-2">
                    {selectedPost.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-2 text-xs text-[#64748B]">
                    <span>{selectedPost.author_name_mask}</span>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#111827] text-[#94A3B8]">
                      {selectedPost.platform === 'xhs' ? '小红书' : 'B站'}
                    </span>
                    {selectedPost.is_aigc && (
                      <span className="px-1.5 py-0.5 rounded bg-[#8B5CF6]/10 text-[#8B5CF6]">
                        AIGC
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-[#64748B]">
                    <span>❤️ {formatNumber(selectedPost.likes)}</span>
                    <span>💬 {formatNumber(selectedPost.comments_count)}</span>
                    <span>↗️ {formatNumber(selectedPost.shares)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comment Filters */}
          <div className="glass-card p-4 animate-fade-in stagger-1">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
                className="px-2 py-1 rounded bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-xs"
              >
                <option value="all">情感: 全部</option>
                <option value="positive">正向</option>
                <option value="neutral">中性</option>
                <option value="negative">负向</option>
              </select>

              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="px-2 py-1 rounded bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-xs"
              >
                <option value="all">风险: 全部</option>
                <option value="safe">安全</option>
                <option value="low">低危</option>
                <option value="medium">中危</option>
                <option value="high">高危</option>
              </select>

              <select
                value={narrativeFilter}
                onChange={(e) => setNarrativeFilter(e.target.value)}
                className="px-2 py-1 rounded bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-xs"
              >
                <option value="all">叙事: 全部</option>
                {['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map(t => (
                  <option key={t} value={t}>{t} {getNarrativeLabel(t)}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'likes' | 'risk')}
                className="px-2 py-1 rounded bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-xs"
              >
                <option value="likes">按点赞排序</option>
                <option value="risk">按风险排序</option>
              </select>

              <input
                type="text"
                placeholder="搜索评论..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-2 py-1 rounded bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-xs flex-1 min-w-[120px]"
              />

              <span className="text-xs text-[#64748B]">
                筛选结果: {filteredComments.length} 条
              </span>
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredComments.map((comment) => (
              <div
                key={comment.id}
                onClick={() => setSelectedCommentId(comment.id)}
                className={cn(
                  'glass-card p-4 cursor-pointer transition-all duration-200',
                  'hover:border-[#334155]',
                  selectedComment?.id === comment.id && 'border-[#3B82F6]/50 bg-[#3B82F6]/5'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-[#F8FAFC] flex-1 line-clamp-2">
                    {comment.text}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {comment.analysis?.risk_level && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          color: getRiskColor(comment.analysis.risk_level),
                          backgroundColor: `${getRiskColor(comment.analysis.risk_level)}15`,
                        }}
                      >
                        {getRiskLabel(comment.analysis.risk_level)}
                      </span>
                    )}
                    {comment.analysis?.narrative_type && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          color: NARRATIVE_COLORS[comment.analysis.narrative_type],
                          backgroundColor: `${NARRATIVE_COLORS[comment.analysis.narrative_type]}15`,
                        }}
                      >
                        {comment.analysis.narrative_type}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-[#64748B]">
                  <span>❤️ {comment.likes}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#111827]">
                    {comment.sampling_tier === 'high' ? '高赞' : comment.sampling_tier === 'mid' ? '中赞' : '低赞'}
                  </span>
                  {comment.human_corrected && (
                    <span className="text-[#F59E0B]">人工校验</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI Analysis Panel */}
        <div className="lg:col-span-2 space-y-4">
          {selectedComment ? (
            <>
              {/* Comment Info (always shown when a comment is selected) */}
              <div className="glass-card p-5 animate-fade-in">
                <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">评论详情</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed mb-3">{selectedComment.text}</p>
                <div className="flex items-center gap-3 text-xs text-[#64748B]">
                  <span>❤️ {selectedComment.likes}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#111827]">
                    {selectedComment.sampling_tier === 'high' ? '高赞' : selectedComment.sampling_tier === 'mid' ? '中赞' : '低赞'}
                  </span>
                  {selectedComment.analysis?.risk_level && (
                    <span style={{ color: getRiskColor(selectedComment.analysis.risk_level) }}>
                      {getRiskLabel(selectedComment.analysis.risk_level)}
                    </span>
                  )}
                </div>
              </div>

              {selectedComment.analysis ? (
                <>
                  {/* Single Radar */}
                  <div className="glass-card p-5 animate-fade-in stagger-1">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">六维分析</h3>
                    <ReactECharts option={radarOption} style={{ height: 240 }} />
                  </div>

                  {/* Narrative Type */}
                  <div className="glass-card p-5 animate-fade-in stagger-2">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">叙事类型</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="px-3 py-1 rounded-lg text-sm font-medium"
                        style={{
                          color: NARRATIVE_COLORS[selectedComment.analysis.narrative_type || ''],
                          backgroundColor: `${NARRATIVE_COLORS[selectedComment.analysis.narrative_type || '']}15`,
                        }}
                      >
                        {selectedComment.analysis.narrative_type} {getNarrativeLabel(selectedComment.analysis.narrative_type || '')}
                      </span>
                    </div>
                    <ReactECharts option={labovOption} style={{ height: 160 }} />
                  </div>

                  {/* Risk Level */}
                  <div className="glass-card p-5 animate-fade-in stagger-3">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">伦理风险</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 rounded-full bg-[#030712] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, ((selectedComment.analysis.d6 || 0) / 3) * 100)}%`,
                            background: `linear-gradient(90deg, #10B981, #F59E0B, #EF4444)`,
                          }}
                        />
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: getRiskColor(selectedComment.analysis.risk_level || '') }}
                      >
                        {getRiskLabel(selectedComment.analysis.risk_level || '')}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Keywords */}
                  {selectedComment.analysis.evidence_keywords && selectedComment.analysis.evidence_keywords.length > 0 && (
                    <div className="glass-card p-5 animate-fade-in stagger-4">
                      <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">AI 分析依据</h3>
                      <div className="space-y-2">
                        {selectedComment.analysis.evidence_keywords.map((kw, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-[#60A5FA] bg-[#3B82F6]/10 px-2 py-0.5 rounded">
                              {kw.word}
                            </span>
                            <span className="text-[#64748B]">
                              权重 {kw.weight.toFixed(2)} · {getDimensionLabel(kw.dimension)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Highlighted Text */}
                  <div className="glass-card p-5 animate-fade-in stagger-5">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">评论原文（证据词高亮）</h3>
                    <p
                      className="text-sm text-[#94A3B8] leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(selectedComment.text, selectedComment.analysis.evidence_keywords),
                      }}
                    />
                  </div>

                  {/* Manual Correction */}
                  <div className="glass-card p-5 animate-fade-in stagger-6">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">人工修正</h3>
                    <p className="text-xs text-[#64748B] mb-3">
                      拖动滑块修正 AI 评分，修正后标记为"人工校验"
                    </p>
                    {['d1', 'd3', 'd5'].map(dim => (
                      <div key={dim} className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[#94A3B8]">{getDimensionLabel(dim)}</span>
                          <span className="text-[#F8FAFC] font-mono">
                            {typeof selectedComment.analysis?.[dim as keyof typeof selectedComment.analysis] === 'number'
                              ? (selectedComment.analysis[dim as keyof typeof selectedComment.analysis] as number).toFixed(1)
                              : '-'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.1"
                          defaultValue={typeof selectedComment.analysis?.[dim as keyof typeof selectedComment.analysis] === 'number'
                            ? selectedComment.analysis[dim as keyof typeof selectedComment.analysis] as number
                            : 5}
                          className="w-full accent-[#3B82F6]"
                        />
                      </div>
                    ))}
                    <button className="w-full mt-2 px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white text-xs hover:bg-[#2563EB] transition-colors">
                      保存修正
                    </button>
                  </div>
                </>
              ) : (
                <div className="glass-card p-6 text-center">
                  <p className="text-[#F59E0B] text-sm mb-1">该评论尚未进行 AI 分析</p>
                  <p className="text-[#64748B] text-xs">请先在入口控制台执行 AI 分析后再查看六维编码结果</p>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card p-8 text-center">
              <p className="text-[#64748B]">选择一条评论查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
