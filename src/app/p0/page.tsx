'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { generateDemoProject, computeDemoStats } from '@/lib/demo-data';
import { fetchProjects, fetchPosts, fetchComments, createProject, createPost, batchInsertPosts, batchInsertComments, fetchPendingRawComments, linkRawComments, ignoreRawComments, insertRawComments, fetchLocalLogs } from '@/lib/supabase-service';
import type { RawComment } from '@/lib/supabase-service';
import { fetchVideoInfo, fetchVideoReplies, extractBvid } from '@/lib/bilibili-api';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import { BOOKMARKLET_URL, getConsoleScript } from '@/lib/bookmarklet-code';
import { generateConfigSnippet, generateCommand, type CrawlerConfig } from '@/lib/media-crawler';
import type { LocalLog } from '@/types';
import Papa from 'papaparse';

// ─── Env status types ───────────────────────────────────────────
interface EnvStatus {
  python: boolean;
  pythonVersion: string | null;
  playwright: boolean;
  playwrightVersion: string | null;
  mediaCrawlerStatus: 'not_found' | 'downloaded' | 'ready';
  mediaCrawlerConfig: boolean;
  dataDir: boolean;
  toolsDir: string;
  allReady: boolean;
}

interface CsvFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  platform: 'xhs' | 'bilibili';
  source: 'mediacrawler' | 'playwright';
}

interface ImportPreview {
  stats: { total: number; kept: number; removed: number; duplicates: number };
  sampleRows: Record<string, unknown>[];
  removedSample: { row: Record<string, string>; reason: string }[];
}

