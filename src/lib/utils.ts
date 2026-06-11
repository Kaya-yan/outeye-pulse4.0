import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString();
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatPercent(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + '%';
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'safe': return '#10B981';
    case 'low': return '#6EE7B7';
    case 'medium': return '#F59E0B';
    case 'high': return '#EF4444';
    default: return '#64748B';
  }
}

export function getRiskLabel(level: string): string {
  switch (level) {
    case 'safe': return '安全';
    case 'low': return '低危';
    case 'medium': return '中危';
    case 'high': return '高危';
    default: return '未知';
  }
}

export function getSignificanceLabel(sig: string): string {
  switch (sig) {
    case '***': return '极显著';
    case '**': return '非常显著';
    case '*': return '显著';
    case '?': return '边缘显著';
    case 'ns': return '不显著';
    default: return '';
  }
}

export function getNarrativeLabel(type: string): string {
  const labels: Record<string, string> = {
    T1: '历史还原',
    T2: '生活交往',
    T3: '精神诠释',
    T4: '情感共鸣',
    T5: '价值升华',
    T6: '娱乐消费',
  };
  return labels[type] || type;
}

export function getDimensionLabel(dim: string): string {
  const labels: Record<string, string> = {
    d1: '认知加工',
    d2_valence: '情感效价',
    d2_arousal: '情感唤醒',
    d3: '认同层级',
    d4: '行为意向',
    d5: '叙事卷入',
    d6: '伦理风险',
  };
  return labels[dim] || dim;
}

export function getDimensionPlainLabel(dim: string): string {
  const labels: Record<string, string> = {
    d1: '思考深度',
    d2_valence: '情感正负',
    d2_arousal: '情感强度',
    d3: '认同程度',
    d4: '行动意愿',
    d5: '故事感染力',
    d6: '伦理风险',
  };
  return labels[dim] || dim;
}

export function getDimensionExplanation(dim: string): string {
  const explanations: Record<string, string> = {
    d1: '这条评论的思考深度——是简单的"致敬"还是有理有据的分析。来自 ELM 精细加工模型。',
    d2_valence: '情感是正面还是负面。正值=积极情感，负值=消极情感。来自 Russell 情感环状模型。',
    d2_arousal: '情感的强烈程度。值越高说明情绪越激动。来自 Russell 情感环状模型。',
    d3: '对郭永怀的认同层级——从个人敬佩到民族认同的递进。来自阿斯曼文化记忆理论。',
    d4: '从认知到行动的转化程度——是否表达了学习、传承等行动意愿。',
    d5: '被郭永怀故事感染的程度——是否产生了共情、流泪等反应。来自叙事传输理论。',
    d6: '是否包含历史虚无主义、消费主义等伦理风险。来自媒介伦理框架。',
  };
  return explanations[dim] || '';
}

export function getChartInterpretation(chartType: string, data?: Record<string, unknown>): string {
  const interpretations: Record<string, string> = {
    'narrative-pie': '这张图展示了评论中各类叙事类型的占比。哪种颜色的扇形最大，说明这种叙事模式最常见。',
    'emotion-scatter': '每个点代表一条评论。横轴是情感正负（右边=积极），纵轴是情感强度（上面=激动）。点越大说明认同感越强。',
    'radar': '这张图展示了评论在六个维度上的平均得分。哪个角最突出，说明该维度最明显。',
    'platform-bar': '对比两个平台上评论的六维得分差异。柱子越高说明该维度在该平台越突出。',
    'risk-donut': '展示了评论的伦理风险分布。绿色越大越好，红色越大越需要关注。',
    'aigc-radar': '对比 AI 生成内容和人工内容在六个维度上的差异。两种颜色重叠越多说明差异越小。',
    'likes-hist': '展示了评论点赞数的分布。左边的柱子越高说明大部分评论点赞较少。',
    'sunburst': '内环是平台，外环是叙事类型。扇形越大说明该平台该类型的评论越多。',
  };
  return interpretations[chartType] || '';
}

export function getDimensionShortLabel(dim: string): string {
  const labels: Record<string, string> = {
    d1: 'D1认知',
    d2_valence: 'D2效价',
    d2_arousal: 'D2唤醒',
    d3: 'D3认同',
    d4: 'D4行为',
    d5: 'D5卷入',
    d6: 'D6伦理',
  };
  return labels[dim] || dim;
}

export const CHART_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

export const NARRATIVE_COLORS: Record<string, string> = {
  T1: '#3B82F6',
  T2: '#10B981',
  T3: '#8B5CF6',
  T4: '#EC4899',
  T5: '#F59E0B',
  T6: '#EF4444',
};
