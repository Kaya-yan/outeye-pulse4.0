'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { fetchProjects, fetchPosts, fetchComments, createProject, createPost } from '@/lib/supabase-service';

// ─── Toast ─────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, setToast };
}

// ─── Hero URL Input ────────────────────────────────────────────
function HeroUrlInput({ onCollected }: { onCollected: () => void }) {
  const [url, setUrl] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; video_title: string; post_id: string } | null>(null);
  const { setActiveAnalysisLogId, setAnalysisProgress, currentProject, setPosts, setComments } = useAppStore();

  const detectPlatform = (u: string): 'bilibili' | 'xhs' | null => {
    if (/bilibili\.com|BV\w{10}/i.test(u)) return 'bilibili';
    if (/xiaohongshu\.com|xhs\.link|xhslink\.com/i.test(u)) return 'xhs';
    return null;
  };

  const handleCollect = async () => {
    const platform = detectPlatform(url);
    if (!platform) {
      setStatus('请输入有效的 B站或小红书链接');
      return;
    }

    setCollecting(true);
    setStatus('正在连接...');
    setResult(null);

    try {
      if (platform === 'bilibili') {
        // One-click Bilibili collection
        const res = await fetch('/api/collect/bilibili', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), max_comments: 5000 }),
        });
        const data = await res.json();
        if (data.error) {
          setStatus(`采集失败: ${data.error}`);
        } else {
          setResult({ imported: data.imported, video_title: data.video_title, post_id: data.post_id });
          setStatus(null);
          setUrl('');
          // Reload data
          onCollected();
          // Auto-trigger analysis
          if (data.imported > 0) {
            triggerAnalysis(data.post_id);
          }
        }
      } else {
        // Xiaohongshu — create agent task
        const res = await fetch('/api/agent/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'xhs', target_url: url.trim(), max_comments: 5000 }),
        });
        const data = await res.json();
        if (data.error) {
          setStatus(`创建任务失败: ${data.error}`);
        } else {
          setStatus('小红书采集任务已创建，正在后台执行...');
          setUrl('');
        }
      }
    } catch {
      setStatus('网络错误，请重试');
    } finally {
      setCollecting(false);
    }
  };

  const triggerAnalysis = async (postId?: string) => {
    if (!currentProject) return;
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
      }
    } catch {
      // Analysis trigger failure is non-fatal
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
          粘贴 B站视频链接或小红书笔记链接，一键采集所有评论并自动启动 AI 分析
        </p>
      </div>

      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={e => { setUrl(e.target.value); setStatus(null); setResult(null); }}
            onKeyDown={e => e.key === 'Enter' && !collecting && url.trim() && handleCollect()}
            placeholder="粘贴 B站或小红书链接，如 https://www.bilibili.com/video/BV1xx411c7mD"
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

      {/* Status messages */}
      {status && (
        <div className="mt-4 text-center text-xs text-[var(--color-accent-amber)] animate-fade-in">
          {status}
        </div>
      )}
      {result && (
        <div className="mt-4 text-center animate-fade-in-up">
          <div className="text-sm text-[var(--color-accent-green)] mb-2">
            采集完成：{result.video_title} — {result.imported} 条评论已入库
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            AI 分析已自动启动，完成后可查看可视化图表
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recent Collections ────────────────────────────────────────
function RecentCollections() {
  const { posts, comments } = useAppStore();

  if (posts.length === 0) return null;

  const recentPosts = [...posts].sort((a, b) =>
    new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
  ).slice(0, 5);

  return (
    <div className="glass-card p-6 animate-fade-in stagger-2">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">最近采集</h3>
      <div className="space-y-1">
        {recentPosts.map((post, index) => {
          const postComments = comments.filter(c => c.post_id === post.id);
          const analyzed = postComments.filter(c => c.analysis).length;
          return (
            <div
              key={post.id}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors duration-200"
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
        高级采集（CSV 导入、爬虫配置）
      </button>
      {open && (
        <div className="mt-4 text-xs text-[var(--color-text-secondary)] space-y-2 animate-fade-in">
          <p>如需使用 MediaCrawler 或 Playwright 脚本批量采集，请前往 <span className="text-[var(--color-accent-blue)]">设置</span> 页面配置本地环境。</p>
          <p>采集完成后，CSV 文件会自动出现在此处供导入。</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function CollectPage() {
  const { setProjects, setCurrentProject, setPosts, setComments, projects } = useAppStore();
  const { toast, setToast } = useToast();
  const [pageLoading, setPageLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { fetchProjects, fetchPosts, fetchComments } = await import('@/lib/supabase-service');
      const pj = await fetchProjects();
      if (pj.length > 0) {
        setProjects(pj);
        setCurrentProject(pj[0]);
        const [p, c] = await Promise.all([fetchPosts(pj[0].id), fetchComments(pj[0].id)]);
        setPosts(p);
        setComments(c);
      } else {
        // Create default project
        const newProject = await createProject({
          name: '郭永怀数字记忆研究',
          keyword: '郭永怀',
          description: '基于郭永怀主题的社交媒体评论量化分析项目',
          status: 'active',
        });
        if (newProject) {
          setProjects([newProject]);
          setCurrentProject(newProject);
        }
      }
    } catch {
      setToast({ type: 'error', message: '加载项目数据失败' });
    }
  }, [setProjects, setCurrentProject, setPosts, setComments, setToast]);

  useEffect(() => {
    loadData().then(() => setPageLoading(false));
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
      {/* Hero: URL Input */}
      <HeroUrlInput onCollected={loadData} />

      {/* Recent Collections */}
      <RecentCollections />

      {/* Advanced Import */}
      <AdvancedImport />

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm shadow-lg animate-fade-in-up',
          toast.type === 'success' ? 'bg-[var(--color-accent-green)] text-white' :
          toast.type === 'error' ? 'bg-[var(--color-accent-red)] text-white' :
          'bg-[var(--color-accent-blue)] text-white'
        )}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