function PlaywrightFaq() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(prev => !prev)} className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#94A3B8] transition-colors">
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        常见问题
      </button>
      {open && (
        <div className="mt-3 space-y-3 ml-5">
          {[
            { q: 'Cookie 过期了怎么办？', a: 'B站：删除 scripts/playwright-scraper/cookies.json，重新运行命令，浏览器打开后登录即可自动更新。小红书：同样删除 cookies.json 后运行 --login 重新扫码。' },
            { q: '提示 HTTP 412 或限流', a: 'B站反爬机制触发。脚本会自动重试（最多3次，指数退避）。如果仍然失败，已采集的数据会自动保存到 _partial.csv 文件，不会丢失。等待 30 分钟后重试。' },
            { q: '采集过程中按了 Ctrl+C，数据会丢失吗？', a: '不会。脚本捕获 Ctrl+C 信号，会自动将已采集的数据保存到 output/ 目录下的 _partial.csv 文件。' },
            { q: '小红书采集失败，提示选择器失效', a: '小红书脚本使用 API 拦截方式（不依赖 DOM 选择器），但小红书 API 可能更新。如果 API 拦截失败，脚本会自动降级到 DOM 提取。如果两种方式都失败，请检查 Cookie 是否有效（运行 --login 重新登录）。' },
            { q: '采集的 CSV 如何导入系统？', a: '回到上方"数据文件"区域，点击"扫描文件"，找到 output/ 目录下的 CSV，点击"预览"后导入。' },
          ].map((faq, i) => (
            <div key={i} className="text-xs">
              <p className="text-[#FCD34D] mb-1">Q: {faq.q}</p>
              <p className="text-[#94A3B8]">A: {faq.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function P0Page() {
  const { currentProject, setCurrentProject, setPosts, setComments, posts, comments, projects, addProject, setProjects } = useAppStore();

  // ─── Toast ────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const [recentCopy, setRecentCopy] = useState<string | null>(null);
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setRecentCopy(id);
      setToast({ type: 'success', message: '已复制到剪贴板' });
      setTimeout(() => setRecentCopy(null), 2000);
    }).catch(() => setToast({ type: 'error', message: '复制失败' }));
  };

  // ─── Section collapse state ───────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    env: true,
    config: true,
    modeB: true,
    files: true,
    import: true,
    guide: false,
    // deprecated
    oldProject: false,
    oldCollect: false,
    oldBookmarklet: false,
    oldPending: false,
    oldCsv: false,
    oldExport: false,
  });
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── Env detection ────────────────────────────────────────────
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoading, setEnvLoading] = useState(false);

  const checkEnv = useCallback(async () => {
    setEnvLoading(true);
    try {
      const res = await fetch('/api/env-check');
      const data = await res.json();
      setEnvStatus(data);
    } catch {
      setEnvStatus(null);
    } finally {
      setEnvLoading(false);
    }
  }, []);

  // ─── Crawler config ───────────────────────────────────────────
  const [crawlerConfig, setCrawlerConfig] = useState<CrawlerConfig>({
    platform: 'xhs',
    keyword: '',
    count: 100,
    collectComments: true,
    collectSubComments: true,
    collectDanmaku: false,
  });

  // ─── File scan ────────────────────────────────────────────────
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const scanFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setCsvFiles(data.files || []);
    } catch {
      setCsvFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  // ─── Import state ─────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<CsvFile | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPostId, setImportPostId] = useState('');

  // ─── Local logs ───────────────────────────────────────────────
  const [localLogs, setLocalLogs] = useState<LocalLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ─── Deprecated section states ────────────────────────────────
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectKeyword, setNewProjectKeyword] = useState('');
  const [bilibiliUrl, setBilibiliUrl] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState('');
  const [pendingRaw, setPendingRaw] = useState<RawComment[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ sourceId: string; platform: string } | null>(null);
  const [linkPostId, setLinkPostId] = useState('');
  const [pastedJson, setPastedJson] = useState('');
  const [cleaningStats, setCleaningStats] = useState<{ total: number; valid: number; empty: number; ad: number; irrelevant: number } | null>(null);

  // ─── Mount ────────────────────────────────────────────────────
  useEffect(() => {
    checkEnv();
    scanFiles();
    loadLocalLogs();
    loadFromSupabase();
  }, []);

  const loadLocalLogs = async () => {
    setLogsLoading(true);
    const data = await fetchLocalLogs(20);
    setLocalLogs(data);
    setLogsLoading(false);
  };

  const loadFromSupabase = async () => {
    const projects = await fetchProjects();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validProjects = projects.filter(p => uuidRegex.test(p.id));
    if (validProjects.length > 0) {
      setProjects(validProjects);
      const project = validProjects[0];
      setCurrentProject(project);
      const postsData = await fetchPosts(project.id);
      setPosts(postsData);
      const commentsData = await fetchComments(project.id);
      setComments(commentsData);
      calculateCleaningStats(commentsData);
      if (!pendingRaw.length) loadPendingRawComments();
    } else if (!demoLoaded) {
      loadDemoProject();
    }
  };

  const loadDemoProject = async () => {
    const realProject = await createProject({
      name: '郭永怀数字记忆监测 Demo',
      keyword: '郭永怀',
      description: '基于郭永怀主题的数字记忆传播监测演示项目。',
    });
    if (!realProject) { setToast({ type: 'error', message: '创建演示项目失败' }); return; }
    const { posts, comments } = generateDemoProject(realProject.id);
    addProject(realProject);
    setCurrentProject(realProject);
    setPosts(posts);
    setComments(comments);
    setDemoLoaded(true);
    calculateCleaningStats(comments);
  };

  const calculateCleaningStats = (commentsData: typeof comments) => {
    const empty = commentsData.filter(c => c.is_empty).length;
    const ad = commentsData.filter(c => c.is_ad).length;
    const irrelevant = commentsData.filter(c => c.is_irrelevant).length;
    setCleaningStats({ total: commentsData.length, valid: commentsData.length - empty - ad - irrelevant, empty, ad, irrelevant });
  };

  const loadPendingRawComments = async () => {
    setPendingLoading(true);
    setPendingRaw(await fetchPendingRawComments());
    setPendingLoading(false);
  };

  // ─── Import handlers ──────────────────────────────────────────
  const handlePreview = async (file: CsvFile) => {
    setSelectedFile(file);
    setImportPreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.path, projectId: currentProject?.id, preview: true }),
      });
      const data = await res.json();
      if (data.error) { setToast({ type: 'error', message: data.error }); return; }
      setImportPreview(data);
    } catch {
      setToast({ type: 'error', message: '预览失败' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !importPostId || !currentProject) return;
    setImporting(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: selectedFile.path, postId: importPostId, projectId: currentProject.id }),
      });
      const data = await res.json();
      if (data.error) { setToast({ type: 'error', message: data.error }); return; }
      setToast({ type: 'success', message: `导入完成：${data.imported} 条评论已入库` });
      setImportPreview(null);
      setSelectedFile(null);
      setImportPostId('');
      await scanFiles();
      await loadLocalLogs();
      await loadFromSupabase();
    } catch {
      setToast({ type: 'error', message: '导入失败' });
    } finally {
      setImporting(false);
    }
  };

  // ─── Deprecated handlers (kept for backward compat) ───────────
  const createNewProject = async () => {
    if (!newProjectName || !newProjectKeyword) return;
    const project = await createProject({ name: newProjectName, keyword: newProjectKeyword, description: `基于"${newProjectKeyword}"主题的数字记忆传播监测项目` });
    if (project) { addProject(project); setCurrentProject(project); setNewProjectName(''); setNewProjectKeyword(''); }
  };

  const collectBilibiliData = async () => {
    if (!bilibiliUrl || !currentProject) return;
    const bvid = extractBvid(bilibiliUrl);
    if (!bvid) { setToast({ type: 'error', message: '请输入有效的B站视频链接或BV号' }); return; }
    setCollecting(true);
    setCollectProgress('正在获取视频信息...');
    try {
      const video = await fetchVideoInfo(bvid);
      if (!video) { setToast({ type: 'error', message: '获取视频信息失败' }); setCollecting(false); return; }
      const post = await createPost({ project_id: currentProject.id, platform: 'bilibili', title: video.title, content: video.desc, author_id_hash: `bili_${video.owner.mid}`, author_name_mask: `${video.owner.name.slice(0, 2)}***`, likes: video.stat.like, comments_count: video.stat.reply, shares: video.stat.share, is_aigc: false, url: `https://www.bilibili.com/video/${bvid}`, publish_time: new Date(video.pubdate * 1000).toISOString(), collected_by: 'api' });
      if (!post) { setToast({ type: 'error', message: '创建帖子记录失败' }); setCollecting(false); return; }
      const hotResult = await fetchVideoReplies(bvid, '0', '3');
      const allRepliesMap = new Map<number, any>();
      for (const reply of hotResult.replies) allRepliesMap.set(reply.rpid, reply);
      const allReplies = Array.from(allRepliesMap.values());
      const commentsToInsert = allReplies.map(reply => ({ post_id: post.id, project_id: currentProject.id, text: reply.content?.message || '', likes: reply.like, sampling_tier: reply.like >= 100 ? 'high' as const : reply.like >= 10 ? 'mid' as const : 'low' as const, is_sampled: reply.like >= 100 || Math.random() < 0.5 }));
      const inserted = await batchInsertComments(commentsToInsert);
      setCollectProgress(`完成！已入库${inserted}条评论`);
      await loadFromSupabase();
    } catch { setCollectProgress('采集失败，请重试'); } finally { setCollecting(false); }
  };

  const pendingGroups = pendingRaw.reduce((acc, r) => {
    const key = r.source_id;
    if (!acc[key]) acc[key] = { sourceId: key, platform: r.platform, sourceUrl: r.source_url, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {} as Record<string, { sourceId: string; platform: string; sourceUrl?: string; items: RawComment[] }>);

  const handleLinkRawComments = async () => {
    if (!linkTarget || !linkPostId || !currentProject) return;
    const count = await linkRawComments(linkTarget.sourceId, linkPostId, currentProject.id);
    setToast({ type: 'success', message: `已关联 ${count} 条评论` });
    setShowLinkDialog(false); setLinkTarget(null); setLinkPostId('');
    await loadPendingRawComments(); await loadFromSupabase();
  };

  const handleIgnoreRawComments = async (sourceId: string) => {
    await ignoreRawComments(sourceId);
    setToast({ type: 'success', message: '已忽略' });
    await loadPendingRawComments();
  };

  const handlePasteJson = async () => {
    if (!pastedJson.trim()) return;
    try {
      const rows = JSON.parse(pastedJson);
      if (!Array.isArray(rows)) { setToast({ type: 'error', message: 'JSON 需为数组' }); return; }
      const count = await insertRawComments(rows);
      setToast({ type: 'success', message: `已导入 ${count} 条` });
      setPastedJson('');
      await loadPendingRawComments();
    } catch { setToast({ type: 'error', message: 'JSON 解析失败' }); }
  };

  const handleCSVUpload = async (file: File) => {
    if (!currentProject) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const raw = results.data as Record<string, string>[];
        const data = raw.filter(row => Object.values(row).some(v => v && v.trim()));
        if (data.length === 0) { setToast({ type: 'error', message: 'CSV 为空' }); return; }
        const isPosts = data[0]?.title !== undefined && data[0]?.platform !== undefined;
        if (isPosts) {
          const postsToInsert = data.map(row => ({ project_id: currentProject.id, platform: (row.platform === 'bilibili' ? 'bilibili' : 'xhs') as 'xhs' | 'bilibili', title: row.title || '', content: row.content || '', likes: parseInt(row.likes) || 0, comments_count: parseInt(row.comments_count) || 0, shares: parseInt(row.shares) || 0, is_aigc: row.is_aigc === 'true', url: row.url || '', collected_by: 'csv' }));
          const inserted = await batchInsertPosts(postsToInsert);
          setToast({ type: 'success', message: `已导入 ${inserted} 条笔记` });
        } else {
          const commentsToInsert = data.map(row => ({ post_id: row.post_id || '', project_id: currentProject.id, text: row.text || '', likes: parseInt(row.likes) || 0, sampling_tier: (parseInt(row.likes) || 0) >= 100 ? 'high' as const : (parseInt(row.likes) || 0) >= 10 ? 'mid' as const : 'low' as const, is_sampled: true }));
          const inserted = await batchInsertComments(commentsToInsert);
          setToast({ type: 'success', message: `已导入 ${inserted} 条评论` });
        }
        await loadFromSupabase();
      },
    });
  };

  // ─── Config preview ───────────────────────────────────────────
  const configSnippet = crawlerConfig.keyword ? generateConfigSnippet(crawlerConfig) : '';
  const commandSnippet = crawlerConfig.keyword ? generateCommand(crawlerConfig) : '';

  // ─── Render ───────────────────────────────────────────────────
  const stats = currentProject ? computeDemoStats(posts, comments) : null;

  const SectionCard = ({ id, title, subtitle, children, defaultOpen = true }: { id: string; title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) => {
    const isOpen = expandedSections[id] ?? defaultOpen;
    return (
      <div className="glass-card p-6 animate-fade-in">
        <button onClick={() => toggleSection(id)} className="flex items-center justify-between w-full text-left mb-0">
          <div>
            <h2 className="text-lg font-semibold text-[#F8FAFC]">{title}</h2>
            {subtitle && <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>}
          </div>
          <svg className={`w-5 h-5 text-[#64748B] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isOpen && <div className="mt-4">{children}</div>}
      </div>
    );
  };

  const EnvDot = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
      <span className={`text-sm ${ok ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>{label}</span>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>本地数据采集与导入中心</h1>
          <p className="text-sm text-[#94A3B8] mt-1">MediaCrawler 集成 · CSV 导入 · 学术日志</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          NEW: Environment Detection Dashboard
          ═══════════════════════════════════════════════════════════ */}
      <SectionCard id="env" title="环境检测仪表盘" subtitle="检查本地工具链是否就绪">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Python */}
          <div className="bg-[#030712] rounded-lg p-4 border border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#64748B] font-medium">Python</span>
              {envStatus && (
                <span className={`px-2 py-0.5 rounded text-xs ${envStatus.python ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                  {envStatus.python ? envStatus.pythonVersion || '已安装' : '未安装'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8]">MediaCrawler 运行时</p>
          </div>
          {/* MediaCrawler */}
          <div className="bg-[#030712] rounded-lg p-4 border border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#64748B] font-medium">MediaCrawler</span>
              {envStatus && (
                <span className={`px-2 py-0.5 rounded text-xs ${envStatus.mediaCrawlerStatus === 'ready' ? 'bg-[#10B981]/10 text-[#10B981]' : envStatus.mediaCrawlerStatus === 'downloaded' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                  {envStatus.mediaCrawlerStatus === 'ready' ? '就绪' : envStatus.mediaCrawlerStatus === 'downloaded' ? '未配置环境' : '未找到'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] font-mono truncate">{envStatus?.toolsDir || 'tools/MediaCrawler'}</p>
          </div>
          {/* Playwright */}
          <div className="bg-[#030712] rounded-lg p-4 border border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#64748B] font-medium">Playwright</span>
              {envStatus && (
                <span className={`px-2 py-0.5 rounded text-xs ${envStatus.playwright ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
                  {envStatus.playwright ? envStatus.playwrightVersion || '已安装' : '可选'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8]">B站 API 拦截采集</p>
          </div>
        </div>

        {envStatus && !envStatus.allReady && (
          <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-[#FCD34D] font-medium mb-1">环境不完整</p>
            <div className="space-y-1">
              {!envStatus.python && <EnvDot ok={false} label="请安装 Python 3.8+（Windows 可用 py 命令）" />}
              {envStatus.mediaCrawlerStatus === 'not_found' && <EnvDot ok={false} label="请将 MediaCrawler 克隆到 tools/MediaCrawler/" />}
              {envStatus.mediaCrawlerStatus === 'downloaded' && <EnvDot ok={false} label="MediaCrawler 已下载，请运行 python -m venv venv 配置环境" />}
              {!envStatus.mediaCrawlerConfig && <EnvDot ok={false} label="config/ 目录缺失，请检查 MediaCrawler 安装" />}
            </div>
          </div>
        )}

        <button onClick={checkEnv} disabled={envLoading} className="px-4 py-2 rounded-lg bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20 text-sm hover:bg-[#3B82F6]/20 transition-colors disabled:opacity-50">
          {envLoading ? '检测中...' : '重新检测'}
        </button>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════
          Collection Config Form
          ═══════════════════════════════════════════════════════════ */}
      <SectionCard id="config" title="采集配置" subtitle="配置 MediaCrawler 采集参数">
        {/* Platform toggle */}
        <div className="flex gap-2 mb-4">
          {(['xhs', 'bilibili'] as const).map(p => (
            <button key={p} onClick={() => setCrawlerConfig(prev => ({ ...prev, platform: p }))}
              className={cn('px-4 py-2 rounded-lg text-sm border transition-all', crawlerConfig.platform === p ? 'bg-[#3B82F6]/20 text-[#60A5FA] border-[#3B82F6]/40' : 'bg-[#030712] text-[#64748B] border-[#1E293B] hover:border-[#334155]')}>
              {p === 'xhs' ? '小红书' : 'B站'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-[#64748B] mb-1 block">搜索关键词</label>
            <input type="text" value={crawlerConfig.keyword} onChange={e => setCrawlerConfig(prev => ({ ...prev, keyword: e.target.value }))} placeholder="如：郭永怀" className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none" />
          </div>
          <div>
            <label className="text-xs text-[#64748B] mb-1 block">采集数量上限</label>
            <input type="number" value={crawlerConfig.count} onChange={e => setCrawlerConfig(prev => ({ ...prev, count: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none" />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[#94A3B8]">
            <input type="checkbox" checked={crawlerConfig.collectComments} onChange={e => setCrawlerConfig(prev => ({ ...prev, collectComments: e.target.checked }))} className="rounded border-[#475569]" />
            采集评论
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[#94A3B8]">
            <input type="checkbox" checked={crawlerConfig.collectSubComments} onChange={e => setCrawlerConfig(prev => ({ ...prev, collectSubComments: e.target.checked }))} className="rounded border-[#475569]" />
            采集子评论
          </label>
          {crawlerConfig.platform === 'bilibili' && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[#94A3B8]">
              <input type="checkbox" checked={crawlerConfig.collectDanmaku} onChange={e => setCrawlerConfig(prev => ({ ...prev, collectDanmaku: e.target.checked }))} className="rounded border-[#475569]" />
              采集弹幕
            </label>
          )}
        </div>

        {/* Config preview */}
        {crawlerConfig.keyword && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[#64748B] font-medium">config 文件修改指引</span>
                <button onClick={() => copyText(configSnippet, 'config')} className="text-xs text-[#60A5FA] hover:text-[#93C5FD]">{recentCopy === 'config' ? '已复制' : '复制'}</button>
              </div>
              <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono overflow-x-auto border border-[#1E293B] max-h-60 overflow-y-auto whitespace-pre-wrap">{configSnippet}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[#64748B] font-medium">运行命令</span>
                <button onClick={() => copyText(commandSnippet, 'cmd')} className="text-xs text-[#60A5FA] hover:text-[#93C5FD]">{recentCopy === 'cmd' ? '已复制' : '复制'}</button>
              </div>
              <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono overflow-x-auto border border-[#1E293B]">{commandSnippet}</pre>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════
          Mode B: Step-by-step Guide
          ═══════════════════════════════════════════════════════════ */}
      <SectionCard id="modeB" title="采集步骤指引" subtitle="Mode B：手动执行 MediaCrawler">
        <div className="space-y-4">
          {[
            { step: '1', title: '修改配置文件', desc: `将上方"config 文件修改指引"中的内容复制到 ${crawlerConfig.platform === 'xhs' ? 'config/xhs_config.py' : 'config/bilibili_config.py'} 对应位置` },
            { step: '2', title: '运行采集脚本', desc: '在终端中执行上方"运行命令"中的命令' },
            { step: '3', title: '等待采集完成', desc: '终端显示 "crawl finished" 即完成，数据保存在 data/ 目录' },
            { step: '4', title: '导入数据', desc: '回到本页面，在下方"数据文件"区域选择文件并导入' },
          ].map(item => (
            <div key={item.step} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#3B82F6]/20 text-[#60A5FA] text-xs flex items-center justify-center font-bold">{item.step}</span>
              <div>
                <p className="text-sm text-[#F8FAFC] font-medium">{item.title}</p>
                <p className="text-xs text-[#94A3B8]">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════
          Data Files
          ═══════════════════════════════════════════════════════════ */}
      <SectionCard id="files" title="数据文件" subtitle="扫描 MediaCrawler 输出的 CSV 文件">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={scanFiles} disabled={filesLoading} className="px-4 py-2 rounded-lg bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20 text-sm hover:bg-[#3B82F6]/20 transition-colors disabled:opacity-50">
            {filesLoading ? '扫描中...' : '扫描文件'}
          </button>
          <span className="text-xs text-[#64748B]">{csvFiles.length} 个 CSV 文件</span>
        </div>

        {csvFiles.length === 0 ? (
          <div className="text-center py-6 text-[#64748B] text-sm">
            {filesLoading ? '扫描中...' : '未找到 CSV 文件。请先运行 MediaCrawler 采集。'}
          </div>
        ) : (
          <div className="space-y-2">
            {csvFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-[#030712] rounded-lg p-3 border border-[#1E293B] hover:border-[#334155] transition-colors">
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', file.platform === 'xhs' ? 'bg-[#FE2C55]/10 text-[#FE2C55]' : 'bg-[#00A1D6]/10 text-[#00A1D6]')}>
                    {file.platform === 'xhs' ? '小红书' : 'B站'}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded text-xs', file.source === 'playwright' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-[#3B82F6]/10 text-[#3B82F6]')}>
                    {file.source === 'playwright' ? 'Playwright' : 'MediaCrawler'}
                  </span>
                  <span className="text-sm text-[#F8FAFC] font-mono">{file.name}</span>
                  <span className="text-xs text-[#64748B]">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button onClick={() => handlePreview(file)} className="px-3 py-1 rounded-lg bg-[#10B981]/10 text-[#6EE7B7] border border-[#10B981]/20 text-xs hover:bg-[#10B981]/20 transition-colors">
                  预览
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════
          CSV Import Preview
          ═══════════════════════════════════════════════════════════ */}
      {selectedFile && (
        <SectionCard id="import" title={`导入预览：${selectedFile.name}`} subtitle={selectedFile.platform === 'xhs' ? '小红书' : 'B站'}>
          {previewLoading ? (
            <p className="text-sm text-[#94A3B8]">加载预览...</p>
          ) : importPreview ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: '原始行数', value: importPreview.stats.total, color: 'text-[#F8FAFC]' },
                  { label: '保留', value: importPreview.stats.kept, color: 'text-[#10B981]' },
                  { label: '过滤', value: importPreview.stats.removed, color: 'text-[#F59E0B]' },
                  { label: '去重', value: importPreview.stats.duplicates, color: 'text-[#EF4444]' },
                ].map(s => (
                  <div key={s.label} className="bg-[#030712] rounded-lg p-3 border border-[#1E293B] text-center">
                    <div className="text-xs text-[#64748B] mb-1">{s.label}</div>
                    <div className={`text-lg font-bold ${s.color}`} style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Sample rows */}
              <div className="mb-4">
                <div className="text-xs text-[#64748B] font-medium mb-2">预览（前10条）</div>
                <div className="bg-[#0B1221] rounded-lg border border-[#1E293B] overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#64748B] border-b border-[#1E293B]">
                        <th className="p-2 text-left">文本</th>
                        <th className="p-2 text-right">点赞</th>
                        <th className="p-2 text-center">采样层</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.sampleRows.map((row, i) => (
                        <tr key={i} className="border-b border-[#1E293B]/50">
                          <td className="p-2 text-[#94A3B8] max-w-xs truncate">{String(row.text).slice(0, 80)}</td>
                          <td className="p-2 text-right text-[#F8FAFC]">{String(row.likes)}</td>
                          <td className="p-2 text-center">
                            <span className={cn('px-1.5 py-0.5 rounded text-xs', row.sampling_tier === 'high' ? 'bg-[#EF4444]/10 text-[#EF4444]' : row.sampling_tier === 'mid' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-[#64748B]/10 text-[#64748B]')}>
                              {String(row.sampling_tier)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Post selector */}
              <div className="mb-4">
                <label className="text-xs text-[#64748B] mb-1 block">选择目标帖子</label>
                <select value={importPostId} onChange={e => setImportPostId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm focus:border-[#3B82F6] outline-none">
                  <option value="">选择帖子...</option>
                  {posts.map(p => (
                    <option key={p.id} value={p.id}>[{p.platform}] {p.title?.slice(0, 50)}</option>
                  ))}
                </select>
                {posts.length === 0 && <p className="text-xs text-[#F59E0B] mt-1">当前项目无帖子，请先创建</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={handleImport} disabled={!importPostId || importing} className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-sm hover:bg-[#059669] transition-colors disabled:opacity-50">
                  {importing ? '导入中...' : `确认导入 ${importPreview.stats.kept} 条`}
                </button>
                <button onClick={() => { setSelectedFile(null); setImportPreview(null); }} className="px-4 py-2 rounded-lg bg-[#111827] text-[#94A3B8] border border-[#1E293B] text-sm">
                  取消
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#64748B]">点击"预览"加载文件内容</p>
          )}
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Collection History (local_logs)
          ═══════════════════════════════════════════════════════════ */}
      <SectionCard id="guide" title="采集历史日志" subtitle="local_logs 记录">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={loadLocalLogs} disabled={logsLoading} className="px-4 py-2 rounded-lg bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20 text-sm hover:bg-[#3B82F6]/20 transition-colors disabled:opacity-50">
            {logsLoading ? '刷新中...' : '刷新'}
          </button>
        </div>
        {localLogs.length === 0 ? (
          <p className="text-sm text-[#64748B]">暂无采集记录</p>
        ) : (
          <div className="space-y-2">
            {localLogs.map(log => (
              <div key={log.id} className="bg-[#030712] rounded-lg p-3 border border-[#1E293B] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', log.platform === 'xhs' ? 'bg-[#FE2C55]/10 text-[#FE2C55]' : 'bg-[#00A1D6]/10 text-[#00A1D6]')}>
                    {log.platform === 'xhs' ? '小红书' : 'B站'}
                  </span>
                  <span className="text-xs text-[#94A3B8]">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                  <span className="text-xs text-[#64748B]">{log.raw_count} → {log.import_count} 条</span>
                  <span className="text-xs text-[#64748B]">去重 {log.duplicate_count}</span>
                </div>
                <span className={cn('px-2 py-0.5 rounded text-xs', log.status === 'completed' ? 'bg-[#10B981]/10 text-[#10B981]' : log.status === 'failed' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#F59E0B]/10 text-[#F59E0B]')}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════
          Playwright Emergency Collection
          ═══════════════════════════════════════════════════════════ */}
      <div className="glass-card p-6 animate-fade-in border border-[#F59E0B]/20">
        <h2 className="text-lg font-semibold text-[#FCD34D] mb-1">应急采集脚本（Playwright）</h2>
        <p className="text-xs text-[#64748B] mb-4">适用于 MediaCrawler 无法覆盖的场景：B站深度采集、小红书指定笔记</p>

        {/* B站 Playwright */}
        <div className="bg-[#030712] rounded-lg p-4 border border-[#1E293B] mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded text-xs bg-[#00A1D6]/10 text-[#00A1D6] font-medium">B站</span>
            <span className="text-sm text-[#F8FAFC] font-medium">scrape-bilibili.mjs</span>
            <span className="text-xs text-[#64748B]">API 拦截 + Cookie 持久化 + 二级评论 + 自动重试</span>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3B82F6]/20 text-[#60A5FA] text-xs flex items-center justify-center font-bold">1</span>
              <div>
                <p className="text-sm text-[#F8FAFC]">安装依赖（仅首次）</p>
                <div className="space-y-2 mt-1">
                  {[
                    { label: '进入项目目录', cmd: 'cd C:\\Users\\ht\\Documents\\outeye4.0\\outeye-pulse' },
                    { label: '安装 npm 依赖', cmd: 'cd scripts\\playwright-scraper && npm install' },
                    { label: '安装 Chromium 浏览器', cmd: 'npx playwright install chromium' },
                  ].map((s, i) => (
                    <div key={i} className="relative">
                      <p className="text-xs text-[#64748B] mb-0.5">{s.label}</p>
                      <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono border border-[#1E293B]">{s.cmd}</pre>
                      <button onClick={() => copyText(s.cmd, `pw-bili-step1-${i}`)} className="absolute top-5 right-2 px-2 py-1 rounded bg-[#1E293B] text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">{recentCopy === `pw-bili-step1-${i}` ? '已复制' : '复制'}</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3B82F6]/20 text-[#60A5FA] text-xs flex items-center justify-center font-bold">2</span>
              <div>
                <p className="text-sm text-[#F8FAFC]">运行采集</p>
                <p className="text-xs text-[#94A3B8] mb-1">在 <code className="text-[#64748B]">scripts/playwright-scraper/</code> 目录下执行，替换 BV 号</p>
                <div className="relative mt-1">
                  <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono border border-[#1E293B] whitespace-pre-wrap">{`node scrape-bilibili.mjs --bvid=BV替换为真实BV号`}</pre>
                  <button onClick={() => copyText('node scrape-bilibili.mjs --bvid=BV替换为真实BV号', 'pw-bili-run')} className="absolute top-2 right-2 px-2 py-1 rounded bg-[#1E293B] text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">{recentCopy === 'pw-bili-run' ? '已复制' : '复制'}</button>
                </div>
                <p className="text-xs text-[#94A3B8] mt-2">首次运行会打开浏览器窗口，请登录 B站。登录完成后回到终端按回车。Cookie 自动保存，后续免登录。</p>
                <p className="text-xs text-[#94A3B8] mt-1">采集过程中按 <kbd className="px-1 py-0.5 rounded bg-[#1E293B] text-[#64748B]">Ctrl+C</kbd> 可安全中断，已采集数据自动保存到 <code className="text-[#64748B]">_partial.csv</code>。</p>
                <p className="text-xs text-[#64748B] mt-1">CSV 产出后，回到本页面上方"数据文件"区域扫描并导入。</p>
              </div>
            </div>
          </div>
        </div>

        {/* 小红书 Playwright */}
        <div className="bg-[#030712] rounded-lg p-4 border border-[#1E293B] mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded text-xs bg-[#FE2C55]/10 text-[#FE2C55] font-medium">小红书</span>
            <span className="text-sm text-[#F8FAFC] font-medium">scrape-xhs.mjs</span>
            <span className="text-xs text-[#64748B]">API 拦截 + Cookie 持久化 + 自动重试</span>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FE2C55]/20 text-[#F87171] text-xs flex items-center justify-center font-bold">1</span>
              <div>
                <p className="text-sm text-[#F8FAFC]">首次登录（保存 Cookie）</p>
                <p className="text-xs text-[#94A3B8] mb-1">在 <code className="text-[#64748B]">scripts/playwright-scraper/</code> 目录下执行</p>
                <div className="relative mt-1">
                  <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono border border-[#1E293B]">node scrape-xhs.mjs --login</pre>
                  <button onClick={() => copyText('node scrape-xhs.mjs --login', 'pw-xhs-login')} className="absolute top-2 right-2 px-2 py-1 rounded bg-[#1E293B] text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">{recentCopy === 'pw-xhs-login' ? '已复制' : '复制'}</button>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">浏览器打开小红书首页，手动扫码登录。登录成功后 Cookie 自动保存。</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FE2C55]/20 text-[#F87171] text-xs flex items-center justify-center font-bold">2</span>
              <div>
                <p className="text-sm text-[#F8FAFC]">运行采集</p>
                <p className="text-xs text-[#94A3B8] mb-1">替换笔记链接</p>
                <div className="relative mt-1">
                  <pre className="bg-[#0B1221] rounded-lg p-3 text-xs text-[#E2E8F0] font-mono border border-[#1E293B] whitespace-pre-wrap">{`node scrape-xhs.mjs --url=https://www.xiaohongshu.com/explore/替换笔记ID`}</pre>
                  <button onClick={() => copyText('node scrape-xhs.mjs --url=https://www.xiaohongshu.com/explore/替换笔记ID', 'pw-xhs-run')} className="absolute top-2 right-2 px-2 py-1 rounded bg-[#1E293B] text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">{recentCopy === 'pw-xhs-run' ? '已复制' : '复制'}</button>
                </div>
                <p className="text-xs text-[#94A3B8] mt-2">首次运行会打开浏览器窗口，请扫码登录小红书。登录完成后回到终端按回车。Cookie 自动保存，后续免登录。</p>
                <p className="text-xs text-[#94A3B8] mt-1">采集过程中按 <kbd className="px-1 py-0.5 rounded bg-[#1E293B] text-[#64748B]">Ctrl+C</kbd> 可安全中断，已采集数据自动保存到 <code className="text-[#64748B]">_partial.csv</code>。</p>
                <p className="text-xs text-[#64748B] mt-1">CSV 产出后，回到本页面上方"数据文件"区域扫描并导入。</p>
              </div>
            </div>
          </div>
        </div>

        {/* Shared FAQ */}
        <PlaywrightFaq />

        <div className="mt-3 p-3 rounded-lg bg-[#030712] border border-[#1E293B]">
          <p className="text-xs text-[#94A3B8]">
            Cookie 保存在 <code className="text-[#64748B]">scripts/playwright-scraper/cookies.json</code>，B站和小红书共用。CSV 输出到 <code className="text-[#64748B]">scripts/playwright-scraper/output/</code>。中断采集时已采集数据自动保存到同名 <code className="text-[#64748B]">_partial.csv</code> 文件。
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DEPRECATED SECTIONS (collapsed)
          ═══════════════════════════════════════════════════════════ */}
      <div className="border border-[#1E293B]/50 rounded-lg p-4 opacity-60 hover:opacity-80 transition-opacity">
        <p className="text-xs text-[#64748B] mb-3 font-medium">以下为旧模块（已折叠），功能已迁移至上方新模块</p>

        {/* Old: Create Project */}
        <SectionCard id="oldProject" title="[旧] 创建新项目" defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="项目名称" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm" />
            <input type="text" placeholder="监测关键词" value={newProjectKeyword} onChange={e => setNewProjectKeyword(e.target.value)} className="px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm" />
            <button onClick={createNewProject} disabled={!newProjectName || !newProjectKeyword} className="px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm disabled:opacity-50">创建项目</button>
          </div>
        </SectionCard>

        {/* Old: B站 API collection */}
        <SectionCard id="oldCollect" title="[旧] B站快速采集（API）" defaultOpen={false}>
          <div className="flex gap-3">
            <input type="text" placeholder="B站视频链接或BV号" value={bilibiliUrl} onChange={e => setBilibiliUrl(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm" />
            <button onClick={collectBilibiliData} disabled={collecting || !bilibiliUrl || !currentProject} className="px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm disabled:opacity-50">{collecting ? '采集中...' : '采集热评'}</button>
          </div>
          {collectProgress && <p className="mt-2 text-xs text-[#94A3B8]">{collectProgress}</p>}
        </SectionCard>

        {/* Old: Bookmarklet */}
        <SectionCard id="oldBookmarklet" title="[旧] 小红书 Bookmarklet" defaultOpen={false}>
          <div className="flex items-center gap-3">
            <a href={BOOKMARKLET_URL} className="px-4 py-2 rounded-lg bg-[#F59E0B]/10 text-[#FCD34D] border border-[#F59E0B]/20 text-sm cursor-grab" draggable="true" onClick={e => e.preventDefault()}>OutEye 采集助手</a>
            <button onClick={() => copyText(BOOKMARKLET_URL, 'bm-old')} className="text-xs text-[#60A5FA]">{recentCopy === 'bm-old' ? '已复制' : '复制代码'}</button>
          </div>
        </SectionCard>

        {/* Old: Pending Raw Comments */}
        <SectionCard id="oldPending" title="[旧] 待认领采集数据" defaultOpen={false}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={loadPendingRawComments} disabled={pendingLoading} className="text-xs text-[#60A5FA]">{pendingLoading ? '刷新中...' : '刷新'}</button>
          </div>
          <textarea value={pastedJson} onChange={e => setPastedJson(e.target.value)} placeholder="粘贴 JSON" rows={3} className="w-full px-3 py-2 rounded-lg bg-[#111827] text-[#F8FAFC] border border-[#1E293B] text-xs font-mono resize-none mb-2" />
          <button onClick={handlePasteJson} disabled={!pastedJson.trim()} className="px-3 py-1.5 rounded-lg bg-[#3B82F6]/10 text-[#60A5FA] text-xs disabled:opacity-50 mb-4">导入</button>
          {Object.keys(pendingGroups).length === 0 ? (
            <p className="text-sm text-[#64748B]">{pendingLoading ? '加载中...' : '暂无待认领数据'}</p>
          ) : (
            <div className="space-y-2">
              {Object.values(pendingGroups).map(group => (
                <div key={group.sourceId} className="bg-[#030712] rounded-lg p-3 border border-[#1E293B] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-2 py-0.5 rounded text-xs', group.platform === 'bilibili' ? 'bg-[#00A1D6]/10 text-[#00A1D6]' : 'bg-[#FE2C55]/10 text-[#FE2C55]')}>{group.platform === 'bilibili' ? 'B站' : '小红书'}</span>
                    <span className="text-xs font-mono text-[#F8FAFC]">{group.sourceId}</span>
                    <span className="text-xs text-[#64748B]">{group.items.length} 条</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setLinkTarget({ sourceId: group.sourceId, platform: group.platform }); setLinkPostId(''); setShowLinkDialog(true); }} className="px-3 py-1 rounded-lg bg-[#10B981]/10 text-[#6EE7B7] text-xs">认领</button>
                    <button onClick={() => handleIgnoreRawComments(group.sourceId)} className="px-3 py-1 rounded-lg bg-[#EF4444]/10 text-[#FCA5A5] text-xs">忽略</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Old: CSV Upload */}
        <SectionCard id="oldCsv" title="[旧] CSV 数据导入" defaultOpen={false}>
          <div className="border-2 border-dashed border-[#1E293B] rounded-lg p-6 text-center" onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file?.name.endsWith('.csv')) handleCSVUpload(file); }}>
            <p className="text-sm text-[#94A3B8] mb-2">拖拽 CSV 或点击上传</p>
            <input type="file" accept=".csv" className="hidden" id="csv-upload-old" onChange={e => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file); }} />
            <label htmlFor="csv-upload-old" className="inline-block px-4 py-2 rounded-lg bg-[#111827] text-[#94A3B8] border border-[#1E293B] text-sm cursor-pointer">选择文件</label>
          </div>
        </SectionCard>

        {/* Old: Export */}
        <SectionCard id="oldExport" title="[旧] 项目导出" defaultOpen={false}>
          <button onClick={() => { const data = { project: currentProject, posts, comments, exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${currentProject?.name || 'project'}.outeye`; a.click(); }} className="px-4 py-2 rounded-lg bg-[#111827] text-[#94A3B8] border border-[#1E293B] text-sm">导出项目文件</button>
        </SectionCard>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Current Project Status (quick ref)
          ═══════════════════════════════════════════════════════════ */}
      {currentProject && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          <div className="glass-card p-4">
            <div className="text-xs text-[#64748B] mb-1">项目</div>
            <div className="text-sm font-medium text-[#F8FAFC] truncate">{currentProject.name}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-[#64748B] mb-1">评论数</div>
            <div className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{formatNumber(stats.totalComments)}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-[#64748B] mb-1">AIGC 占比</div>
            <div className="text-2xl font-bold text-[#3B82F6]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{formatPercent(stats.aigcRatio)}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-[#64748B] mb-1">高危风险</div>
            <div className="text-2xl font-bold text-[#EF4444]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{stats.highRiskCount}</div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Modals
          ═══════════════════════════════════════════════════════════ */}
      {showLinkDialog && linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setShowLinkDialog(false)}>
          <div className="glass-card max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2">认领采集数据</h3>
            <p className="text-sm text-[#94A3B8] mb-4">将 <span className="text-[#F8FAFC] font-mono">{linkTarget.sourceId}</span> 的 {pendingGroups[linkTarget.sourceId]?.items.length || 0} 条评论关联到帖子。</p>
            <select value={linkPostId} onChange={e => setLinkPostId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#030712] text-[#F8FAFC] border border-[#1E293B] text-sm mb-4">
              <option value="">选择帖子...</option>
              {posts.map(p => <option key={p.id} value={p.id}>[{p.platform}] {p.title?.slice(0, 40)}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowLinkDialog(false)} className="px-4 py-2 rounded-lg bg-[#111827] text-[#94A3B8] border border-[#1E293B] text-sm">取消</button>
              <button onClick={handleLinkRawComments} disabled={!linkPostId} className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-sm disabled:opacity-50">确认关联</button>
            </div>
          </div>
        </div>
      )}

      {showTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" onClick={() => setShowTour(false)}>
          <div className="glass-card max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#94A3B8]">功能导览已移至新界面</p>
            <button onClick={() => setShowTour(false)} className="mt-4 px-4 py-2 rounded-lg bg-[#111827] text-[#94A3B8] border border-[#1E293B] text-sm">关闭</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in', toast.type === 'success' ? 'bg-[#10B981]/90 text-white' : 'bg-[#EF4444]/90 text-white')}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
