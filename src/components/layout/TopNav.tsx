'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { exportToCSV, prepareExportData } from '@/lib/export';
import { replayIntro } from '@/components/ui/IntroAnimation';
import { NAV_ITEMS } from '@/lib/navigation';

export function TopNav() {
  const { currentProject, posts, comments, presentationMode, togglePresentationMode } = useAppStore();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleExport = () => {
    if (!currentProject) return;
    const exportData = prepareExportData(comments, posts);
    exportToCSV(exportData, `${currentProject.name}_export`);
  };

  return (
    <>
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 h-14',
        'bg-[#0B1221] border-b border-[#1E293B]',
        'flex items-center justify-between px-6',
        'backdrop-blur-xl bg-opacity-90'
      )}
    >
      <div className="flex items-center gap-4">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(prev => !prev)}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111827] transition-colors"
          aria-label="打开导航菜单"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileNavOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0EA5E9] to-[#6366F1] flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#F8FAFC] leading-none">
              OutEye 4.0
            </h1>
            <p className="text-[10px] text-[#64748B] leading-none mt-0.5">
              Pulse 记忆工坊
            </p>
          </div>
        </div>

        {/* Current Project */}
        {currentProject && (
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-[#1E293B]">
            <span className="text-xs text-[#64748B]">项目:</span>
            <span className="text-xs text-[#94A3B8] font-medium">
              {currentProject.name}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-[#10B981]/10 text-[#10B981]">
              {currentProject.status === 'active' ? '活跃' : '归档'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Replay Intro */}
        <button
          onClick={replayIntro}
          aria-label="重播入场动画"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs',
            'bg-[#111827] text-[#94A3B8] border border-[#1E293B]',
            'hover:border-[#334155] transition-all duration-200'
          )}
          title="重播入场动画"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        {/* Presentation Mode Toggle */}
        <button
          onClick={togglePresentationMode}
          aria-label={presentationMode ? '退出演示模式' : '进入演示模式'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs',
            'transition-all duration-200',
            presentationMode
              ? 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/30'
              : 'bg-[#111827] text-[#94A3B8] border border-[#1E293B] hover:border-[#334155]'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
          </svg>
          {presentationMode ? '演示模式' : '学术模式'}
        </button>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={!currentProject}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs',
            'bg-[#111827] text-[#94A3B8] border border-[#1E293B]',
            'hover:border-[#334155] transition-all duration-200'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          导出
        </button>
      </div>
    </header>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="fixed top-14 left-0 bottom-0 z-50 w-64 bg-[#0B1221] border-r border-[#1E293B] md:hidden overflow-y-auto">
            <div className="py-4 px-3 space-y-1">
              {NAV_ITEMS.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20'
                        : 'text-[#94A3B8] hover:bg-[#111827] hover:text-[#F8FAFC] border border-transparent'
                    )}
                  >
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-[10px] text-[#64748B]">{item.desc}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
