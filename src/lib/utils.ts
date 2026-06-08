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
