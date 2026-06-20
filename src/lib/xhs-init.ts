export interface XhsDetailSummary {
  title?: string;
  description?: string;
  author?: string;
  likes?: number;
  comments_count?: number;
  cover_url?: string;
  published_at?: string;
  topics?: string[];
}

export function parseXhsNoteId(url: string) {
  const match = url.match(/(?:explore|discovery\/item|note)\/([a-zA-Z0-9]+)/i);
  return match ? match[1] : null;
}

export function buildXhsInitArtifacts(input: {
  sourceUrl: string;
  projectId: string | null;
  noteId: string;
  detail: XhsDetailSummary | null;
}) {
  const detail = input.detail;
  const title = detail?.title || `小红书笔记 ${input.noteId}`;
  const postInsert = {
    project_id: input.projectId,
    platform: 'xhs' as const,
    url: input.sourceUrl,
    title,
    ...(detail?.description ? { content: detail.description } : {}),
    ...(detail?.author ? { creator_name: detail.author, author_name_mask: detail.author } : {}),
    likes: detail?.likes || 0,
    comments_count: detail?.comments_count || 0,
    collected_by: 'xhs-init',
    is_aigc: false,
  };

  const completeness = detail ? 'high' : 'low';

  return {
    postInsert,
    response: {
      noteId: input.noteId,
      sourceUrl: input.sourceUrl,
      note_title: title,
      metadata_completeness: completeness,
      has_author_context: Boolean(detail?.author),
      has_topics: Boolean(detail?.topics && detail.topics.length > 0),
      note_stats: {
        likes: detail?.likes || 0,
        comments: detail?.comments_count || 0,
      },
    },
  };
}
