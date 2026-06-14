/**
 * Client-side Bilibili comment collector.
 * Client-driven pagination loop — each API call stays under 5 seconds.
 */

import { sleep } from '@/lib/hash';
import type { BiliReply } from '@/lib/bilibili-wbi';

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


// ── Pagination helpers ──────────────────────────────────────────

interface PageResult {
  replies: BiliReply[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
}

async function fetchOnePage(
  aid: number,
  cursor: string,
  mode: number,
  signal?: AbortSignal,
): Promise<PageResult> {
  const res = await fetch(`/api/bilibili/replies?aid=${aid}&cursor=${cursor}&mode=${mode}`, { signal });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`B站 API code ${data.code}`);
  return {
    replies: data.data?.replies || [],
    hasMore: data.data?.hasMore ?? false,
    nextCursor: data.data?.nextCursor ?? null,
    total: data.data?.total ?? 0,
  };
}

/**
 * Collect all comments for a Bilibili video using client-side pagination.
 * Supports AbortController for cancellation.
 */
export async function collectBilibiliComments(
  params: {
    bvid?: string;
    url?: string;
    projectId?: string;
    maxComments?: number;
    signal?: AbortSignal;
  },
  onProgress: (p: CollectProgress) => void,
): Promise<CollectResult> {
  const maxComments = params.maxComments || 50000;
  const { signal } = params;

  const checkAborted = () => {
    if (signal?.aborted) throw new Error('采集已取消');
  };

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
    checkAborted();
    const res = await fetch('/api/collect/bilibili', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bvid: params.bvid, url: params.url, project_id: params.projectId }),
      signal,
    });
    initData = await res.json();
    if (initData.error) throw new Error(initData.error);
  } catch (err) {
    if (signal?.aborted) {
      return { success: false, postId: '', videoTitle: '', collected: 0, imported: 0, duplicates: 0, filtered: 0, error: '采集已取消' };
    }
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
    checkAborted();
    const hotData = await fetchOnePage(aid, '0', 3, signal);
    addReplies(hotData.replies);
    if (hotData.total > 0) {
      onProgress({ phase: 'fetching', message: `已采集 ${allReplies.length} 条热门评论，继续翻页...`, collected: allReplies.length, estimated: hotData.total });
    }
  } catch (e) { console.warn('[Collect] Hot comments fetch failed:', e); }

  await sleep(500);

  // Phase 2b: Time-ordered comments (mode=2, paginate)
  const estimatedTotal = video_stats?.replies || maxComments;
  const maxPages = Math.min(Math.ceil(maxComments / 20), Math.ceil(estimatedTotal / 20) + 10);
  let consecutiveEmpty = 0;
  let cursor = '0';
  let cursorFailed = false; // track if cursor pagination is broken

  for (let page = 0; page < maxPages && allReplies.length < maxComments; page++) {
    checkAborted();
    let retries = 0;
    let success = false;

    while (retries < 3 && !success) {
      checkAborted();
      try {
        const result = await fetchOnePage(aid, cursor, 2, signal);

        if (result.replies.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 3) break;
          success = true;
        } else {
          consecutiveEmpty = 0;
          addReplies(result.replies);
        }

        onProgress({
          phase: 'fetching',
          message: `已采集 ${allReplies.length} 条评论（第 ${page + 1} 页）...`,
          collected: allReplies.length,
          estimated: estimatedTotal,
        });

        if (!result.hasMore) {
          consecutiveEmpty = 999;
          break;
        }

        // If cursor didn't advance (same value), mark cursor as broken
        if (result.nextCursor === cursor) {
          console.warn('[Collect] Cursor did not advance, switching to pn fallback');
          cursorFailed = true;
          break;
        }

        cursor = result.nextCursor || '0';
        success = true;
      } catch (err) {
        if (signal?.aborted) {
          return { success: false, postId, videoTitle: video_title, collected: allReplies.length, imported: 0, duplicates: 0, filtered: 0, error: '采集已取消' };
        }
        retries++;
        console.warn(`[Collect] Page ${page + 1} attempt ${retries} failed:`, err);
        if (retries < 3) await sleep(1000 * retries);
      }
    }

    if (consecutiveEmpty >= 3 || cursorFailed) break;
    await sleep(800 + Math.random() * 1200);
  }

  // Phase 2c: Fallback — if cursor pagination produced very few results, try pn-based
  if (allReplies.length < 100 || (allReplies.length < 50 && allReplies.length < estimatedTotal * 0.1)) {
    console.log('[Collect] Cursor pagination yielded only', allReplies.length, 'comments. Trying pn fallback...');
    onProgress({ phase: 'fetching', message: `切换到备用分页模式...`, collected: allReplies.length, estimated: estimatedTotal });

    for (let pn = 2; pn <= maxPages && allReplies.length < maxComments; pn++) {
      checkAborted();
      try {
        const res = await fetch(`/api/bilibili/replies?aid=${aid}&mode=2&pn=${pn}`, { signal });
        const data = await res.json();
        if (data.code !== 0 || !data.data?.replies || data.data.replies.length === 0) break;

        const before = allReplies.length;
        addReplies(data.data.replies);
        if (allReplies.length === before) break; // no new comments

        onProgress({ phase: 'fetching', message: `已采集 ${allReplies.length} 条评论（备用第 ${pn} 页）...`, collected: allReplies.length, estimated: estimatedTotal });

        if (!data.data.hasMore) break;
        await sleep(800 + Math.random() * 1200);
      } catch (err) {
        if (signal?.aborted) break;
        console.warn(`[Collect] pn fallback page ${pn} failed:`, err);
        break;
      }
    }
  }

  // ── Phase 3: Sub-replies for top comments ──
  const SUB_REPLY_COUNT = 30;
  const topReplies = allReplies
    .filter(r => r.rcount > 0)
    .sort((a, b) => b.like - a.like)
    .slice(0, SUB_REPLY_COUNT);

  if (topReplies.length > 0) {
    checkAborted();
    onProgress({ phase: 'sub-replies', message: `采集 ${topReplies.length} 条热门评论的回复...`, collected: allReplies.length });

    // Fetch sub-replies with concurrency limit of 5
    const CONCURRENCY = 5;
    for (let i = 0; i < topReplies.length; i += CONCURRENCY) {
      checkAborted();
      const batch = topReplies.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (parent) => {
        try {
          const res = await fetch(`/api/bilibili/sub-replies?aid=${aid}&root=${parent.rpid}`, { signal });
          const data = await res.json();
          if (data.code === 0 && data.data?.replies) {
            parent.replies = data.data.replies;
          }
        } catch { /* skip */ }
      }));
      if (i + CONCURRENCY < topReplies.length) await sleep(300);
    }
  }

  // ── Flatten ──
  const flat: { text: string; likes: number; username: string; createTime: string; rpid: number }[] = [];
  const pushIfValid = (r: BiliReply) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2) {
      flat.push({ text, likes: r.like || 0, username: r.member?.uname || '', createTime: r.ctime ? new Date(r.ctime * 1000).toISOString() : '0', rpid: r.rpid });
    }
  };
  for (const r of allReplies) {
    pushIfValid(r);
    if (r.replies) for (const sr of r.replies) pushIfValid(sr);
  }

  // ── Phase 4: Import to DB (chunked) ──
  onProgress({ phase: 'importing', message: `正在导入 ${flat.length} 条评论...`, collected: flat.length });

  const IMPORT_CHUNK = 500;
  let totalImported = 0;
  let totalDuplicates = 0;
  let totalFiltered = 0;
  const importErrors: string[] = [];

  for (let i = 0; i < flat.length; i += IMPORT_CHUNK) {
    checkAborted();
    const chunk = flat.slice(i, i + IMPORT_CHUNK);
    const chunkLabel = `${Math.floor(i / IMPORT_CHUNK) + 1}/${Math.ceil(flat.length / IMPORT_CHUNK)}`;

    onProgress({
      phase: 'importing',
      message: `正在导入 第${chunkLabel}批（${chunk.length} 条）...`,
      collected: flat.length,
    });

    try {
      const res = await fetch('/api/collect/bilibili/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, projectId, sourceUrl, comments: chunk }),
        signal,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      totalImported += data.imported || 0;
      totalDuplicates += data.duplicates || 0;
      totalFiltered += data.filtered || 0;
      if (data.errors) importErrors.push(...data.errors);
    } catch (err) {
      if (signal?.aborted) {
        return { success: totalImported > 0, postId, videoTitle: video_title, collected: allReplies.length, imported: totalImported, duplicates: totalDuplicates, filtered: totalFiltered, error: '采集已取消（部分数据已导入）' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      importErrors.push(`批次 ${chunkLabel}: ${msg}`);
    }
  }

  onProgress({ phase: 'done', message: '采集完成', collected: flat.length });

  return {
    success: totalImported > 0,
    postId,
    videoTitle: video_title,
    videoStats: video_stats,
    collected: allReplies.length,
    imported: totalImported,
    duplicates: totalDuplicates,
    filtered: totalFiltered,
    error: importErrors.length > 0 ? importErrors.join('; ') : undefined,
  };
}
