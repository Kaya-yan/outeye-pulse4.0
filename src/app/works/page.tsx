'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { updatePost, createPost } from '@/lib/supabase-service';
import { cn, formatNumber, getDimensionLabel, getRiskLabel, getRiskColor } from '@/lib/utils';
import type { Post, AigcType } from '@/types';
import { AIGC_TYPE_LABELS } from '@/types';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: 'B站',
  xhs: '小红书',
};

const PLATFORM_COLORS: Record<string, string> = {
  bilibili: '#00A1D6',
  xhs: '#FE2C55',
};

export default function WorksPage() {
  const { currentProject, posts, comments, setPosts, addPost } = useAppStore();
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const projectPosts = useMemo(() => {
    if (!currentProject) return [];
    return posts.filter(p => p.project_id === currentProject.id);
  }, [posts, currentProject]);

  const postStats = useMemo(() => {
    const stats = new Map<string, { commentCount: number; avgValence: number; analyzedCount: number }>();
    for (const post of projectPosts) {
      const postComments = comments.filter(c => c.post_id === post.id);
      const analyzed = postComments.filter(c => c.analysis?.d2_valence != null);
      const avgValence = analyzed.length > 0
        ? analyzed.reduce((s, c) => s + (c.analysis!.d2_valence ?? 0), 0) / analyzed.length
        : 0;
      stats.set(post.id, {
        commentCount: postComments.length,
        avgValence,
        analyzedCount: analyzed.length,
      });
    }
    return stats;
  }, [projectPosts, comments]);

  // Multi-work comparison data
  const comparisonOption = useMemo(() => {
    if (projectPosts.length < 2) return null;

    const dimensions = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];
    const dimLabels = dimensions.map(d => getDimensionLabel(d));
    const WORK_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

    const series = projectPosts.map((post, idx) => {
      const postComments = comments.filter(c => c.post_id === post.id && c.analysis);
      const values = dimensions.map(d => {
        const vals = postComments
          .map(c => c.analysis?.[d as keyof typeof c.analysis])
          .filter((v): v is number => typeof v === 'number');
        return vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
      });

      return {
        name: post.title?.slice(0, 15) || post.id.slice(0, 8),
        type: 'bar' as const,
        data: values,
        itemStyle: { color: WORK_COLORS[idx % WORK_COLORS.length] },
        barGap: '10%',
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#0B1221',
        borderColor: '#1E293B',
        textStyle: { color: '#F8FAFC' },
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      grid: { top: 30, right: 20, bottom: 50, left: 50 },
      xAxis: {
        type: 'category' as const,
        data: dimLabels,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisLabel: { color: '#64748B' },
        splitLine: { lineStyle: { color: '#1E293B', type: 'dashed' as const } },
      },
      series,
    };
  }, [projectPosts, comments]);

  // Comparison table data
  const comparisonTable = useMemo(() => {
    if (projectPosts.length < 2) return null;

    const dimensions = ['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'];

    return projectPosts.map(post => {
      const postComments = comments.filter(c => c.post_id === post.id);
      const analyzed = postComments.filter(c => c.analysis);
      const dimAvgs: Record<string, number> = {};

      for (const d of dimensions) {
        const vals = analyzed
          .map(c => c.analysis?.[d as keyof typeof c.analysis])
          .filter((v): v is number => typeof v === 'number');
        dimAvgs[d] = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
      }

      const riskDist = { safe: 0, low: 0, medium: 0, high: 0 };
      for (const c of analyzed) {
        const rl = c.analysis?.risk_level;
        if (rl && rl in riskDist) riskDist[rl]++;
      }

      return {
        id: post.id,
        title: post.title || '(无标题)',
        platform: post.platform,
        commentCount: postComments.length,
        analyzedCount: analyzed.length,
        dimAvgs,
        riskDist,
      };
    });
  }, [projectPosts, comments]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-[#64748B] mb-4">请先选择或创建一个项目</p>
          <a href="/settings" className="px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm">
            前往设置
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
            作品库
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {currentProject.name} · {projectPosts.length} 部作品
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加作品
        </button>
      </div>

      {/* Works Cards */}
      {projectPosts.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-[#64748B] mb-2">暂无作品</p>
          <p className="text-xs text-[#475569]">点击"添加作品"手动录入，或前往采集台自动采集</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectPosts.map((post, i) => {
            const stats = postStats.get(post.id);
            return (
              <div
                key={post.id}
                className={cn('glass-card p-5 animate-fade-in', `stagger-${(i % 6) + 1}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: PLATFORM_COLORS[post.platform] + '20',
                          color: PLATFORM_COLORS[post.platform],
                        }}
                      >
                        {PLATFORM_LABELS[post.platform] || post.platform}
                      </span>
                      {post.is_aigc && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 text-[#A78BFA]">
                          AIGC
                        </span>
                      )}
                      {post.aigc_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#FBBF24]">
                          {AIGC_TYPE_LABELS[post.aigc_type]}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[#F8FAFC] truncate" title={post.title}>
                      {post.title || '(无标题)'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setEditingPost(post)}
                    className="ml-2 p-1.5 rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-[#94A3B8] transition-colors flex-shrink-0"
                    title="编辑"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>

                {post.creator_name && (
                  <p className="text-xs text-[#94A3B8] mb-2">UP主: {post.creator_name}</p>
                )}

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <div className="text-xs text-[#64748B]">评论</div>
                    <div className="text-sm font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                      {stats?.commentCount ?? 0}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-[#64748B]">播放</div>
                    <div className="text-sm font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                      {formatNumber(post.view_count || 0)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-[#64748B]">情感效价</div>
                    <div
                      className={cn(
                        'text-sm font-bold',
                        (stats?.avgValence ?? 0) > 0.1 ? 'text-[#10B981]' :
                        (stats?.avgValence ?? 0) < -0.1 ? 'text-[#EF4444]' : 'text-[#F8FAFC]'
                      )}
                      style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      {(stats?.avgValence ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {post.url && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1 text-xs text-[#60A5FA] hover:text-[#93C5FD] transition-colors truncate"
                  >
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {post.url.replace('https://', '').slice(0, 40)}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-work Comparison */}
      {projectPosts.length >= 2 && (
        <div className="glass-card p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">作品对比</h3>
              <p className="text-xs text-[#64748B] mt-0.5">多作品六维度均值对比</p>
            </div>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/30 hover:bg-[#3B82F6]/20 transition-colors"
            >
              {showComparison ? '收起' : '展开'}对比
            </button>
          </div>

          {showComparison && (
            <div className="space-y-6">
              {/* Grouped Bar Chart */}
              {comparisonOption && (
                <ReactECharts option={comparisonOption} style={{ height: 320 }} />
              )}

              {/* Comparison Table */}
              {comparisonTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1E293B]">
                        <th className="text-left py-2 px-3 text-[#94A3B8] font-medium">作品</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">评论数</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D1</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D2效价</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D2唤醒</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D3</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D4</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D5</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">D6</th>
                        <th className="text-center py-2 px-2 text-[#94A3B8] font-medium">风险分布</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonTable.map(row => (
                        <tr key={row.id} className="border-b border-[#1E293B]/50 hover:bg-[#0B1221]/50">
                          <td className="py-2 px-3 text-[#F8FAFC] max-w-[150px] truncate" title={row.title}>
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5"
                              style={{ backgroundColor: PLATFORM_COLORS[row.platform] }}
                            />
                            {row.title}
                          </td>
                          <td className="text-center py-2 px-2 text-[#94A3B8]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {row.commentCount}
                          </td>
                          {['d1', 'd2_valence', 'd2_arousal', 'd3', 'd4', 'd5', 'd6'].map(d => (
                            <td key={d} className="text-center py-2 px-2 text-[#94A3B8]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                              {row.dimAvgs[d]}
                            </td>
                          ))}
                          <td className="text-center py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              {(['safe', 'low', 'medium', 'high'] as const).map(level => (
                                row.riskDist[level] > 0 && (
                                  <span
                                    key={level}
                                    className="text-[10px] px-1 py-0.5 rounded"
                                    style={{
                                      backgroundColor: getRiskColor(level) + '20',
                                      color: getRiskColor(level),
                                    }}
                                    title={`${getRiskLabel(level)}: ${row.riskDist[level]}`}
                                  >
                                    {row.riskDist[level]}
                                  </span>
                                )
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={async (updates) => {
            const ok = await updatePost(editingPost.id, updates);
            if (ok) {
              setPosts(posts.map(p => p.id === editingPost.id ? { ...p, ...updates } : p));
            }
            setEditingPost(null);
          }}
        />
      )}

      {/* Add Modal */}
      {showAddForm && (
        <AddPostModal
          projectId={currentProject.id}
          onClose={() => setShowAddForm(false)}
          onSave={async (newPost) => {
            const created = await createPost(newPost);
            if (created) {
              addPost(created);
            }
            setShowAddForm(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────

function EditPostModal({
  post,
  onClose,
  onSave,
}: {
  post: Post;
  onClose: () => void;
  onSave: (updates: Partial<Post>) => void;
}) {
  const [aigcType, setAigcType] = useState<AigcType | ''>(post.aigc_type || '');
  const [creatorName, setCreatorName] = useState(post.creator_name || '');
  const [viewCount, setViewCount] = useState(String(post.view_count || ''));
  const [description, setDescription] = useState(post.description || '');
  const [isAigc, setIsAigc] = useState(post.is_aigc);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-card w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#F8FAFC] mb-1" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          编辑作品信息
        </h2>
        <p className="text-xs text-[#64748B] mb-5 truncate">{post.title}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">AIGC 类型</label>
            <select
              value={aigcType}
              onChange={e => {
                const val = e.target.value as AigcType | '';
                setAigcType(val);
                if (val && val !== 'documentary' && val !== 'drama' && val !== 'other') {
                  setIsAigc(true);
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
            >
              <option value="">未设置</option>
              {(Object.entries(AIGC_TYPE_LABELS) as [AigcType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAigc}
                onChange={e => setIsAigc(e.target.checked)}
                className="w-4 h-4 rounded border-[#1E293B] bg-[#030712] text-[#3B82F6] focus:ring-[#3B82F6]"
              />
              <span className="text-xs text-[#94A3B8]">标记为 AIGC 内容</span>
            </label>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">UP主 / 创作者</label>
            <input
              type="text"
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
              placeholder="创作者名称"
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">播放量</label>
            <input
              type="number"
              value={viewCount}
              onChange={e => setViewCount(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            />
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">简介</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="作品简介或备注"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569] resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B] hover:border-[#334155] transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSave({
              aigc_type: aigcType || undefined,
              is_aigc: isAigc,
              creator_name: creatorName || undefined,
              view_count: viewCount ? Number(viewCount) : undefined,
              description: description || undefined,
            })}
            className="px-4 py-2 rounded-lg text-sm bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────

function AddPostModal({
  projectId,
  onClose,
  onSave,
}: {
  projectId: string;
  onClose: () => void;
  onSave: (post: Partial<Post>) => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<'bilibili' | 'xhs'>('bilibili');
  const [creatorName, setCreatorName] = useState('');
  const [aigcType, setAigcType] = useState<AigcType | ''>('');
  const [viewCount, setViewCount] = useState('');
  const [description, setDescription] = useState('');
  const [isAigc, setIsAigc] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectFromUrl = useCallback(async () => {
    if (!url) return;

    const biliMatch = url.match(/(BV\w{10})/);
    if (biliMatch) {
      setPlatform('bilibili');
      setDetecting(true);
      try {
        const res = await fetch(`/api/bilibili/video?bvid=${biliMatch[1]}`);
        const data = await res.json();
        if (data.title) setTitle(data.title);
        if (data.owner?.name) setCreatorName(data.owner.name);
        if (data.stat?.view) setViewCount(String(data.stat.view));
      } catch { /* ignore */ }
      setDetecting(false);
      return;
    }

    if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) {
      setPlatform('xhs');
    }
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-card w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#F8FAFC] mb-5" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          添加新作品
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">作品链接</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onBlur={detectFromUrl}
                placeholder="粘贴B站/小红书链接，自动识别"
                className="flex-1 px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
              />
              {detecting && (
                <span className="text-xs text-[#60A5FA] self-center">识别中...</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1.5">平台</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value as 'bilibili' | 'xhs')}
                className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
              >
                <option value="bilibili">B站</option>
                <option value="xhs">小红书</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1.5">AIGC 类型</label>
              <select
                value={aigcType}
                onChange={e => {
                  const val = e.target.value as AigcType | '';
                  setAigcType(val);
                  if (val && val !== 'documentary' && val !== 'drama' && val !== 'other') setIsAigc(true);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none"
              >
                <option value="">未设置</option>
                {(Object.entries(AIGC_TYPE_LABELS) as [AigcType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">标题</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="作品标题"
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1.5">UP主 / 创作者</label>
              <input
                type="text"
                value={creatorName}
                onChange={e => setCreatorName(e.target.value)}
                placeholder="创作者名称"
                className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1.5">播放量</label>
              <input
                type="number"
                value={viewCount}
                onChange={e => setViewCount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569]"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAigc}
                onChange={e => setIsAigc(e.target.checked)}
                className="w-4 h-4 rounded border-[#1E293B] bg-[#030712] text-[#3B82F6] focus:ring-[#3B82F6]"
              />
              <span className="text-xs text-[#94A3B8]">标记为 AIGC 内容</span>
            </label>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">简介</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="作品简介或备注"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none placeholder:text-[#475569] resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B] hover:border-[#334155] transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!title && !url) return;
              onSave({
                project_id: projectId,
                platform,
                url: url || undefined,
                title: title || undefined,
                creator_name: creatorName || undefined,
                aigc_type: aigcType || undefined,
                is_aigc: isAigc,
                view_count: viewCount ? Number(viewCount) : 0,
                description: description || undefined,
                likes: 0,
                comments_count: 0,
                shares: 0,
                collected_at: new Date().toISOString(),
                collected_by: 'manual',
                analysis_status: 'pending',
              });
            }}
            className="px-4 py-2 rounded-lg text-sm bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
