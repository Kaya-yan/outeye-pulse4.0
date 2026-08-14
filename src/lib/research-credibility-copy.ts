export interface CredibilityCopyInput {
  researchGrade: 'A' | 'B' | 'C';
  traceCompleteness: 'full' | 'partial' | 'none';
  hasFailedRuns: boolean;
  hasBackfill?: boolean;
}

export interface CredibilityCopy {
  gradeLabel: string;
  gradeExplanation: string;
  citationAdvice: string;
  riskHint: string;
  nextActionHint: string;
}

export function getCredibilityCopy(input: CredibilityCopyInput): CredibilityCopy {
  const gradeLabel =
    input.researchGrade === 'A'
      ? '主样本级（可正式引用）'
      : input.researchGrade === 'B'
        ? '可用样本级（建议补强）'
        : '辅助样本级（谨慎引用）';

  const gradeExplanation =
    input.researchGrade === 'A'
      ? '评论覆盖和元数据都达到了主样本标准'
      : input.researchGrade === 'B'
        ? '结果基本可用，但仍存在可改进空间'
        : '当前结果更适合作为辅助样本，建议继续补录或重试';

  const riskHints: string[] = [];
  if (input.traceCompleteness === 'none') {
    riskHints.push('来源追溯信息缺失，无法确认采集事实');
  } else if (input.traceCompleteness === 'partial') {
    riskHints.push('来源追溯不完整，部分采集事实缺失');
  }
  if (input.hasFailedRuns) {
    riskHints.push('存在失败的采集运行，可能影响样本完整度');
  }

  const citationAdvice =
    input.researchGrade === 'A' && input.traceCompleteness === 'full'
      ? '可直接引用'
      : input.researchGrade === 'C' || input.traceCompleteness === 'none'
        ? '建议谨慎引用，不宜作为核心结论依据'
        : '可作为参考引用，建议补强后再用于正式结论';

  const nextActionHint =
    input.researchGrade === 'C'
      ? '建议先补录或重试，再进入分析'
      : input.traceCompleteness !== 'full'
        ? '建议在运行中心确认采集完整性'
        : '可直接进入分析';

  return {
    gradeLabel,
    gradeExplanation,
    citationAdvice: citationAdvice + (input.hasBackfill ? '（已含补录数据）' : ''),
    riskHint: riskHints.join('；'),
    nextActionHint,
  };
}
