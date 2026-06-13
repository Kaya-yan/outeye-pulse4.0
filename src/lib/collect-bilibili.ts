/**
 * Client-side Bilibili comment collector.
 * Replaces the synchronous serverless approach with a client-driven pagination loop.
 * Each API call stays under 5 seconds — no 504 timeouts.
 */

export interface CollectProgress {
  phase: 'init' | 'fetching' | 'sub-replies' | 'importing' | 'done' | 'error';
  message: string;
  collected: number;
  estimated?: number;
}

export interface CollectResult {
  success: boolean;
  postId: string;
  videoTitle: string;
  videoStats?: { views?: number; likes?: number; replies?: number };
  collected: number;
  imported: number;
  duplicates: number;
  filtered: number;
  error?: string;
}

interface BiliReply {
  rpid: number;
  content: { message: string };
  like: number;
  member: { uname: string };
  ctime: number;
  rcount: number;
  replies?: BiliReply[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Collect all comments for a Bilibili video using client-side pagination.
 */
export async function collectBilibiliComments(
  params: {
    bvid?: string;
    url?: string;
    projectId?: string;
    maxComments?: number;
  },
  onProgress: (p: CollectProgress) => void,
): Promise<CollectResult> {
  const maxComments = params.maxComments || 50000;

  // ── Phase 1: Init (create post, get aid) ──
  onProgress({ phase: 'init', message: '获取视频信息...', collected: 0 });

  let initData: {
    success: boolean;
    postId: string;
    aid: number;
    bvid: string;
    sourceUrl: string;
    project_id: string | null;
    video_title: string;
    video_stats?: { views?: number; likes?: number; replies?: number };
    error?: string;
  };

  try {
    const res = await fetch('/api/collect/bilibili', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bvid: params.bvid,
        url: params.url,
        project_id: params.projectId,
      }),
    });
    initData = await res.json();
    if (initData.error) {
      throw new Error(initData.error);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ phase: 'error', message: `初始化失败: ${msg}`, collected: 0 });
    return { success: false, postId: '', videoTitle: '', collected: 0, imported: 0, duplicates: 0, filtered: 0, error: msg };
  }

  const { postId, aid, sourceUrl, video_title, video_stats } = initData;
  const projectId = initData.project_id;

  // ── Phase 2: Paginated comment fetching ──
  onProgress({ phase: 'fetching', message: '开始采集评论...', collected: 0, estimated: video_stats?.replies });

  const allReplies: BiliReply[] = [];
  const seenRpids = new Set<number>();

  const addReplies = (replies: BiliReply[]) => {
    for (const r of replies) {
      if (!seenRpids.has(r.rpid)) {
        seenRpids.add(r.rpid);
        allReplies.push(r);
      }
    }
  };

  // Phase 2a: Hot comments (mode=3, first page)
  try {
    const hotRes = await fetch(`/api/bilibili/replies?aid=${aid}&cursor=0&mode=3`);
    const hotData = await hotRes.json();
    if (hotData.code === 0 && hotData.data?.replies) {
      addReplies(hotData.data.replies);
    }
  } catch { /* non-fatal */ }

  onProgress({
    phase: 'fetching',
    message: `已采集 ${allReplies.length} 条热门评论，继续翻页...`,
    collected: allReplies.length,
    estimated: video_stats?.replies,
  });

  await sleep(500);

  // Phase 2b: Time-ordered comments (mode=2, paginate)
  let cursor = '0';
  const estimatedTotal = video_stats?.replies || maxComments;
  const maxPages = Math.min(Math.ceil(maxComments / 20), Math.ceil(estimatedTotal / 20) + 10);
  let consecutiveEmpty = 0;

  for (let page = 0; page < maxPages && allReplies.length < maxComments; page++) {
    let retries = 0;
    let success = false;

    while (retries < 3 && !success) {
      try {
        const res = await fetch(`/api/bilibili/replies?aid=${aid}&cursor=${cursor}&mode=2`);
        const data = await res.json();

        if (data.code !== 0) {
          retries++;
          if (retries < 3) await sleep(1000 * retries);
          continue;
        }

        const pageReplies = data.data?.replies || [];

        if (pageReplies.length === 0) {
          consecutiveEmpty++;
          // Bilibili API occasionally returns empty pages — don't give up immediately
          if (consecutiveEmpty >= 3) {
            console.log(`[Collect] ${consecutiveEmpty} consecutive empty pages, stopping.`);
            break;
          }
          success = true; // count as success but don't add anything
        } else {
          consecutiveEmpty = 0;
          addReplies(pageReplies);
        }

        onProgress({
          phase: 'fetching',
          message: `已采集 ${allReplies.length} 条评论（第 ${page + 1} 页）...`,
          collected: allReplies.length,
          estimated: estimatedTotal,
        });

        if (!data.data.hasMore) {
          console.log('[Collect] API reports no more pages.');
          consecutiveEmpty = 999; // force exit
          break;
        }
        cursor = data.data.nextCursor;
        success = true;
      } catch (err) {
        retries++;
        console.warn(`[Collect] Page ${page + 1} attempt ${retries} failed:`, err);
        if (retries < 3) await sleep(1000 * retries);
      }
    }

    if (consecutiveEmpty >= 3) break;

    // Random delay to avoid rate limiting
    await sleep(800 + Math.random() * 1200);
  }

  // ── Phase 3: Sub-replies for top comments ──
  const topReplies = allReplies
    .filter(r => r.rcount > 0)
    .sort((a, b) => b.like - a.like)
    .slice(0, 10);

  if (topReplies.length > 0) {
    onProgress({
      phase: 'sub-replies',
      message: `采集 ${topReplies.length} 条热门评论的回复...`,
      collected: allReplies.length,
    });

    for (const parent of topReplies) {
      try {
        const res = await fetch(`/api/bilibili/sub-replies?aid=${aid}&root=${parent.rpid}`);
        const data = await res.json();
        if (data.code === 0 && data.data?.replies) {
          parent.replies = data.data.replies;
        }
        await sleep(300);
      } catch { /* skip */ }
    }
  }

  // ── Flatten ──
  const flat: { text: string; likes: number; username: string; createTime: string; rpid: number }[] = [];
  const pushIfValid = (r: BiliReply) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2) {
      flat.push({
        text,
        likes: r.like || 0,
        username: r.member?.uname || '',
        createTime: r.ctime ? new Date(r.ctime * 1000).toISOString() : '',
        rpid: r.rpid,
      });
    }
  };
  for (const r of allReplies) {
    pushIfValid(r);
    if (r.replies) {
      for (const sr of r.replies) pushIfValid(sr);
    }
  }

  // ── Phase 4: Import to DB ──
  onProgress({
    phase: 'importing',
    message: `正在导入 ${flat.length} 条评论...`,
    collected: flat.length,
  });

  try {
    const res = await fetch('/api/collect/bilibili/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId,
        projectId,
        sourceUrl,
        comments: flat,
      }),
    });
    const importData = await res.json();

    if (importData.error) {
      throw new Error(importData.error);
    }

    onProgress({
      phase: 'done',
      message: '采集完成',
      collected: flat.length,
    });

    return {
      success: true,
      postId,
      videoTitle: video_title,
      videoStats: video_stats,
      collected: allReplies.length,
      imported: importData.imported || 0,
      duplicates: importData.duplicates || 0,
      filtered: importData.filtered || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ phase: 'error', message: `导入失败: ${msg}`, collected: flat.length });
    return {
      success: false,
      postId,
      videoTitle: video_title,
      collected: allReplies.length,
      imported: 0,
      duplicates: 0,
      filtered: 0,
      error: msg,
    };
  }
}
