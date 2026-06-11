'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { computeDemoStats } from '@/lib/demo-data';
import { cn, getDimensionLabel, getNarrativeLabel } from '@/lib/utils';
import { exportToWord, exportToExcel, exportToCSV, prepareExportData } from '@/lib/export';

export default function ReportPage() {
  const { posts, comments, currentProject } = useAppStore();
  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'event' | 'thesis_package'>('thesis_package');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([
    'd1', 'd2_valence', 'd3', 'd5', 'narrative', 'ethics'
  ]);
  const [generatedContent, setGeneratedContent] = useState('');

  const stats = useMemo(() => {
    if (posts.length === 0) return null;
    return computeDemoStats(posts, comments);
  }, [posts, comments]);

  const analyzedComments = useMemo(() => {
    return comments.filter(c => c.analysis);
  }, [comments]);

  const generateReport = () => {
    if (!stats || !currentProject) return;

    const content = `# ${currentProject.name} - ${reportType === 'thesis_package' ? '论文数据包' : reportType === 'weekly' ? '周报' : '月报'}

## 项目概况

- **监测关键词**: ${currentProject.keyword}
- **数据规模**: ${posts.length} 条笔记, ${comments.length} 条评论
- **采样评论**: ${analyzedComments.length} 条
- **AIGC 占比**: ${(stats.aigcRatio * 100).toFixed(1)}%

## 六维态度分析

${selectedDimensions.includes('d1') ? `### 认知加工深度 (D1)
- 均值: ${stats.avgDimensions.d1.toFixed(2)}
- 理论依据: ELM 精细加工可能性模型
` : ''}

${selectedDimensions.includes('d2_valence') ? `### 情感效价 (D2)
- 均值: ${stats.avgDimensions.d2_valence.toFixed(2)}
- 理论依据: Russell 情感环状模型
` : ''}

${selectedDimensions.includes('d3') ? `### 认同层级 (D3)
- 均值: ${stats.avgDimensions.d3.toFixed(2)}
- 理论依据: 阿斯曼文化记忆理论
- 层级分布:
  - 无认同 (1): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 < 1.5).length}
  - 个体钦佩 (2): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 >= 1.5 && c.analysis.d3 < 2.5).length}
  - 职业认同 (3): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 >= 2.5 && c.analysis.d3 < 3.5).length}
  - 地域认同 (4): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 >= 3.5 && c.analysis.d3 < 4.5).length}
  - 民族认同 (5): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 >= 4.5 && c.analysis.d3 < 5.5).length}
  - 国家使命认同 (6): ${comments.filter(c => c.analysis?.d3 && c.analysis.d3 >= 5.5).length}
` : ''}

${selectedDimensions.includes('narrative') ? `## 叙事类型分析

理论依据: Labov 叙事结构理论

| 叙事类型 | 数量 | 占比 |
|---------|------|------|
${Object.entries(stats.narrativeDistribution).map(([type, count]) =>
  `| ${type} ${getNarrativeLabel(type)} | ${count} | ${((count / comments.length) * 100).toFixed(1)}% |`
).join('\n')}
` : ''}

${selectedDimensions.includes('ethics') ? `## 伦理风险分析

- 高危评论: ${stats.highRiskCount} 条
- 高危占比: ${((stats.highRiskCount / comments.length) * 100).toFixed(1)}%

