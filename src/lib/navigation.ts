export interface NavItem {
  label: string;
  href: string;
  desc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: '采集台', href: '/collect', desc: '粘贴链接·一键采集' },
  { label: '分析台', href: '/analyze', desc: '图表·发现·洞察' },
  { label: '报告', href: '/report', desc: '论文·简报·导出' },
  { label: '设置', href: '/settings', desc: '环境·偏好·数据' },
];
