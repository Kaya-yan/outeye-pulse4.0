import { evaluateCollectionQuality } from './collection-quality.ts';
import { getCollectionNextAction } from './collection-next-action.ts';
import { buildResearchTrace } from './research-trace.ts';
import { getCredibilityCopy } from './research-credibility-copy.ts';

export interface CredibilityStatSample {
  values: number[];
  missingCount: number;
  filteredCount: number;
  zeroCount: number;
}

export interface CredibilityRun {
  id: string;
  status: string;
  source: string;
  mode: string;
}

export interface CredibilityComment {
  id: string;
  platform?: string | null;
}

export interface CredibilityProfileInput {
  projectId: string | null;
  platform: 'bilibili' | 'xhs';
  coverageScore: 'high' | 'medium' | 'low';
  metadataCompleteness: 'high' | 'medium' | 'low';
  needBackfill: boolean;
  queued?: boolean;
  runs: ReadonlyArray<CredibilityRun>;
  comments: ReadonlyArray<CredibilityComment>;
  statSamples: Record<string, CredibilityStatSample>;
}

export interface CredibilityProfile {
  projectId: string | null;
  researchGrade: 'A' | 'B' | 'C';
  gradeLabel: string;
  gradeExplanation: string;
  coverageScore: 'high' | 'medium' | 'low';
  metadataScore: 'high' | 'medium' | 'low';
  needBackfill: boolean;
  traceCompleteness: 'full' | 'partial' | 'none';
  hasFailedRuns: boolean;
  hasBackfill: boolean;
  backfillSource: string | null;
  platformCounts: Record<string, number>;
  statSummary: Record<string, { valid: number; missing: number; filtered: number; total: number }>;
  citationAdvice: string;
  riskHint: string;
  nextActionHint: string;
  nextAction: { label: string; href: string; hint: string } | null;
}

export function buildCredibilityProfile(input: CredibilityProfileInput): CredibilityProfile {
  const quality = evaluateCollectionQuality({
    coverageScore: input.coverageScore,
    metadataCompleteness: input.metadataCompleteness,
    needBackfill: input.needBackfill,
  });

  const trace = buildResearchTrace({
    runs: input.runs,
    comments: input.comments,
  });

  const hasFailedRuns = trace.failedCount > 0;

  const copy = getCredibilityCopy({
    researchGrade: quality.researchGrade,
    traceCompleteness: trace.traceCompleteness,
    hasFailedRuns,
    hasBackfill: trace.hasBackfill,
  });

  const nextAction = getCollectionNextAction({
    platform: input.platform,
    needBackfill: input.needBackfill,
    queued: input.queued,
    coverageScore: input.coverageScore,
    metadataCompleteness: input.metadataCompleteness,
  });

  const totalComments = input.comments.length;
  const statSummary: CredibilityProfile['statSummary'] = {};
  for (const [dim, sample] of Object.entries(input.statSamples)) {
    statSummary[dim] = {
      valid: sample.values.length,
      missing: sample.missingCount,
      filtered: sample.filteredCount,
      total: totalComments,
    };
  }

  return {
    projectId: input.projectId,
    researchGrade: quality.researchGrade,
    gradeLabel: copy.gradeLabel,
    gradeExplanation: copy.gradeExplanation,
    coverageScore: quality.coverageScore,
    metadataScore: quality.metadataScore,
    needBackfill: quality.needBackfill,
    traceCompleteness: trace.traceCompleteness,
    hasFailedRuns,
    hasBackfill: trace.hasBackfill,
    backfillSource: trace.backfillSource,
    platformCounts: trace.platformCounts,
    statSummary,
    citationAdvice: copy.citationAdvice,
    riskHint: copy.riskHint,
    nextActionHint: copy.nextActionHint,
    nextAction,
  };
}
