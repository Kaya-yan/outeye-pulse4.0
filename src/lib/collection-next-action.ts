export function getCollectionNextAction(input: {
  platform: 'bilibili' | 'xhs';
  needBackfill: boolean;
  queued?: boolean;
  coverageScore?: 'high' | 'medium' | 'low';
  metadataCompleteness?: 'high' | 'medium' | 'low';
}) {
  if (input.queued) {
    return {
      label: '前往 P0 查看运行',
      href: '/p0',
      hint: '深采任务仍在执行或排队中，请在采集运行中心继续跟踪',
    };
  }

  if (input.needBackfill) {
    return {
      label: '前往 P0 补录',
      href: '/p0',
      hint: '建议使用书签采集会话或 Console 脚本补齐评论与元数据缺口',
    };
  }

  return null;
}
