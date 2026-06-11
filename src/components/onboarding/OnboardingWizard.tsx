'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface OnboardingWizardProps {
  onComplete: (action: 'bilibili' | 'csv' | 'demo') => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem('outeye-onboarding-done');
    if (!done) {
      setVisible(true);
    }
  }, []);

  const handleComplete = (action: 'bilibili' | 'csv' | 'demo') => {
    localStorage.setItem('outeye-onboarding-done', 'true');
    setVisible(false);
    onComplete(action);
  };

  const handleSkip = () => {
    localStorage.setItem('outeye-onboarding-done', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
      <div className="glass-card max-w-lg w-full p-8 animate-fade-in-scale">
        {step === 0 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float" style={{ background: 'linear-gradient(135deg, #5B8DEF, #9B7BDB)' }}>
              <span className="text-white font-bold text-2xl">O</span>
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
              欢迎使用 OutEye
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-8">
              这是一个帮助你分析社交媒体上文化记忆传播的研究工具。<br />
              你只需要三步：<span className="text-[var(--color-accent-blue)]">采集评论</span> → <span className="text-[var(--color-accent-purple)]">AI 分析</span> → <span className="text-[var(--color-accent-green)]">生成报告</span>
            </p>
            <button
              onClick={() => setStep(1)}
              className="px-8 py-3 bg-[var(--color-accent-blue)] text-white rounded-lg text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            >
              开始使用
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2 text-center" style={{ fontFamily: 'var(--font-serif)' }}>
              选择你的数据来源
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] text-center mb-6">
              你可以随时在采集台切换方式
            </p>

            <div className="space-y-3">
              {/* B站一键采集 */}
              <button
                onClick={() => handleComplete('bilibili')}
                className="w-full p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[#00A1D6] bg-[var(--color-bg-deep)] text-left transition-all duration-200 group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#00A1D6]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#00A1D6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[#00A1D6] transition-colors duration-200">
                      粘贴 B站链接
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      最简单的方式 — 粘贴视频链接，一键采集所有评论
                    </div>
                  </div>
                </div>
              </button>

              {/* CSV 导入 */}
              <button
                onClick={() => handleComplete('csv')}
                className="w-full p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-blue)] bg-[var(--color-bg-deep)] text-left transition-all duration-200 group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-blue)]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[var(--color-accent-blue)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-blue)] transition-colors duration-200">
                      上传 CSV 文件
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      如果你已经用爬虫工具采集了数据，可以直接导入
                    </div>
                  </div>
                </div>
              </button>

              {/* 演示数据 */}
              <button
                onClick={() => handleComplete('demo')}
                className="w-full p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-amber)] bg-[var(--color-bg-deep)] text-left transition-all duration-200 group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-amber)]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[var(--color-accent-amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-amber)] transition-colors duration-200">
                      先看演示数据
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      加载模拟数据，了解平台功能和分析流程
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <button onClick={handleSkip} className="w-full text-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] mt-4 transition-colors duration-200">
              跳过，我自己探索
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
