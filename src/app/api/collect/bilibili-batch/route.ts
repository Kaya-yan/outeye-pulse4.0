import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, computeSampling, findExistingHashes, AD_PATTERN, sleep } from '@/lib/hash';
import { BILI_HEADERS, type BiliReply, fetchVideoInfo, fetchReplies, fetchSubReplies } from '@/lib/bilibili-wbi';

const supabase = createServerClient();

/**
 * POST /api/collect/bilibili-batch
 * Batch collect comments for multiple Bilibili videos.
 * Body: { bvids: string[], project_id?: string, max_comments_per_video?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bvids, project_id, max_comments_per_video = 2000 } = body;

    if (!bvids || !Array.isArray(bvids) || bvids.length === 0) {
      return NextResponse.json({ error: '请提供 bvids 数组' }, { status: 400 });
    }

    if (bvids.length > 20) {
      return NextResponse.json({ error: '单次最多批量采集 20 个视频' }, { status: 400 });
    }

    // Resolve project
    let projectId = project_id;
    if (!projectId) {
      const { data } = await supabase.from('projects').select('id').limit(1).single();
      projectId = data?.id || null;
    }

    const results: { bvid: string; title: string; imported: number; duplicates: number; error?: string }[] = [];

    for (const bvid of bvids) {
      try {
        const result = await collectOne(bvid, projectId, max_comments_per_video);
        results.push(result);
        // Delay between videos to avoid rate limiting
        await sleep(1000 + Math.random() * 1000);
      } catch (err) {
        results.push({
          bvid,
          title: '',
          imported: 0,
          duplicates: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0);
    const totalDuplicates = results.reduce((s, r) => s + r.duplicates, 0);

    return NextResponse.json({
      success: totalImported > 0,
      videos: results.length,
      total_imported: totalImported,
      total_duplicates: totalDuplicates,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `批量采集失败: ${msg}` }, { status: 500 });
  }
}

async function collectOne(
  bvid: string,
  projectId: string | null,
  maxComments: number,
): Promise<{ bvid: string; title: string; imported: number; duplicates: number }> {
  // Fetch video info
  const videoInfo = await fetchVideoInfo(bvid);
  if (!videoInfo) throw new Error('无法获取视频信息');

  const sourceUrl = `https://www.bilibili.com/video/${bvid}`;
  const aid = videoInfo.aid;

  // Create or find post
  let postId: string;
  const { data: existing } = await supabase.from('posts').select('id').eq('url', sourceUrl).single();
  if (existing) {
    postId = existing.id;
  } else {
    const { data: newPost, error } = await supabase
      .from('posts')
      .insert({
        project_id: projectId,
        platform: 'bilibili',
        url: sourceUrl,
        title: videoInfo.title,
        author_name_mask: videoInfo.owner?.name || '',
        likes: videoInfo.stat?.like || 0,
        collected_by: 'batch-collect',
        is_aigc: false,
      })
      .select('id')
      .single();
    if (error || !newPost) throw new Error(`创建帖子失败: ${error?.message}`);
    postId = newPost.id;
  }

  // Collect comments
  const allReplies: BiliReply[] = [];
  const seenRpids = new Set<number>();
  const maxPages = Math.ceil(maxComments / 20);

  // Hot comments
  const hotResult = await fetchReplies(aid, 0, 3);
  for (const r of hotResult.replies) {
    if (!seenRpids.has(r.rpid)) { seenRpids.add(r.rpid); allReplies.push(r); }
  }
  await sleep(500);

  // Time-ordered
  let cursor = hotResult.nextCursor;
  for (let page = 0; page < maxPages && allReplies.length < maxComments; page++) {
    const result = await fetchReplies(aid, cursor, 2);
    if (result.replies.length === 0) break;
    for (const r of result.replies) {
      if (!seenRpids.has(r.rpid)) { seenRpids.add(r.rpid); allReplies.push(r); }
    }
    if (result.isEnd) break;
    cursor = result.nextCursor;
    await sleep(800 + Math.random() * 1200);
  }

  // Sub-replies for top 10
  const topReplies = allReplies.filter(r => r.rcount > 0).sort((a, b) => b.like - a.like).slice(0, 10);
  for (const parent of topReplies) {
    try {
      parent.replies = await fetchSubReplies(aid, parent.rpid);
      await sleep(300);
    } catch { /* skip */ }
  }

  // Flatten
  const flat: { text: string; likes: number; username: string; createTime: string; rpid: number }[] = [];
  const pushIfValid = (r: BiliReply) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2 && !AD_PATTERN.test(text)) {
      flat.push({ text, likes: r.like || 0, username: r.member?.uname || '', createTime: r.ctime ? new Date(r.ctime * 1000).toISOString() : '', rpid: r.rpid });
    }
  };
  for (const r of allReplies) {
    pushIfValid(r);
    if (r.replies) for (const sr of r.replies) pushIfValid(sr);
  }

  // Dedup and insert
  const hashes = flat.map(c => simpleHash(`${c.text}|${c.username}|${c.createTime}`));
  const existingHashes = await findExistingHashes(supabase, hashes);

  const toInsert: Record<string, unknown>[] = [];
  let duplicates = 0;
  for (let i = 0; i < flat.length; i++) {
    if (existingHashes.has(hashes[i])) { duplicates++; continue; }
    toInsert.push({
      post_id: postId,
      project_id: projectId,
      text: flat[i].text,
      likes: flat[i].likes,
      source_tool: 'batch-collect',
      source_url: sourceUrl,
      content_hash: hashes[i],
      ...computeSampling(flat[i].likes),
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { error } = await supabase.from('comments').insert(toInsert);
    if (!error) {
      imported = toInsert.length;
    } else {
      for (const row of toInsert) {
        const { error: e } = await supabase.from('comments').insert(row);
        if (!e) imported++;
      }
    }
  }

  return { bvid, title: videoInfo.title, imported, duplicates };
}
