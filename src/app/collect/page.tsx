'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/useAppStore';
import { cn, formatNumber } from '@/lib/utils';
import { createProject, deletePost as deletePostApi, fetchPendingRawComments, linkRawComments, ignoreRawComments, createPost, fetchPosts, fetchComments, fetchProjects, createSearchTask, insertSearchResults, fetchSearchResults } from '@/lib/supabase-service';
import type { RawComment, SearchResult } from '@/lib/supabase-service';

// ─── Mode Tabs ─────────────────────────────────────────────────
type CollectMode = 'url' | 'search';

function ModeSwitch({ mode, onChange }: { mode: CollectMode; onChange: (m: CollectMode) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] w-fit mx-auto">
      {([
        { key: 'url' as const, label: '精准采集', desc: '粘贴链接' },
        { key: 'search' as const, label: '关键词检索', desc: '搜索发现' },
      ]).map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-5 py-2 rounded-md text-sm transition-all duration-200',
            mode === tab.key
              ? 'bg-[var(--color-accent-blue)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Keyword Search ────────────────────────────────────────────
function KeywordSearch() {
  const { currentProject, posts, setPosts, setComments, setActiveAnalysisLogId, setAnalysisProgress } = useAppStore();
  const [keyword, setKeyword] = useState('');
  const [platform, setPlatform] = useState<'bilibili' | 'xhs'>('bilibili');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(''); // YYYY-MM format
  const [dateTo, setDateTo] = useState('');     // YYYY-MM format
  const [biliResults, setBiliResults] = useState<{
    bvid: string; aid: number; title: string; author: string; mid: number;
    play: number; danmaku: number; favorites: number; likes: number;
    review: number; pubdate: number; duration: string; description: string;
    pic: string; tag: string;
  }[]>([]);
  const [xhsResults, setXhsResults] = useState<{
    id: string; note_id: string; title: string; author: string; url: string;
    views: number; likes: number; comments_count: number; cover_url: string;
    description: string; collected: boolean;
  }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalNote, setTotalNote] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTaskId, setSearchTaskId] = useState<string | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [batchCollecting, setBatchCollecting] = useState(false);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());

  const getTimeRangeParams = (): { pubtimeBegin?: number; pubtimeEnd?: number } => {
    if (!dateFrom && !dateTo) return {};
    const begin = dateFrom ? Math.floor(new Date(dateFrom + '-01').getTime() / 1000) : undefined;
    // End of month: go to next month first day, then subtract 1 second
    const end = dateTo
      ? Math.floor(new Date(new Date(dateTo + '-01').getFullYear(), new Date(dateTo + '-01').getMonth() + 1, 0, 23, 59, 59).getTime() / 1000)
      : undefined;
    return { pubtimeBegin: begin, pubtimeEnd: end };
  };

  const handleSearch = async (page = 1) => {
    if (!keyword.trim()) return;
    setSearching(true);
    setError(null);
    setCurrentPage(page);

    try {
      if (platform === 'bilibili') {
        const res = await fetch('/api/collect/bilibili-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: keyword.trim(), page, pageSize: 20, ...getTimeRangeParams() }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setBiliResults(data.results || []);
          setXhsResults([]);
          setTotal(data.total || 0);
          setTotalNote(data.total_note || null);
          if (page === 1 && currentProject) {
            const { pubtimeBegin, pubtimeEnd } = getTimeRangeParams();
            const task = await createSearchTask({
              project_id: currentProject.id,
              platform: 'bilibili',
              keyword: keyword.trim(),
              time_range_start: pubtimeBegin ? new Date(pubtimeBegin * 1000).toISOString() : null,
              time_range_end: pubtimeEnd ? new Date(pubtimeEnd * 1000).toISOString() : null,
              status: 'completed',
              result_count: data.total,
              total_views: (data.results || []).reduce((s: number, r: { play: number }) => s + r.play, 0),
              total_likes: (data.results || []).reduce((s: number, r: { likes: number }) => s + r.likes, 0),
              total_comments: (data.results || []).reduce((s: number, r: { review: number }) => s + r.review, 0),
            });
            if (task) {
              setSearchTaskId(task.id);
              await insertSearchResults((data.results || []).map((r: typeof biliResults[0]) => ({
                search_task_id: task.id,
                platform: 'bilibili',
                platform_id: r.bvid,
                url: `https://www.bilibili.com/video/${r.bvid}`,
                title: r.title,
                author: r.author,
                views: r.play,
                likes: r.likes,
                danmaku: r.danmaku,
                comments_count: r.review,
                favorites: r.favorites,
                duration: r.duration,
                description: r.description,
                cover_url: r.pic ? `https:${r.pic}` : null,
                tags: r.tag,
                published_at: new Date(r.pubdate * 1000).toISOString(),
              })));
            }
          }
        }
      } else {
        // XHS search
        const res = await fetch('/api/collect/xhs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: keyword.trim(), page, pageSize: 20, timeRange: 'custom', dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else if (data.needVps) {
          setError(data.error || '小红书搜索需要配置 VPS 采集器');
        } else {
          setXhsResults(data.results || []);
          setBiliResults([]);
          setTotal(data.total || 0);
        }
      }
    } catch {
      setError('搜索失败，请检查网络');
    } finally {
      setSearching(false);
    }
  };

  const handleCollectVideo = async (id: string) => {
    setCollecting(id);
    try {
      if (platform === 'bilibili') {
        const res = await fetch('/api/collect/bilibili', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bvid: id, max_comments: 5000 }),
        });
        const data = await res.json();
        if (data.success && currentProject) {
          setCollectedIds(prev => new Set(prev).add(id));
          const [p, c] = await Promise.all([fetchPosts(currentProject.id), fetchComments(currentProject.id)]);
          setPosts(p);
          setComments(c);
          // Trigger AI analysis after collection
          if (data.imported > 0) {
            triggerAnalysis(currentProject.id, data.post_id, setActiveAnalysisLogId, setAnalysisProgress);
          }
          if (searchTaskId && data.post_id) {
            const searchResults = await fetchSearchResults(searchTaskId);
            const match = searchResults.find(r => r.platform_id === id);
            if (match) {
              const { markSearchResultCollected } = await import('@/lib/supabase-service');
              await markSearchResultCollected(match.id, data.post_id);
            }
          }
        }
      } else {
        // XHS: create a task for the note URL
        const note = xhsResults.find(r => r.note_id === id);
        if (!note) return;
        const res = await fetch('/api/agent/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'xhs', target_url: note.url, max_comments: 5000 }),
        });
        const data = await res.json();
        if (!data.error) {
          setCollectedIds(prev => new Set(prev).add(id));
        }
      }
    } catch { /* ignore */ }
    setCollecting(null);
  };

  const handleBatchCollect = async () => {
    if (platform === 'bilibili') {
      const uncollected = biliResults.filter(r => !collectedIds.has(r.bvid));
      if (uncollected.length === 0) return;
      setBatchCollecting(true);
      try {
        const res = await fetch('/api/collect/bilibili-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bvids: uncollected.map(r => r.bvid), project_id: currentProject?.id }),
        });
        const data = await res.json();
        if (data.results) {
          const newCollected = new Set(collectedIds);
          for (const r of data.results) {
            if (r.imported > 0) newCollected.add(r.bvid);
          }
          setCollectedIds(newCollected);
        }
        if (currentProject) {
          const [p, c] = await Promise.all([fetchPosts(currentProject.id), fetchComments(currentProject.id)]);
          setPosts(p);
          setComments(c);
          // Trigger AI analysis after batch collection
          if (data.total_imported > 0) {
            triggerAnalysis(currentProject.id, undefined, setActiveAnalysisLogId, setAnalysisProgress);
          }
        }
      } catch { /* ignore */ }
      setBatchCollecting(false);
    } else {
      // XHS batch: create tasks for each uncollected note
      const uncollected = xhsResults.filter(r => !collectedIds.has(r.note_id));
      if (uncollected.length === 0) return;
      setBatchCollecting(true);
      const newCollected = new Set(collectedIds);
      for (const note of uncollected) {
        try {
          const res = await fetch('/api/agent/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: 'xhs', target_url: note.url, max_comments: 5000 }),
          });
          const data = await res.json();
          if (!data.error) newCollected.add(note.note_id);
        } catch { /* skip */ }
      }
      setCollectedIds(newCollected);
      setBatchCollecting(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="glass-card p-8 animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          关键词检索
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          输入关键词搜索相关内容，查看数据概览并批量采集评论
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center gap-2 justify-center">
          {([
            { key: 'bilibili' as const, label: 'B站', color: '#00A1D6' },
            { key: 'xhs' as const, label: '小红书', color: '#FE2C55' },
          ]).map(p => (
            <button
              key={p.key}
              onClick={() => { setPlatform(p.key); setBiliResults([]); setXhsResults([]); setTotal(0); setError(null); }}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border',
                platform === p.key
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
              style={platform === p.key ? { backgroundColor: p.color } : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && !searching && keyword.trim() && handleSearch()}
              placeholder={platform === 'bilibili' ? '输入关键词，如：郭永怀、两弹元勋、钱学森' : '输入关键词，如：护肤、旅行、美食'}
              className="w-full bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] text-sm outline-none placeholder:text-[var(--color-text-muted)] font-mono px-4 py-3 rounded-lg border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] transition-colors duration-200"
              disabled={searching}
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={searching || !keyword.trim()}
            className={cn(
              'px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex-shrink-0',
              searching
                ? 'bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue-glow)]'
                : 'bg-[var(--color-accent-blue)] text-white hover:brightness-110 active:scale-[0.98]'
            )}
          >
            {searching ? '搜索中...' : '搜索'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">时间范围：</span>
          <input
            type="month"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            placeholder="开始月份"
            className="px-2 py-1 rounded text-[10px] bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] outline-none"
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">至</span>
          <input
            type="month"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            placeholder="结束月份"
            className="px-2 py-1 rounded text-[10px] bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] outline-none"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-red)] transition-colors"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 max-w-3xl mx-auto p-3 rounded-lg bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)]/20 animate-fade-in">
          <p className="text-xs text-[var(--color-accent-red)]">{error}</p>
        </div>
      )}

      {/* Results Overview — Bilibili */}
      {platform === 'bilibili' && biliResults.length > 0 && (
        <div className="mt-6 max-w-3xl mx-auto space-y-4 animate-fade-in-up">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '相关视频', value: formatNumber(total), color: 'var(--color-accent-blue)' },
              { label: '本页播放', value: formatNumber(biliResults.reduce((s, r) => s + r.play, 0)), color: 'var(--color-accent-green)' },
              { label: '本页评论', value: formatNumber(biliResults.reduce((s, r) => s + r.review, 0)), color: 'var(--color-accent-amber)' },
              { label: '本页点赞', value: formatNumber(biliResults.reduce((s, r) => s + r.likes, 0)), color: 'var(--color-accent-red)' },
            ].map(stat => (
              <div key={stat.label} className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-center">
                <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{stat.label}</div>
              </div>
            ))}
          </div>

          {totalNote && (
            <div className="text-[10px] text-[var(--color-accent-amber)] text-center">
              {totalNote}（已自动过滤不相关结果）
            </div>
          )}

          {/* Batch Collect */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">
              共 {biliResults.filter(r => !collectedIds.has(r.bvid)).length} 个视频待采集
            </span>
            <button
              onClick={handleBatchCollect}
              disabled={batchCollecting || biliResults.every(r => collectedIds.has(r.bvid))}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                batchCollecting
                  ? 'bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)]'
                  : 'bg-[var(--color-accent-blue)] text-white hover:brightness-110 active:scale-[0.98]'
              )}
            >
              {batchCollecting ? '批量采集中...' : '一键采集本页全部评论'}
            </button>
          </div>

          {/* Video List */}
          <div className="space-y-2">
            {biliResults.map((r, i) => (
              <div key={r.bvid} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)] transition-colors">
                <div className="text-xs text-[var(--color-text-muted)] w-6 text-center flex-shrink-0">
                  {(currentPage - 1) * 20 + i + 1}
                </div>
                {r.pic && (
                  <img
                    src={r.pic.startsWith('//') ? `https:${r.pic}` : r.pic}
                    alt=""
                    className="w-20 h-12 object-cover rounded flex-shrink-0 bg-[var(--color-bg-deep)]"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text-primary)] truncate">{r.title}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-3">
                    <span>{r.author}</span>
                    <span>{formatNumber(r.play)}播放</span>
                    <span>{formatNumber(r.review)}评论</span>
                    <span>{r.duration}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleCollectVideo(r.bvid)}
                  disabled={collecting === r.bvid || collectedIds.has(r.bvid)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] flex-shrink-0 transition-all duration-200',
                    collectedIds.has(r.bvid)
                      ? 'bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]'
                      : collecting === r.bvid
                        ? 'bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]'
                        : 'bg-[var(--color-accent-blue)] text-white hover:brightness-110 active:scale-[0.98]'
                  )}
                >
                  {collectedIds.has(r.bvid) ? '已采集' : collecting === r.bvid ? '采集中...' : '采集评论'}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => handleSearch(currentPage - 1)}
                disabled={currentPage <= 1 || searching}
                className="px-3 py-1.5 rounded text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"
              >
                上一页
              </button>
              <span className="text-xs text-[var(--color-text-muted)]">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handleSearch(currentPage + 1)}
                disabled={currentPage >= totalPages || searching}
                className="px-3 py-1.5 rounded text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results Overview — XHS */}
      {platform === 'xhs' && xhsResults.length > 0 && (
        <div className="mt-6 max-w-3xl mx-auto space-y-4 animate-fade-in-up">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '相关笔记', value: formatNumber(total), color: 'var(--color-accent-blue)' },
              { label: '本页浏览', value: formatNumber(xhsResults.reduce((s, r) => s + r.views, 0)), color: 'var(--color-accent-green)' },
              { label: '本页评论', value: formatNumber(xhsResults.reduce((s, r) => s + r.comments_count, 0)), color: 'var(--color-accent-amber)' },
              { label: '本页点赞', value: formatNumber(xhsResults.reduce((s, r) => s + r.likes, 0)), color: 'var(--color-accent-red)' },
            ].map(stat => (
              <div key={stat.label} className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-center">
                <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Batch Collect */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">
              共 {xhsResults.filter(r => !collectedIds.has(r.note_id)).length} 个笔记待采集
            </span>
            <button
              onClick={handleBatchCollect}
              disabled={batchCollecting || xhsResults.every(r => collectedIds.has(r.note_id))}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                batchCollecting
                  ? 'bg-[#FE2C55]/15 text-[#FE2C55]'
                  : 'bg-[#FE2C55] text-white hover:brightness-110 active:scale-[0.98]'
              )}
            >
              {batchCollecting ? '创建任务中...' : '一键采集本页全部评论'}
            </button>
          </div>

          {/* Note List */}
          <div className="space-y-2">
            {xhsResults.map((r, i) => (
              <div key={r.note_id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)] transition-colors">
                <div className="text-xs text-[var(--color-text-muted)] w-6 text-center flex-shrink-0">
                  {(currentPage - 1) * 20 + i + 1}
                </div>
                {r.cover_url && (
                  <img
                    src={r.cover_url}
                    alt=""
                    className="w-16 h-16 object-cover rounded flex-shrink-0 bg-[var(--color-bg-deep)]"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text-primary)] truncate">{r.title || '无标题'}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-3">
                    <span>{r.author}</span>
                    <span>{formatNumber(r.views)}浏览</span>
                    <span>{formatNumber(r.comments_count)}评论</span>
                    <span>{formatNumber(r.likes)}赞</span>
                  </div>
                </div>
                <button
                  onClick={() => handleCollectVideo(r.note_id)}
                  disabled={collecting === r.note_id || collectedIds.has(r.note_id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] flex-shrink-0 transition-all duration-200',
                    collectedIds.has(r.note_id)
                      ? 'bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]'
                      : collecting === r.note_id
                        ? 'bg-[#FE2C55]/10 text-[#FE2C55]'
                        : 'bg-[#FE2C55] text-white hover:brightness-110 active:scale-[0.98]'
                  )}
                >
                  {collectedIds.has(r.note_id) ? '任务已创建' : collecting === r.note_id ? '创建中...' : '采集评论'}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => handleSearch(currentPage - 1)}
                disabled={currentPage <= 1 || searching}
                className="px-3 py-1.5 rounded text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"
              >
                上一页
              </button>
              <span className="text-xs text-[var(--color-text-muted)]">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handleSearch(currentPage + 1)}
                disabled={currentPage >= totalPages || searching}
                className="px-3 py-1.5 rounded text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared: trigger AI analysis ───────────────────────────────
