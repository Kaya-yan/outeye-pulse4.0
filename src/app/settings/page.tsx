'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';

interface EnvStatus {
  python: boolean;
  pythonVersion: string | null;
  playwright: boolean;
  playwrightVersion: string | null;
  mediaCrawlerStatus: string;
  mediaCrawlerConfig: boolean;
  dataDir: boolean;
  allReady: boolean;
}

const EnvDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <div className="flex items-center gap-2">
    <span className={cn('w-2 h-2 rounded-full', ok ? 'bg-[var(--color-accent-green)]' : 'bg-[var(--color-accent-red)]')} />
    <span className={cn('text-sm', ok ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}>{label}</span>
  </div>
);

export default function SettingsPage() {
  const { projects, currentProject, setCurrentProject, setProjects, setPosts, setComments, terminologyMode, setTerminologyMode } = useAppStore();
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

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

  useEffect(() => { checkEnv(); }, [checkEnv]);

  const loadDemo = useCallback(async () => {
    const { generateDemoProject } = await import('@/lib/demo-data');
    const demo = generateDemoProject();
    if (demo.project) {
      setProjects([demo.project as any]);
      setCurrentProject(demo.project as any);
    }
    setPosts(demo.posts as any);
    setComments(demo.comments as any);
    setToast('演示数据已加载');
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  const clearDemo = useCallback(() => {
    setPosts([]);
    setComments([]);
    setToast('数据已清空');
  }, [setPosts, setComments]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>设置</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">环境配置、数据管理</p>
      </div>

      {/* Environment */}
      <div className="glass-card p-6 animate-fade-in stagger-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">本地环境</h2>
          <button onClick={checkEnv} disabled={envLoading} className="text-xs text-[var(--color-accent-blue)] hover:text-[var(--color-accent-blue-glow)] transition-colors duration-200">
            {envLoading ? '检测中...' : '重新检测'}
          </button>
        </div>
        {envStatus ? (
          <div className="space-y-2">
            <EnvDot ok={envStatus.python} label={`Python ${envStatus.pythonVersion || '未安装'}`} />
            <EnvDot ok={envStatus.playwright} label={`Playwright ${envStatus.playwrightVersion || '未安装'}`} />
            <EnvDot ok={envStatus.mediaCrawlerStatus === 'ready'} label={`MediaCrawler (${envStatus.mediaCrawlerStatus})`} />
            <EnvDot ok={envStatus.dataDir} label="数据目录" />
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">点击"重新检测"检查本地环境</p>
        )}
        <p className="text-[10px] text-[var(--color-text-muted)] mt-3">
          本地环境仅在使用 CSV 导入和爬虫采集时需要。B站一键采集不需要本地环境。
        </p>
      </div>

      {/* Terminology */}
      <div className="glass-card p-6 animate-fade-in stagger-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">术语显示</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          选择图表和标签中维度名称的显示方式。学术模式显示理论框架术语，通俗模式显示日常用语。
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setTerminologyMode('academic')}
            className={cn(
              'px-4 py-2 rounded-lg text-xs transition-all duration-200',
              terminologyMode === 'academic'
                ? 'bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] border border-[var(--color-accent-blue)]/20'
                : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]'
            )}
          >
            学术模式
          </button>
          <button
            onClick={() => setTerminologyMode('plain')}
            className={cn(
              'px-4 py-2 rounded-lg text-xs transition-all duration-200',
              terminologyMode === 'plain'
                ? 'bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] border border-[var(--color-accent-amber)]/20'
                : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]'
            )}
          >
            通俗模式
          </button>
        </div>
        <div className="mt-3 text-xs text-[var(--color-text-muted)]">
          当前：{terminologyMode === 'academic' ? '认知加工、情感效价、认同层级...' : '思考深度、情感正负、认同程度...'}
        </div>
      </div>

      {/* Demo Data */}
      <div className="glass-card p-6 animate-fade-in stagger-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">演示数据</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          加载模拟数据来体验平台功能。演示数据包含 B站和小红书的模拟评论，已预设分析结果。
        </p>
        <div className="flex gap-3">
          <button onClick={loadDemo} className="px-4 py-2 bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] rounded-lg text-xs hover:bg-[var(--color-accent-amber)]/15 transition-colors duration-200 active:scale-[0.98]">
            加载演示数据
          </button>
          <button onClick={clearDemo} className="px-4 py-2 bg-[var(--color-accent-red)]/10 text-[var(--color-accent-red)] rounded-lg text-xs hover:bg-[var(--color-accent-red)]/15 transition-colors duration-200 active:scale-[0.98]">
            清空数据
          </button>
        </div>
      </div>

      {/* Projects */}
      <div className="glass-card p-6 animate-fade-in stagger-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">项目管理</h2>
        {projects.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">暂无项目</p>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200',
                  currentProject?.id === p.id
                    ? 'border-[var(--color-accent-blue)]/20 bg-[var(--color-accent-blue)]/5'
                    : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)]'
                )}
                onClick={() => setCurrentProject(p)}
              >
                <div>
                  <div className="text-sm text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">关键词: {p.keyword}</div>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px]',
                  p.status === 'active' ? 'bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]' : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
                )}>
                  {p.status === 'active' ? '活跃' : '归档'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm bg-[var(--color-accent-green)] text-white shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </div>
  );
}
