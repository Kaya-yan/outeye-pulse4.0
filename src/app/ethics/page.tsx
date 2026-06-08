'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn, getRiskColor, getRiskLabel, getNarrativeLabel } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function EthicsPage() {
  const { comments, posts } = useAppStore();
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const analyzedComments = useMemo(() => {
    return comments.filter(c => c.analysis);
  }, [comments]);

  // Risk distribution
  const riskDistribution = useMemo(() => {
    const dist = { safe: 0, low: 0, medium: 0, high: 0 };
    analyzedComments.forEach(c => {
      if (c.analysis?.risk_level) {
        dist[c.analysis.risk_level as keyof typeof dist]++;
      }
    });
    return dist;
  }, [analyzedComments]);

  // High risk comments
  const highRiskComments = useMemo(() => {
    let result = analyzedComments.filter(c =>
      c.analysis?.risk_level === 'high' || c.analysis?.risk_level === 'medium'
    );

    if (riskFilter !== 'all') {
      result = result.filter(c => c.analysis?.risk_level === riskFilter);
    }

    return result.sort((a, b) => {
      const order = { high: 4, medium: 3, low: 2, safe: 1 };
      const ra = order[a.analysis?.risk_level as keyof typeof order] || 0;
      const rb = order[b.analysis?.risk_level as keyof typeof order] || 0;
      return rb - ra;
    });
  }, [analyzedComments, riskFilter]);

  // Pie chart option
  const pieOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#030712', borderWidth: 2 },
        label: { show: true, color: '#94A3B8', fontSize: 11 },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: 'bold' },
        },
        data: [
          { value: riskDistribution.safe, name: '安全', itemStyle: { color: '#10B981' } },
          { value: riskDistribution.low, name: '低危', itemStyle: { color: '#6EE7B7' } },
          { value: riskDistribution.medium, name: '中危', itemStyle: { color: '#F59E0B' } },
          { value: riskDistribution.high, name: '高危', itemStyle: { color: '#EF4444' } },
        ],
      }],
    };
  }, [riskDistribution]);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchAction = (action: 'confirm' | 'ignore' | 'downgrade') => {
    // In a real app, this would update the database
    console.log(`Batch ${action} for ${selectedIds.size} items`);
    setSelectedIds(new Set());
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC]" style={{ fontFamily: 'var(--font-noto-serif-sc)' }}>
          伦理哨兵中心
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          风险监测 · 高危内容标记 · 伦理审查报告
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Stats */}
        <div className="space-y-4">
          <div className="glass-card p-5 animate-fade-in">
            <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4">风险等级分布</h3>
            <ReactECharts option={pieOption} style={{ height: 250 }} />
          </div>

          <div className="glass-card p-5 animate-fade-in stagger-1">
            <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">风险统计</h3>
            <div className="space-y-2">
              {Object.entries(riskDistribution).map(([level, count]) => (
                <div key={level} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getRiskColor(level) }}
                    />
                    <span className="text-sm text-[#94A3B8]">{getRiskLabel(level)}</span>
                  </div>
                  <span className="text-sm text-[#F8FAFC] font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle: List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter */}
          <div className="glass-card p-4 animate-fade-in stagger-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[#030712] text-[#94A3B8] border border-[#1E293B] text-sm"
                >
                  <option value="all">全部风险等级</option>
                  <option value="high">高危</option>
                  <option value="medium">中危</option>
                  <option value="low">低危</option>
                </select>
                <span className="text-xs text-[#64748B]">
                  共 {highRiskComments.length} 条
                </span>
              </div>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#94A3B8]">
                    已选 {selectedIds.size} 条
                  </span>
                  <button
                    onClick={() => handleBatchAction('confirm')}
                    className="px-3 py-1 rounded bg-[#10B981]/10 text-[#10B981] text-xs"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => handleBatchAction('ignore')}
                    className="px-3 py-1 rounded bg-[#64748B]/10 text-[#64748B] text-xs"
                  >
                    忽略
                  </button>
                  <button
                    onClick={() => handleBatchAction('downgrade')}
                    className="px-3 py-1 rounded bg-[#F59E0B]/10 text-[#F59E0B] text-xs"
                  >
                    降级
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {highRiskComments.map(comment => (
              <div
                key={comment.id}
                className={cn(
                  'glass-card p-4 transition-all duration-200',
                  selectedIds.has(comment.id) && 'border-[#3B82F6]/50 bg-[#3B82F6]/5'
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(comment.id)}
                    onChange={() => toggleSelect(comment.id)}
                    className="mt-1 accent-[#3B82F6]"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-[#F8FAFC] mb-2">{comment.text}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          color: getRiskColor(comment.analysis?.risk_level || ''),
                          backgroundColor: `${getRiskColor(comment.analysis?.risk_level || '')}15`,
                        }}
                      >
                        {getRiskLabel(comment.analysis?.risk_level || '')}
                      </span>
                      {comment.analysis?.narrative_type && (
                        <span className="px-2 py-0.5 rounded text-xs bg-[#111827] text-[#94A3B8]">
                          {comment.analysis.narrative_type} {getNarrativeLabel(comment.analysis.narrative_type)}
                        </span>
                      )}
                      <span className="text-xs text-[#64748B]">
                        ❤️ {comment.likes}
                      </span>
                    </div>

                    {/* AI Judgment */}
                    <div className="mt-2 p-2 rounded bg-[#030712] border border-[#1E293B]">
                      <div className="text-xs text-[#64748B] mb-1">AI 判定依据:</div>
                      <div className="flex flex-wrap gap-1">
                        {comment.analysis?.evidence_keywords?.map((kw, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-[#EF4444]/10 text-[#EF4444] text-[10px]">
                            {kw.word} ({kw.weight.toFixed(2)})
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-2 py-1 rounded bg-[#10B981]/10 text-[#10B981] text-xs hover:bg-[#10B981]/20">
                        确认
                      </button>
                      <button className="px-2 py-1 rounded bg-[#64748B]/10 text-[#64748B] text-xs hover:bg-[#64748B]/20">
                        忽略
                      </button>
                      <button className="px-2 py-1 rounded bg-[#F59E0B]/10 text-[#F59E0B] text-xs hover:bg-[#F59E0B]/20">
                        降级
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Generate Report */}
          <div className="glass-card p-5 animate-fade-in stagger-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">伦理审查报告</h3>
                <p className="text-xs text-[#64748B] mt-1">
                  一键生成 Markdown 格式的伦理审查报告
                </p>
              </div>
              <button className="px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm hover:bg-[#2563EB] transition-colors">
                生成报告
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
