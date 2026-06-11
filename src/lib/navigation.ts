export interface NavItem {
  label: string;
  href: string;
  desc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: '研究台', href: '/research', desc: '采集·分析·发现' },
  { label: '数据采集中心', href: '/p0', desc: '采集·导入·日志' },
  { label: '数据驾驶舱', href: '/dashboard', desc: '宏观可视化' },
  { label: '内容解剖室', href: '/anatomy', desc: '微观分析' },
  { label: '叙事谱系图', href: '/genealogy', desc: '叙事分析' },
  { label: '认同实验室', href: '/identity-lab', desc: '统计检验' },
  { label: '伦理哨兵', href: '/ethics', desc: '风险监测' },
  { label: '简报工坊', href: '/brief', desc: '报告生成' },
];
