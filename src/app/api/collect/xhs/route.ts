import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

function parseXhsNoteId(url: string) {
  const match = url.match(/(?:explore|discovery\/item|note)\/([a-zA-Z0-9]+)/i);
  return match ? match[1] : null;
}

function buildXhsInitResponse(input: {
  sourceUrl: string;
  projectId: string | null;
  noteId: string;
  detail?: {
    title?: string;
    description?: string;
    author?: string;
    likes?: number;
    comments_count?: number;
    topics?: string[];
  } | null;
}) {
  const detail = input.detail || null;
  const title = detail?.title || `小红书笔记 ${input.noteId}`;
  const postInsert = {
    project_id: input.projectId,
    platform: 'xhs',
    url: input.sourceUrl,
    title,
    ...(detail?.description ? { content: detail.description } : {}),
    ...(detail?.author ? { creator_name: detail.author, author_name_mask: detail.author } : {}),
    likes: detail?.likes || 0,
    comments_count: detail?.comments_count || 0,
    collected_by: 'xhs-init',
    is_aigc: false,
  };

  return {
    postInsert,
    response: {
      noteId: input.noteId,
      sourceUrl: input.sourceUrl,
      note_title: title,
      metadata_completeness: detail ? 'high' : 'low',
      has_author_context: Boolean(detail?.author),
      has_topics: Boolean(detail?.topics && detail.topics.length > 0),
      note_stats: {
        likes: detail?.likes || 0,
        comments: detail?.comments_count || 0,
      },
    },
  };
}

async function resolveProjectId(projectId?: string | null) {
  if (projectId) return projectId;
  const { data } = await supabase.from('projects').select('id').limit(1).single();
  return data?.id || null;
}

async function createOrUpdatePost(sourceUrl: string, postInsert: Record<string, unknown>) {
  const { data: existingPost } = await supabase
    .from('posts')
    .select('id')
    .eq('url', sourceUrl)
    .single();

  if (existingPost?.id) {
    await supabase.from('posts').update(postInsert).eq('id', existingPost.id);
    return existingPost.id;
  }

  const { data: newPost, error } = await supabase
    .from('posts')
    .insert(postInsert)
    .select('id')
    .single();

  if (error || !newPost) {
    throw new Error(`创建小红书帖子记录失败: ${error?.message || 'unknown'}`);
  }

  return newPost.id;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, project_id, xsec_token, detail } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '请提供有效的小红书链接' }, { status: 400 });
    }

    const sourceUrl = url.trim();
    const noteId = parseXhsNoteId(sourceUrl);
    if (!noteId) {
      return NextResponse.json({ error: '无法解析小红书笔记 ID' }, { status: 400 });
    }

    let normalizedDetail = detail || null;
    if (!normalizedDetail && xsec_token) {
      try {
        const origin = new URL(request.url).origin;
        const res = await fetch(`${origin}/api/collect/xhs-mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'detail', feed_id: noteId, xsec_token }),
        });
        const data = await res.json();
        const rawDetail = data?.detail?.noteCard || data?.detail?.note_card || data?.detail || null;
        if (rawDetail) {
          normalizedDetail = {
            title: rawDetail.displayTitle || rawDetail.title || '',
            description: rawDetail.desc || rawDetail.description || '',
            author: rawDetail.user?.nickname || rawDetail.author?.nickname || rawDetail.user_info?.nickname || '',
            likes: Number(rawDetail.interactInfo?.likedCount || rawDetail.interact_info?.liked_count || rawDetail.likes || 0) || 0,
            comments_count: Number(rawDetail.interactInfo?.commentCount || rawDetail.interact_info?.comment_count || rawDetail.comments_count || 0) || 0,
            topics: Array.isArray(rawDetail.tag_list) ? rawDetail.tag_list : Array.isArray(rawDetail.topics) ? rawDetail.topics : [],
          };
        }
      } catch {
        // fallback to low completeness
      }
    }

    const resolvedProjectId = await resolveProjectId(project_id || null);
    const artifacts = buildXhsInitResponse({
      sourceUrl,
      projectId: resolvedProjectId,
      noteId,
      detail: normalizedDetail,
    });

    const postId = await createOrUpdatePost(sourceUrl, artifacts.postInsert);

    return NextResponse.json({
      success: true,
      postId,
      project_id: resolvedProjectId,
      ...artifacts.response,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `小红书初始化失败: ${msg}` }, { status: 500 });
  }
}