### 风险分布
- 安全: ${comments.filter(c => c.analysis?.risk_level === 'safe').length}
- 低危: ${comments.filter(c => c.analysis?.risk_level === 'low').length}
- 中危: ${comments.filter(c => c.analysis?.risk_level === 'medium').length}
- 高危: ${comments.filter(c => c.analysis?.risk_level === 'high').length}
` : ''}

## 统计检验结果

### AIGC vs 人工内容对比

| 维度 | AIGC组均值 | 人工组均值 | t值 | p值 | Cohen's d | 显著性 |
|------|-----------|-----------|-----|-----|-----------|--------|
| D1 认知加工 | - | - | - | - | - | - |
| D2 情感效价 | - | - | - | - | - | - |
| D2 情感唤醒 | - | - | - | - | - | - |
| D3 认同层级 | - | - | - | - | - | - |
| D4 行为意向 | - | - | - | - | - | - |
| D5 叙事卷入 | - | - | - | - | - | - |
| D6 伦理风险 | - | - | - | - | - | - |

*注: 统计检验数据需在"认同效果实验室"页面运行后自动填充*

---

生成时间: ${new Date().toLocaleString('zh-CN')}
平台: OutEye 4.0 · Pulse 记忆工坊
`;

    setGeneratedContent(content);
  };

  const dimensionOptions = [
    { id: 'd1', label: '认知加工 (D1)' },
    { id: 'd2_valence', label: '情感效价 (D2)' },
    { id: 'd2_arousal', label: '情感唤醒 (D2)' },
    { id: 'd3', label: '认同层级 (D3)' },
    { id: 'd4', label: '行为意向 (D4)' },
    { id: 'd5', label: '叙事卷入 (D5)' },
    { id: 'd6', label: '伦理风险 (D6)' },
    { id: 'narrative', label: '叙事类型' },
    { id: 'ethics', label: '伦理风险' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
          智能简报工坊
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          一键生成结构化研究报告 · 直接服务论文写作
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="space-y-4">
          <div className="glass-card p-5 animate-fade-in stagger-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">报告配置</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-2">报告类型</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as typeof reportType)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-deep)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] text-sm focus:border-[var(--color-accent-blue)] transition-colors duration-200 outline-none"
                >
                  <option value="thesis_package">论文数据包</option>
                  <option value="weekly">周报</option>
                  <option value="monthly">月报</option>
                  <option value="event">事件响应</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-2">分析维度</label>
                <div className="space-y-2">
                  {dimensionOptions.map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDimensions.includes(opt.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDimensions([...selectedDimensions, opt.id]);
                          } else {
                            setSelectedDimensions(selectedDimensions.filter(d => d !== opt.id));
                          }
                        }}
                        className="accent-[var(--color-accent-blue)]"
                      />
                      <span className="text-sm text-[var(--color-text-secondary)]">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={generateReport}
            className="w-full px-4 py-3 rounded-lg bg-[var(--color-accent-blue)] text-white text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all duration-200"
          >
            生成报告
          </button>

          {/* Export Options */}
          <div className="glass-card p-5 animate-fade-in stagger-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">导出选项</h3>
            <div className="space-y-2">
              {[
                { label: '复制 Markdown', action: () => generatedContent && navigator.clipboard.writeText(generatedContent).then(() => alert('已复制到剪贴板')), disabled: !generatedContent },
                { label: '导出 Word (.docx)', action: () => generatedContent && exportToWord(generatedContent, `${currentProject?.name || 'report'}_报告`), disabled: !generatedContent },
                { label: '导出 Excel (.xlsx)', action: () => exportToExcel(comments, posts, `${currentProject?.name || 'data'}_评论数据`), disabled: comments.length === 0 },
                { label: '导出 CSV', action: () => { const data = prepareExportData(comments, posts); exportToCSV(data, `${currentProject?.name || 'data'}_评论数据`); }, disabled: comments.length === 0 },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  disabled={btn.disabled}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] text-xs hover:border-[var(--color-border-active)] transition-all duration-200 text-left disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="lg:col-span-2">
          <div className="glass-card p-5 animate-fade-in stagger-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">报告预览</h3>
            {generatedContent ? (
              <div className="bg-[var(--color-bg-deep)] rounded-lg p-6 border border-[var(--color-border-subtle)] max-h-[700px] overflow-y-auto">
                <pre className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                  {generatedContent}
                </pre>
              </div>
            ) : (
              <div className="bg-[var(--color-bg-deep)] rounded-lg p-12 border border-[var(--color-border-subtle)] text-center">
                <svg className="w-16 h-16 mx-auto text-[var(--color-text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-[var(--color-text-muted)]">
                  点击"生成报告"按钮预览报告内容
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
