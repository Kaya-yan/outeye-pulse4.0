'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { createProject, deletePost as deletePostApi, fetchPendingRawComments, linkRawComments, ignoreRawComments, createPost, fetchPosts, fetchComments, fetchProjects } from '@/lib/supabase-service';
import type { RawComment } from '@/lib/supabase-service';

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
          if (data.imported > 0) {
            analysisTriggered = await triggerAnalysis(data.post_id);
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

  const triggerAnalysis = async (postId?: string): Promise<boolean> => {
    if (!currentProject) return false;
    try {
      const body: Record<string, unknown> = { projectId: currentProject.id };
      if (postId) body.postId = postId;
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.log_id) {
        setActiveAnalysisLogId(data.log_id);
        setAnalysisProgress({ processed: 0, total: data.total, status: 'processing' });
        return true;
      }
    } catch { /* non-fatal */ }
    return false;
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

      {/* Hero: URL Input */}
      <HeroUrlInput onCollected={loadData} />

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
