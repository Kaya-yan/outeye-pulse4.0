export function evaluateCollectionQuality(input: {
  coverageScore: 'high' | 'medium' | 'low';
  metadataCompleteness: 'high' | 'medium' | 'low';
  needBackfill: boolean;
}): {
  researchGrade: 'A' | 'B' | 'C';
  coverageScore: 'high' | 'medium' | 'low';
  metadataScore: 'high' | 'medium' | 'low';
  needBackfill: boolean;
  explanation: string;
} {
  if (input.coverageScore === 'high' && input.metadataCompleteness === 'high' && !input.needBackfill) {
    return {
      researchGrade: 'A',
      coverageScore: input.coverageScore,
      metadataScore: input.metadataCompleteness,
      needBackfill: false,
      explanation: '评论覆盖和元数据都达到了主样本标准',
    };
  }

  if (input.coverageScore !== 'low' && input.metadataCompleteness !== 'low' && !input.needBackfill) {
    return {
      researchGrade: 'B',
      coverageScore: input.coverageScore,
      metadataScore: input.metadataCompleteness,
      needBackfill: false,
      explanation: '结果基本可用，但仍存在可改进空间',
    };
  }

  return {
    researchGrade: 'C',
    coverageScore: input.coverageScore,
    metadataScore: input.metadataCompleteness,
    needBackfill: input.needBackfill,
    explanation: '当前结果更适合作为辅助样本，建议继续补录或重试',
  };
}
