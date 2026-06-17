export interface BookmarkletRawRow {
  text: string;
  likes?: number;
  rpid?: string | null;
  collected_by?: string;
}

export function buildBookmarkletCommentInsertRows(input: {
  raw: BookmarkletRawRow[];
  postId: string;
  projectId: string;
  existingRpid: Set<string>;
  sampleRandom: number;
}) {
  return input.raw
    .filter(r => !r.rpid || !input.existingRpid.has(r.rpid))
    .map(r => ({
      post_id: input.postId,
      project_id: input.projectId,
      text: r.text,
      likes: r.likes || 0,
      sampling_tier: (r.likes || 0) >= 100 ? 'high' as const : (r.likes || 0) >= 10 ? 'mid' as const : 'low' as const,
      is_sampled: (r.likes || 0) >= 100 || input.sampleRandom < 0.5,
      rpid: r.rpid || null,
    }));
}
