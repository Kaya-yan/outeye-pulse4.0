'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';
import { deleteProject as deleteProjectApi, updateProject as updateProjectApi, createProject as createProjectApi } from '@/lib/supabase-service';
import type { Project } from '@/types';

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

interface ToastState {
  type: 'success' | 'warning' | 'error';
  message: string;
}

const EnvDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <div className="flex items-center gap-2">
    <span className={cn('w-2 h-2 rounded-full', ok ? 'bg-[var(--color-accent-green)]' : 'bg-[var(--color-accent-red)]')} />
    <span className={cn('text-sm', ok ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}>{label}</span>
  </div>
);

export default function SettingsPage() {
  const {
    projects, currentProject, setCurrentProject, setProjects,
    setPosts, setComments, clearAll, removeProject: removeProjectStore,
    updateProject: updateProjectStore, addProject,
    terminologyMode, setTerminologyMode,
  } = useAppStore();
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

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
    setToast({ type: 'success', message: `已加载 ${demo.posts.length} 篇内容和 ${demo.comments.length} 条评论，前往"分析台"查看效果` });
  }, [setProjects, setCurrentProject, setPosts, setComments]);

  const handleClearAll = useCallback(() => {
    setConfirmDialog({
      title: '确认清空所有数据',
      message: '这将删除所有帖子、评论和项目数据，操作无法撤销。确定要继续吗？',
      onConfirm: () => {
        clearAll();
        setToast({ type: 'warning', message: '所有数据已清空' });
      },
    });
  }, [clearAll]);

  const handleDeleteProject = useCallback((project: Project) => {
    setConfirmDialog({
      title: `删除项目"${project.name}"`,
      message: '这将删除该项目下的所有帖子和评论数据，操作无法撤销。确定要继续吗？',
      onConfirm: async () => {
        const ok = await deleteProjectApi(project.id);
        if (ok) {
          removeProjectStore(project.id);
          setToast({ type: 'success', message: `项目"${project.name}"已删除` });
        } else {
          setToast({ type: 'error', message: '删除失败，请重试' });
        }
      },
    });
  }, [removeProjectStore]);

  const handleCreateProject = useCallback(async (name: string, keyword: string) => {
    const project = await createProjectApi({
      name,
      keyword,
      description: '',
      status: 'active',
    });
    if (project) {
      addProject(project);
      setShowCreateProject(false);
      setToast({ type: 'success', message: `项目"${name}"已创建` });
    } else {
      setToast({ type: 'error', message: '创建失败，请重试' });
    }
  }, [addProject]);

  const handleUpdateProject = useCallback(async (id: string, name: string, keyword: string) => {
    const ok = await updateProjectApi(id, { name, keyword });
    if (ok) {
      const updated = projects.find(p => p.id === id);
      if (updated) {
        updateProjectStore({ ...updated, name, keyword });
      }
      setEditingProject(null);
      setToast({ type: 'success', message: '项目已更新' });
    } else {
      setToast({ type: 'error', message: '更新失败，请重试' });
    }
  }, [projects, updateProjectStore]);

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
            <EnvDot ok={envStatus.mediaCrawlerStatus === 'ready'} label={`MediaCrawler (${envStatus.mediaCrawlerStatus === 'ready' ? '就绪' : envStatus.mediaCrawlerStatus === 'missing' ? '未安装' : envStatus.mediaCrawlerStatus})`} />
            <EnvDot ok={envStatus.dataDir} label="数据目录" />
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">点击"重新检测"检查本地环境</p>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mt-3 leading-relaxed">
          本地环境仅在使用爬虫脚本批量采集时需要。<span className="text-[var(--color-accent-blue)]">B站一键采集不需要本地环境</span>，可直接使用。
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
          <button onClick={handleClearAll} className="px-4 py-2 bg-[var(--color-accent-red)]/10 text-[var(--color-accent-red)] rounded-lg text-xs hover:bg-[var(--color-accent-red)]/15 transition-colors duration-200 active:scale-[0.98]">
            清空所有数据
          </button>
        </div>
      </div>

      {/* Projects */}
      <div className="glass-card p-6 animate-fade-in stagger-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">项目管理</h2>
          <button
            onClick={() => setShowCreateProject(true)}
            className="text-xs text-[var(--color-accent-blue)] hover:text-[var(--color-accent-blue-glow)] transition-colors duration-200"
          >
            + 新建项目
          </button>
        </div>

        {/* Create project form */}
        {showCreateProject && (
          <ProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowCreateProject(false)}
          />
        )}

        {/* Edit project form */}
        {editingProject && (
          <ProjectForm
            initialName={editingProject.name}
            initialKeyword={editingProject.keyword}
            submitLabel="保存修改"
            onSubmit={(name, keyword) => handleUpdateProject(editingProject.id, name, keyword)}
            onCancel={() => setEditingProject(null)}
          />
        )}

        {projects.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">暂无项目</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              点击上方"新建项目"或加载演示数据开始使用
            </p>
          </div>
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">关键词: {p.keyword}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px]',
                    p.status === 'active' ? 'bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]' : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
                  )}>
                    {p.status === 'active' ? '活跃' : '归档'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}
                    className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                    title="编辑项目"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProject(p); }}
                    className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
                    title="删除项目"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="glass-card max-w-sm w-full p-6 animate-fade-in-scale">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">{confirmDialog.title}</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mb-6 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-active)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                className="px-4 py-2 rounded-lg text-xs bg-[var(--color-accent-red)] text-white hover:brightness-110 transition-all active:scale-[0.98]"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm shadow-lg animate-fade-in-up max-w-xs',
          toast.type === 'success' ? 'bg-[var(--color-accent-green)] text-white' :
          toast.type === 'warning' ? 'bg-[var(--color-accent-amber)] text-white' :
          'bg-[var(--color-accent-red)] text-white'
        )}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Project Form ──────────────────────────────────────────
function ProjectForm({
  initialName = '',
  initialKeyword = '',
  submitLabel = '创建项目',
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialKeyword?: string;
  submitLabel?: string;
  onSubmit: (name: string, keyword: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [keyword, setKeyword] = useState(initialKeyword);

  return (
    <div className="mb-4 p-4 rounded-lg border border-[var(--color-border-active)] bg-[var(--color-bg-elevated)] animate-fade-in">
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">项目名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="如：郭永怀数字记忆研究"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] text-sm border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">监测关键词</label>
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="如：郭永怀"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] text-sm border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-blue)] outline-none transition-colors"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
            取消
          </button>
          <button
            onClick={() => name.trim() && keyword.trim() && onSubmit(name.trim(), keyword.trim())}
            disabled={!name.trim() || !keyword.trim()}
            className="px-4 py-1.5 rounded-lg text-xs bg-[var(--color-accent-blue)] text-white hover:brightness-110 transition-all disabled:opacity-40 active:scale-[0.98]"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
