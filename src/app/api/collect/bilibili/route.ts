import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, getSamplingTier } from '@/lib/hash';

const supabase = createServerClient();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Accept': 'application/json',
};

interface BiliReply {
  rpid: number;
  content: { message: string };
  like: number;
  member: { uname: string };
  ctime: number;
  rcount: number;
  replies?: BiliReply[];
}

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

    // Step 1: Fetch video info
    const videoInfo = await fetchVideoInfo(bvid);
    if (!videoInfo) {
      return NextResponse.json({ error: '无法获取视频信息，BV号可能无效' }, { status: 400 });
    }

    const aid = videoInfo.aid;
    const sourceUrl = `https://www.bilibili.com/video/${bvid}`;

    // Step 2: Ensure project exists
    if (!project_id) {
      const { data: defaultProject } = await supabase
        .from('projects')
        .select('id')
        .limit(1)
        .single();
      project_id = defaultProject?.id || null;
    }

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
          author: videoInfo.owner?.name || '',
          likes: videoInfo.stat?.like || 0,
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

    for (const parent of topReplies) {
      try {
        const subResult = await fetchSubReplies(aid, parent.rpid);
        parent.replies = subResult;
        await sleep(300 + Math.random() * 500);
      } catch {
        // Sub-reply fetch failure is non-fatal
      }
    }

    // Step 6: Flatten and import
    const flatComments = flattenReplies(allReplies, sourceUrl);
    const importResult = await importComments(flatComments, postId, project_id);

    return NextResponse.json({
      success: true,
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
      post_id: postId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `采集失败: ${msg}` }, { status: 500 });
  }
}

// ─── B站 API helpers ──────────────────────────────────────────

async function fetchVideoInfo(bvid: string) {
  try {
    const resp = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: HEADERS, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== 0) return null;
    return data.data;
  } catch {
    return null;
  }
}

async function fetchReplies(
  oid: number,
  nextOffset: number,
  mode: number
): Promise<{ replies: BiliReply[]; nextCursor: number; isEnd: boolean }> {
  const paginationStr = encodeURIComponent(JSON.stringify({ next_offset: String(nextOffset) }));
  const url = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${oid}&mode=${mode}&pagination_str=${paginationStr}`;

  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`B站 API HTTP ${resp.status}`);

  const data = await resp.json();
  if (data.code !== 0) throw new Error(`B站 API code ${data.code}: ${data.message}`);

  const replies = data.data?.replies || [];
  const cursor = data.data?.cursor || {};

  return {
    replies,
    nextCursor: cursor.next || 0,
    isEnd: cursor.is_end === true,
  };
}

async function fetchSubReplies(oid: number, rootRpid: number): Promise<BiliReply[]> {
  const url = `https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${oid}&root=${rootRpid}&ps=20&pn=1`;
  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return [];

  const data = await resp.json();
  if (data.code !== 0) return [];

  return data.data?.replies || [];
}

// ─── Import helpers ───────────────────────────────────────────

function flattenReplies(replies: BiliReply[], sourceUrl: string) {
  const adPattern = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;
  const result: {
    text: string; likes: number; username: string; createTime: string; sourceUrl: string; rpid: number;
  }[] = [];

  const pushIfValid = (r: BiliReply) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2 && !adPattern.test(text)) {
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

  // Batch check for existing content hashes (chunk to avoid URL length limits)
  const hashes = comments.map(c => simpleHash(`${c.text}|${c.username}|${c.createTime}`));
  const existingHashes = new Set<string>();

  const CHUNK_SIZE = 500;
  for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
    const chunk = hashes.slice(i, i + CHUNK_SIZE);
    const { data: rows } = await supabase
      .from('comments')
      .select('content_hash')
      .in('content_hash', chunk);
    for (const r of rows || []) {
      if (r.content_hash) existingHashes.add(r.content_hash);
    }
  }

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
      username: c.username,
      create_time: c.createTime,
      platform: 'bilibili',
      source_id: String(c.rpid),
      source_url: c.sourceUrl,
      content_hash: hash,
      sampling_tier: getSamplingTier(c.likes),
      is_sampled: c.likes >= 100 || Math.random() < 0.5,
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

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
