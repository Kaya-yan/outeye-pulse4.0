import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, computeSampling, findExistingHashes, AD_PATTERN, sleep } from '@/lib/hash';
import { BILI_HEADERS, type BiliReply, fetchVideoInfo, fetchReplies, fetchSubReplies } from '@/lib/bilibili-wbi';

const supabase = createServerClient();

/**
 * POST /api/collect/bilibili
 * One-click collection: paste BV号 or URL → fetch all comments → import to DB
 * Body: { bvid?: string, url?: string, project_id?: string, max_comments?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { bvid, url, project_id, max_comments = 5000 } = body;

    // Extract BV号 from URL if needed
    if (!bvid && url) {
      const m = url.match(/(BV\w{10})/);
      if (m) bvid = m[1];
    }
    if (!bvid) {
      return NextResponse.json({ error: '请提供 BV 号或 B站视频链接' }, { status: 400 });
    }

    max_comments = Math.min(50000, Math.max(100, Number(max_comments) || 5000));

    // Fetch video info and resolve project in parallel
    const [videoInfo, resolvedProjectId] = await Promise.all([
      fetchVideoInfo(bvid),
      project_id ? Promise.resolve(project_id) : supabase.from('projects').select('id').limit(1).single().then(r => r.data?.id || null),
    ]);

    if (!videoInfo) {
      return NextResponse.json({ error: '无法获取视频信息，BV号可能无效' }, { status: 400 });
    }

    project_id = resolvedProjectId;
    const aid = videoInfo.aid;
    const sourceUrl = `https://www.bilibili.com/video/${bvid}`;

    // Step 3: Create or find post record
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
          collected_by: 'quick-collect',
          is_aigc: false,
        })
        .select('id')
        .single();

      if (postErr || !newPost) {
        return NextResponse.json({ error: `创建帖子记录失败: ${postErr?.message}` }, { status: 500 });
      }
      postId = newPost.id;
    }

    // Step 4: Collect all comments via paginated API
    const allReplies: BiliReply[] = [];
    const seenRpids = new Set<number>();
    let cursor = 0;
    let pageNum = 0;
    const maxPages = Math.ceil(max_comments / 20);

    // Phase A: Hot comments (mode=3)
    const hotResult = await fetchReplies(aid, 0, 3);
    for (const r of hotResult.replies) {
      if (!seenRpids.has(r.rpid)) {
        seenRpids.add(r.rpid);
        allReplies.push(r);
      }
    }
    cursor = hotResult.nextCursor;
    await sleep(500);

    // Phase B: Time-ordered comments (mode=2)
    while (pageNum < maxPages && allReplies.length < max_comments) {
      pageNum++;
      const result = await fetchReplies(aid, cursor, 2);

      if (result.replies.length === 0) break;

      for (const r of result.replies) {
        if (!seenRpids.has(r.rpid)) {
          seenRpids.add(r.rpid);
          allReplies.push(r);
        }
      }

      if (result.isEnd) break;
      cursor = result.nextCursor;

      // Random delay to avoid rate limiting
      await sleep(800 + Math.random() * 1200);
    }

    // Step 5: Fetch sub-replies for top comments (top 20 by likes)
    const topReplies = allReplies
      .filter(r => r.rcount > 0)
      .sort((a, b) => b.like - a.like)
      .slice(0, 20);

    // Batch sub-reply fetching in groups of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < topReplies.length; i += BATCH_SIZE) {
      const batch = topReplies.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(parent =>
          fetchSubReplies(aid, parent.rpid).catch(() => [] as BiliReply[])
        )
      );
      for (let j = 0; j < batch.length; j++) {
        batch[j].replies = results[j];
      }
      if (i + BATCH_SIZE < topReplies.length) {
        await sleep(500 + Math.random() * 500);
      }
    }

    // Step 6: Flatten and import
    const flatComments = flattenReplies(allReplies, sourceUrl);
    const importResult = await importComments(flatComments, postId, project_id);

    return NextResponse.json({
      success: importResult.imported > 0,
      bvid,
      video_title: videoInfo.title,
      video_stats: {
        views: videoInfo.stat?.view,
        likes: videoInfo.stat?.like,
        replies: videoInfo.stat?.reply,
      },
      collected: allReplies.length,
      with_sub_replies: flatComments.length,
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      filtered: importResult.filtered,
      errors: importResult.errors,
      post_id: postId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `采集失败: ${msg}` }, { status: 500 });
  }
}

// ─── Import helpers ───────────────────────────────────────────

function flattenReplies(replies: BiliReply[], sourceUrl: string) {
  const result: {
    text: string; likes: number; username: string; createTime: string; sourceUrl: string; rpid: number;
  }[] = [];

  const pushIfValid = (r: BiliReply) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2 && !AD_PATTERN.test(text)) {
      result.push({
        text,
        likes: r.like || 0,
        username: r.member?.uname || '',
        createTime: r.ctime ? new Date(r.ctime * 1000).toISOString() : '',
        sourceUrl,
        rpid: r.rpid,
      });
    }
  };

  for (const r of replies) {
    pushIfValid(r);
    if (r.replies) {
      for (const sr of r.replies) pushIfValid(sr);
    }
  }

  return result;
}

async function importComments(
  comments: { text: string; likes: number; username: string; createTime: string; sourceUrl: string; rpid: number }[],
  postId: string,
  projectId: string | null
) {
  let imported = 0;
  let duplicates = 0;
  let filtered = 0;
  const errors: string[] = [];

  const hashes = comments.map(c => simpleHash(`${c.text}|${c.username}|${c.createTime}`));
  const existingHashes = await findExistingHashes(supabase, hashes);

  // Build insert rows
  const toInsert: Record<string, unknown>[] = [];
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const hash = hashes[i];

    if (existingHashes.has(hash)) {
      duplicates++;
      continue;
    }

    toInsert.push({
      post_id: postId,
      project_id: projectId,
      text: c.text,
      likes: c.likes,
      source_tool: 'quick-collect',
      source_url: c.sourceUrl,
      content_hash: hash,
      ...computeSampling(c.likes),
    });
  }

  // Batch insert
  if (toInsert.length > 0) {
    const { error } = await supabase.from('comments').insert(toInsert);
    if (error) {
      // Fallback: insert one by one
      for (const row of toInsert) {
        const { error: singleErr } = await supabase.from('comments').insert(row);
        if (!singleErr) {
          imported++;
        } else {
          filtered++;
          if (errors.length < 3) errors.push(singleErr.message);
        }
      }
    } else {
      imported = toInsert.length;
    }
  }

  return { imported, duplicates, filtered, errors };
}
