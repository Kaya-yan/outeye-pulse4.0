export interface CollectionCandidate {
  platform: 'bilibili' | 'xhs';
  platformId: string;
  url: string;
  title: string;
  author: string;
  summary: string;
  tags: string[];
  views: number;
  likes: number;
  commentsCount: number;
  favorites: number;
  publishedAt: string | null;
  recallSource: string;
}

function splitTags(value?: string) {
  if (!value) return [];
  return value.split(/[，,、/\s]+/).map(s => s.trim()).filter(Boolean);
}

export function buildBilibiliCandidate(input: {
  bvid: string;
  title?: string;
  author?: string;
  play?: number;
  review?: number;
  likes?: number;
  favorites?: number;
  pubdate?: number;
  description?: string;
  tag?: string;
}, recallSource: string): CollectionCandidate {
  return {
    platform: 'bilibili',
    platformId: input.bvid,
    url: `https://www.bilibili.com/video/${input.bvid}`,
    title: input.title || '',
    author: input.author || '',
    summary: input.description || '',
    tags: splitTags(input.tag),
    views: input.play || 0,
    likes: input.likes || 0,
    commentsCount: input.review || 0,
    favorites: input.favorites || 0,
    publishedAt: input.pubdate ? new Date(input.pubdate * 1000).toISOString() : null,
    recallSource,
  };
}

export function buildXhsCandidate(input: {
  note_id: string;
  title?: string;
  author?: string;
  url: string;
  views?: number;
  likes?: number;
  comments_count?: number;
  description?: string;
}, recallSource: string): CollectionCandidate {
  return {
    platform: 'xhs',
    platformId: input.note_id,
    url: input.url,
    title: input.title || '',
    author: input.author || '',
    summary: input.description || '',
    tags: [],
    views: input.views || 0,
    likes: input.likes || 0,
    commentsCount: input.comments_count || 0,
    favorites: 0,
    publishedAt: null,
    recallSource,
  };
}

export function scoreCollectionCandidate(candidate: Pick<CollectionCandidate, 'title' | 'summary' | 'tags' | 'commentsCount' | 'likes' | 'views' | 'publishedAt'>, keyword: string) {
  const text = `${candidate.title} ${candidate.summary} ${candidate.tags.join(' ')}`.toLowerCase();
  const needle = keyword.trim().toLowerCase();
  const keywordRelevance = text.includes(needle) ? 30 : 0;
  const commentPotential = Math.min(35, Math.round(candidate.commentsCount / 20));
  const engagement = Math.min(20, Math.round((candidate.likes + candidate.views / 100) / 500));
  const freshness = candidate.publishedAt ? 10 : 0;
  const total = keywordRelevance + commentPotential + engagement + freshness;
  return { total, keywordRelevance, commentPotential, engagement, freshness };
}
