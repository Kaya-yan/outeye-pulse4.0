import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { fetchVideoInfo } from '@/lib/bilibili-wbi';

const supabase = createServerClient();

/**
 * POST /api/collect/bilibili
 * Fast init endpoint: fetch video info + create post record.
 * Returns postId and aid so the CLIENT can paginate comments.
 * Typical execution: 2-4 seconds.
 *
 * Body: { bvid?: string, url?: string, project_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { bvid, url, project_id } = body;

    // Extract BV号 from URL if needed
    if (!bvid && url) {
      const m = url.match(/(BV\w{10})/);
      if (m) bvid = m[1];
    }
    if (!bvid) {
      return NextResponse.json({ error: '请提供 BV 号或 B站视频链接' }, { status: 400 });
    }

    // Fetch video info and resolve project in parallel
    const [videoInfo, resolvedProjectId] = await Promise.all([
      fetchVideoInfo(bvid),
      project_id
        ? Promise.resolve(project_id)
        : supabase.from('projects').select('id').limit(1).single().then(r => r.data?.id || null),
    ]);

    if (!videoInfo) {
      return NextResponse.json({ error: '无法获取视频信息，BV号可能无效' }, { status: 400 });
    }

    project_id = resolvedProjectId;
    const aid = videoInfo.aid;
    const sourceUrl = `https://www.bilibili.com/video/${bvid}`;

    // Create or find post record
    let postId: string;
    const { data: existingPost } = await supabase
      .from('posts')
      .select('id')
      .eq('url', sourceUrl)
      .single();

    if (existingPost) {
      postId = existingPost.id;
    } else {
      const { data: newPost, error: postErr } = await supabase
        .from('posts')
        .insert({
          project_id,
          platform: 'bilibili',
          url: sourceUrl,
          title: videoInfo.title,
          author_name_mask: videoInfo.owner?.name || '',
          creator_name: videoInfo.owner?.name || '',
          likes: videoInfo.stat?.like || 0,
          view_count: videoInfo.stat?.view || 0,
          collected_by: 'client-paginate',
          is_aigc: false,
        })
        .select('id')
        .single();

      if (postErr || !newPost) {
        return NextResponse.json({ error: `创建帖子记录失败: ${postErr?.message}` }, { status: 500 });
      }
      postId = newPost.id;
    }

    return NextResponse.json({
      success: true,
      postId,
      aid,
      bvid,
      sourceUrl,
      project_id,
      video_title: videoInfo.title,
      video_stats: {
        views: videoInfo.stat?.view,
        likes: videoInfo.stat?.like,
        replies: videoInfo.stat?.reply,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `初始化失败: ${msg}` }, { status: 500 });
  }
}
