'use client';

import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { IntroAnimation } from '@/components/ui/IntroAnimation';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, presentationMode } = useAppStore();

  return (
    <div className={cn('min-h-screen', presentationMode && 'brightness-105')}>
      <IntroAnimation />
      <TopNav />
      {!presentationMode && <Sidebar />}
      <main
        className={cn(
          'pt-14 min-h-screen transition-all duration-300',
          presentationMode ? 'pl-6' : sidebarCollapsed ? 'md:pl-16' : 'md:pl-52'
        )}
      >
        <div className={cn('p-6', presentationMode && 'max-w-[1400px] mx-auto')}>
          {children}
        </div>
      </main>
    </div>
  );
}
