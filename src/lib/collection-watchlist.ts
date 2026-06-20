import type { CollectionCandidate } from './collection-candidate.ts';

export function buildWatchlistEntry(input: {
  projectId: string | null;
  candidate: CollectionCandidate;
}) {
  return {
    project_id: input.projectId,
    platform: input.candidate.platform,
    target_type: 'content',
    target_value: input.candidate.platformId,
    url: input.candidate.url,
    title: input.candidate.title,
    author: input.candidate.author,
    summary: input.candidate.summary,
    recall_source: input.candidate.recallSource,
    status: 'active',
  };
}