async function triggerAnalysis(
  projectId: string,
  postId: string | undefined,
  setActiveAnalysisLogId: (id: string | null) => void,
  setAnalysisProgress: (p: { processed: number; total: number; status: string }) => void,
): Promise<boolean> {
  try {
    const { runAnalysis } = await import('@/lib/analysis-runner');
    runAnalysis(projectId, postId, {
      onProgress: (processed, total) => {
        setAnalysisProgress({ processed, total, status: 'processing' });
        setActiveAnalysisLogId('running');
      },
      onDone: (processed, _failed, total) => {
        setActiveAnalysisLogId(null);
        setAnalysisProgress({ processed, total, status: 'completed' });
      },
      onError: () => {
        setActiveAnalysisLogId(null);
      },
    });
    return true;
  } catch { /* non-fatal */ }
  return false;
}

// ─── Hero URL Input ────────────────────────────────────────────
function HeroUrlInput({ onCollected }: { onCollected: () => void }) {
  const [url, setUrl] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number; duplicates: number; video_title: string; post_id: string; analysisTriggered: boolean;
  } | null>(null);
  const { setActiveAnalysisLogId, setAnalysisProgress, currentProject } = useAppStore();
  const router = useRouter();

  const detectPlatform = (u: string): 'bilibili' | 'xhs' | null => {
    if (/bilibili\.com|BV\w{10}/i.test(u)) return 'bilibili';
    if (/xiaohongshu\.com|xhs\.link|xhslink\.com/i.test(u)) return 'xhs';
    return null;
  };

  const handleCollect = async () => {
    const platform = detectPlatform(url);
    if (!platform) {
      setError('请输入有效的 B站或小红书链接。示例：\nhttps://www.bilibili.com/video/BV1xx411c7mD');
      return;
    }

    setCollecting(true);
    setError(null);
    setResult(null);

    try {
      if (platform === 'bilibili') {
        const res = await fetch('/api/collect/bilibili', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), max_comments: 5000 }),
        });
        const data = await res.json();
        if (data.error) {
          setError(mapBilibiliError(data.error));
        } else {
          let analysisTriggered = false;
          if (data.imported > 0 && currentProject) {
            analysisTriggered = await triggerAnalysis(currentProject.id, data.post_id, setActiveAnalysisLogId, setAnalysisProgress);
          }
          setResult({
            imported: data.imported,
            duplicates: data.duplicates || 0,
            video_title: data.video_title,
            post_id: data.post_id,
            analysisTriggered,
          });
          setUrl('');
          onCollected();
        }
      } else {
        const res = await fetch('/api/agent/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'xhs', target_url: url.trim(), max_comments: 5000 }),
        });
        const data = await res.json();
        if (data.error) {
          setError(`创建任务失败: ${data.error}`);
        } else {
          setResult({
            imported: 0, duplicates: 0, video_title: '小红书采集任务', post_id: '', analysisTriggered: false,
          });
          setUrl('');
        }
      }
    } catch {
      setError('网络连接失败，请检查网络后重试');
    } finally {
      setCollecting(false);
    }
  };

  const platform = detectPlatform(url);

  return (
    <div className="glass-card p-8 animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          采集评论
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          粘贴 B站视频链接，一键采集所有评论并自动启动 AI 分析
        </p>
      </div>

      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && !collecting && url.trim() && handleCollect()}
            placeholder="粘贴 B站链接，如 https://www.bilibili.com/video/BV1xx411c7mD"
            className="w-full bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] text-sm outline-none placeholder:text-[var(--color-text-muted)] font-mono px-4 py-3 rounded-lg border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] transition-colors duration-200"
            disabled={collecting}
          />
          {platform && (
            <span className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded animate-fade-in',
              platform === 'bilibili' ? 'bg-[#00A1D6]/15 text-[#00A1D6]' : 'bg-[#FE2C55]/15 text-[#FE2C55]'
            )}>
              {platform === 'bilibili' ? 'B站' : '小红书'}
            </span>
          )}
        </div>
        <button
          onClick={handleCollect}
          disabled={collecting || !url.trim()}
          className={cn(
            'px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex-shrink-0',
            collecting
              ? 'bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue-glow)]'
              : 'bg-[var(--color-accent-blue)] text-white hover:brightness-110 active:scale-[0.98]'
          )}
        >
          {collecting ? '采集中...' : '开始采集'}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 max-w-2xl mx-auto p-3 rounded-lg bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)]/20 animate-fade-in">
          <p className="text-xs text-[var(--color-accent-red)] whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Result - persistent */}
      {result && (
        <div className="mt-4 max-w-2xl mx-auto animate-fade-in-up">
          <div className="p-4 rounded-lg bg-[var(--color-accent-green)]/10 border border-[var(--color-accent-green)]/20">
            {result.post_id ? (
              <>
                <div className="text-sm text-[var(--color-accent-green)] mb-1">
                  采集完成：{result.video_title}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mb-3">
                  导入 {result.imported} 条评论
                  {result.duplicates > 0 && <span className="text-[var(--color-accent-amber)]">，跳过 {result.duplicates} 条重复</span>}
                  {result.analysisTriggered
                    ? ' · AI 分析已自动启动'
                    : <span className="text-[var(--color-accent-amber)]"> · 自动分析启动失败，可手动前往分析台</span>
                  }
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/analyze"
                    className="px-3 py-1.5 rounded-lg text-xs bg-[var(--color-accent-blue)] text-white hover:brightness-110 transition-all"
                  >
                    查看分析结果
                  </Link>
                  <button
                    onClick={() => setResult(null)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)] transition-colors"
                  >
                    继续采集
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-[var(--color-accent-green)] mb-1">
                  {result.video_title}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  任务已创建，正在后台执行。完成后数据会自动出现在分析台。
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recent Collections ────────────────────────────────────────
function RecentCollections() {
  const { posts, comments, removePost } = useAppStore();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (posts.length === 0) return null;

  const recentPosts = [...posts].sort((a, b) =>
    new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
  ).slice(0, 5);

  const handleDelete = async (postId: string) => {
    const ok = await deletePostApi(postId);
    if (ok) {
      removePost(postId);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="glass-card p-6 animate-fade-in stagger-2">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">最近采集</h3>
      <div className="space-y-1">
        {recentPosts.map((post) => {
          const postComments = comments.filter(c => c.post_id === post.id);
          const analyzed = postComments.filter(c => c.analysis).length;
          return (
            <div
              key={post.id}
              className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors duration-200 cursor-pointer"
              onClick={() => router.push('/analyze')}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--color-text-primary)] truncate">{post.title || '无标题'}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] mr-2',
                    post.platform === 'bilibili' ? 'bg-[#00A1D6]/10 text-[#00A1D6]' : 'bg-[#FE2C55]/10 text-[#FE2C55]'
                  )}>
                    {post.platform === 'bilibili' ? 'B站' : '小红书'}
                  </span>
                  {postComments.length} 条评论
                  {analyzed > 0 && <span className="text-[var(--color-accent-green)] ml-2">· {analyzed} 已分析</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }}
                  className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
                  title="删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Delete confirmation inline */}
              {confirmDelete === post.id && (
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-2 pr-3 bg-[var(--color-bg-elevated)] rounded-lg" onClick={e => e.stopPropagation()}>
                  <span className="text-[10px] text-[var(--color-accent-red)]">确认删除？</span>
                  <button onClick={() => handleDelete(post.id)} className="px-2 py-1 rounded text-[10px] bg-[var(--color-accent-red)] text-white">确认</button>
                  <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded text-[10px] text-[var(--color-text-secondary)]">取消</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pending Raw Comments (Bookmarklet) ───────────────────────
function PendingRawComments() {
  const { currentProject, posts, setPosts, setComments } = useAppStore();
  const [groups, setGroups] = useState<{ sourceId: string; sourceUrl: string; platform: string; comments: RawComment[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    const raw = await fetchPendingRawComments();
    const grouped = new Map<string, { sourceUrl: string; platform: string; comments: RawComment[] }>();
    for (const r of raw) {
      const key = r.source_id;
      if (!grouped.has(key)) {
        grouped.set(key, { sourceUrl: r.source_url || '', platform: r.platform, comments: [] });
      }
      grouped.get(key)!.comments.push(r);
    }
    setGroups([...grouped.entries()].map(([sourceId, v]) => ({ sourceId, ...v })));
    setLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleLink = async (sourceId: string, sourceUrl: string) => {
    if (!currentProject) return;
    setLinking(sourceId);
    try {
      // Read posts from store at call time to avoid stale closure
      const currentPosts = useAppStore.getState().posts;
      let postId = currentPosts.find(p => p.url === sourceUrl)?.id;
      if (!postId && sourceUrl) {
        const platform = sourceUrl.includes('bilibili') ? 'bilibili' as const : 'xhs' as const;
        const newPost = await createPost({
          project_id: currentProject.id,
          platform,
          url: sourceUrl,
          title: `${platform === 'bilibili' ? 'B站' : '小红书'}内容`,
          collected_by: 'bookmarklet',
        });
        if (newPost) {
          postId = newPost.id;
          setPosts([...currentPosts, newPost]);
        }
      }
      if (postId) {
        const count = await linkRawComments(sourceId, postId, currentProject.id);
        if (count > 0) {
          const [p, c] = await Promise.all([fetchPosts(currentProject.id), fetchComments(currentProject.id)]);
          setPosts(p);
          setComments(c);
        }
      }
      loadPending();
    } finally {
      setLinking(null);
    }
  };

  const handleIgnore = async (sourceId: string) => {
    await ignoreRawComments(sourceId);
    loadPending();
  };

  if (loading || groups.length === 0) return null;

  const platformLabel = (p: string) => p === 'bilibili' ? 'B站' : '小红书';
  const platformColor = (p: string) => p === 'bilibili' ? 'bg-[#00A1D6]/10 text-[#00A1D6]' : 'bg-[#FE2C55]/10 text-[#FE2C55]';

  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">待导入的浏览器采集数据</h3>
        <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)]">
          {groups.reduce((s, g) => s + g.comments.length, 0)} 条待处理
        </span>
      </div>
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.sourceId} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px]', platformColor(g.platform))}>
                  {platformLabel(g.platform)}
                </span>
                <span className="text-xs text-[var(--color-text-primary)] truncate">{g.sourceUrl || g.sourceId}</span>
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {g.comments.length} 条评论
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <button
                onClick={() => handleLink(g.sourceId, g.sourceUrl)}
                disabled={linking === g.sourceId || !currentProject}
                className="px-3 py-1.5 rounded-lg text-[10px] bg-[var(--color-accent-blue)] text-white hover:brightness-110 transition-all disabled:opacity-40 active:scale-[0.98]"
              >
                {linking === g.sourceId ? '导入中...' : '导入'}
              </button>
              <button
                onClick={() => handleIgnore(g.sourceId)}
                className="px-3 py-1.5 rounded-lg text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-deep)] transition-colors"
              >
                忽略
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Task Queue Status ─────────────────────────────────────────
function TaskQueueStatus() {
  const [tasks, setTasks] = useState<{ id: string; platform: string; target_url: string; status: string; created_at: string; error_message?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/tasks?status=pending,running,claimed');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  if (loading || tasks.length === 0) return null;

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: '等待中', color: 'text-[var(--color-accent-amber)]' },
    claimed: { text: '已领取', color: 'text-[var(--color-accent-blue)]' },
    running: { text: '运行中', color: 'text-[var(--color-accent-green)]' },
  };

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">采集任务队列</h3>
      <div className="space-y-2">
        {tasks.map(t => {
          const s = statusLabel[t.status] || { text: t.status, color: 'text-[var(--color-text-muted)]' };
          return (
            <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px]',
                    t.platform === 'bilibili' ? 'bg-[#00A1D6]/10 text-[#00A1D6]' : 'bg-[#FE2C55]/10 text-[#FE2C55]'
                  )}>
                    {t.platform === 'bilibili' ? 'B站' : '小红书'}
                  </span>
                  <span className="text-xs text-[var(--color-text-primary)] truncate">{t.target_url}</span>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {new Date(t.created_at).toLocaleString('zh-CN')}
                  {t.error_message && <span className="text-[var(--color-accent-red)] ml-2">{t.error_message}</span>}
                </div>
              </div>
              <span className={cn('text-[10px] flex-shrink-0 ml-3', s.color)}>{s.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Advanced Section (CSV Import) ─────────────────────────────
function AdvancedImport() {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card p-6 animate-fade-in stagger-3">
      <button onClick={() => setOpen(p => !p)} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-200">
        <svg className={cn('w-3.5 h-3.5 transition-transform duration-200', open && 'rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        高级采集（CSV 导入）
      </button>
      {open && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--color-text-secondary)]">
            如果你已有 CSV 格式的评论数据，可以通过以下方式导入：
          </p>
          <div className="p-3 rounded-lg border border-dashed border-[var(--color-border-active)] bg-[var(--color-bg-deep)]">
            <p className="text-xs text-[var(--color-text-muted)] text-center">
              CSV 文件上传功能正在开发中，敬请期待
            </p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            也可前往 <Link href="/settings" className="text-[var(--color-accent-blue)] hover:underline">设置页面</Link> 配置本地爬虫环境进行批量采集。
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Error mapping ─────────────────────────────────────────────
function mapBilibiliError(err: string): string {
  if (err.includes('-352') || err.includes('risk')) return 'B站请求被风控限制，请稍后重试或更换网络';
  if (err.includes('-400') || err.includes('param')) return '链接格式不正确，请确认是完整的 B站视频链接';
  if (err.includes('-404') || err.includes('not found')) return '视频不存在或已被删除，请检查链接';
  if (err.includes('timeout')) return '请求超时，B站服务器响应较慢，请稍后重试';
  return `采集失败: ${err}`;
}

// ─── Main Page ──────────────────────────────────────────────────
export default function CollectPage() {
  const { setProjects, setCurrentProject, setPosts, setComments } = useAppStore();
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<CollectMode>('url');

  const loadData = useCallback(async () => {
    try {
      const pj = await fetchProjects();
      if (pj.length > 0) {
        setProjects(pj);
        setCurrentProject(pj[0]);
        const [p, c] = await Promise.all([fetchPosts(pj[0].id), fetchComments(pj[0].id)]);
        setPosts(p);
        setComments(c);
      } else {
        const newProject = await createProject({
          name: '我的研究项目',
          keyword: '郭永怀',
          description: '',
          status: 'active',
        });
        if (newProject) {
          setProjects([newProject]);
          setCurrentProject(newProject);
        }
      }
      setLoadError(null);
    } catch {
      setLoadError('加载项目数据失败');
    }
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  useEffect(() => {
    loadData().finally(() => setPageLoading(false));
  }, [loadData]);

  if (pageLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="glass-card p-8">
          <div className="h-8 w-48 skeleton-shimmer rounded mx-auto mb-4" />
          <div className="h-12 skeleton-shimmer rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Load error */}
      {loadError && (
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-accent-red)]">{loadError}</p>
            <button onClick={() => { setPageLoading(true); loadData().finally(() => setPageLoading(false)); }} className="text-xs text-[var(--color-accent-blue)] hover:underline">
              重试
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      <ModeSwitch mode={mode} onChange={setMode} />

      {/* Hero: URL Input or Keyword Search */}
      {mode === 'url' ? (
        <HeroUrlInput onCollected={loadData} />
      ) : (
        <KeywordSearch />
      )}

      {/* Recent Collections */}
      <RecentCollections />

      {/* Pending Raw Comments (Bookmarklet) */}
      <PendingRawComments />

      {/* Task Queue Status (XHS async tasks) */}
      <TaskQueueStatus />

      {/* Advanced Import */}
      <AdvancedImport />
    </div>
  );
}
