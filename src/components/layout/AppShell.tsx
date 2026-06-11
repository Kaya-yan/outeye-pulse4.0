'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { IntroAnimation } from '@/components/ui/IntroAnimation';
import { AnalysisProgressBar } from '@/components/analysis/AnalysisProgressBar';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, presentationMode, analysisProgress } = useAppStore();
  const router = useRouter();
  const showProgressBar = analysisProgress && analysisProgress.status !== 'completed' && analysisProgress.status !== 'failed';

  const handleOnboardingComplete = useCallback((action: 'bilibili' | 'csv' | 'demo') => {
    if (action === 'demo') {
      // Demo mode — stay on current page, demo will load there
    } else if (action === 'bilibili') {
      router.push('/collect');
    } else {
      router.push('/collect');
    }
  }, [router]);

  return (
    <div className={cn('min-h-screen', presentationMode && 'brightness-105')}>
      <IntroAnimation />
      <OnboardingWizard onComplete={handleOnboardingComplete} />
      <TopNav />
      {showProgressBar && <AnalysisProgressBar />}
      {!presentationMode && <Sidebar />}
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          showProgressBar ? 'pt-[4.5rem]' : 'pt-14',
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
