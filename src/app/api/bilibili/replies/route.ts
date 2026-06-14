import { NextRequest, NextResponse } from 'next/server';
import { BILI_HEADERS } from '@/lib/bilibili-wbi';

const COMMON_HEADERS = BILI_HEADERS;

/**
 * GET /api/bilibili/replies
 * Fetch one page of Bilibili comments.
 *
 * Params:
 *   bvid  - video BV号 (will resolve aid internally)
 *   aid   - video aid (direct, skips video info fetch — preferred for pagination)
 *   cursor - pagination cursor (default '0')
 *   mode  - 2=time-ordered, 3=hot (default '3')
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bvid = searchParams.get('bvid');
  const aidParam = searchParams.get('aid');
  const cursor = searchParams.get('cursor') || '0';
  const mode = searchParams.get('mode') || '3';
  const pn = searchParams.get('pn'); // page-number fallback for cursor pagination

  if (!bvid && !aidParam) {
    return NextResponse.json(
      { code: -1, message: 'bvid or aid parameter is required' },
      { status: 400 }
    );
  }

  try {
    let aid: number;

    if (aidParam) {
      // Fast path: aid provided directly
      aid = Number(aidParam);
    } else {
      // Slow path: resolve aid from bvid
      const viewResponse = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        { headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000) },
      );
      if (!viewResponse.ok) {
        return NextResponse.json(
          { code: -1, message: `Bilibili view API HTTP ${viewResponse.status}` },
          { status: viewResponse.status }
        );
      }
      const viewData = await viewResponse.json();
      if (viewData.code !== 0) {
        return NextResponse.json(viewData);
      }
      aid = viewData.data?.aid;
    }

    // Build reply URL — supports cursor-based (default) and pn-based (fallback) pagination
    let replyUrl: string;
    if (pn) {
      // pn-based fallback: traditional page-number pagination
      replyUrl = `https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=${mode}&pn=${pn}&ps=20`;
      console.log('[Bilibili Replies]', { aid, pn, mode });
    } else {
      // Cursor-based pagination (preferred)
      const numericCursor = /^\d+$/.test(cursor) ? Number(cursor) : cursor;
      const paginationStr = encodeURIComponent(JSON.stringify({ next_offset: numericCursor }));
      replyUrl = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=${mode}&pagination_str=${paginationStr}`;
      console.log('[Bilibili Replies]', { aid, cursor: numericCursor, mode });
    }

    const replyResponse = await fetch(replyUrl, { headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000) });

    if (!replyResponse.ok) {
      return NextResponse.json(
        { code: -1, message: `Bilibili reply API HTTP ${replyResponse.status}` },
        { status: replyResponse.status }
      );
    }

    const replyData = await replyResponse.json();

    if (replyData.code !== 0) {
      console.error('[Bilibili Replies] API error:', replyData.code, replyData.message);
      return NextResponse.json(replyData);
    }

    const replies = replyData.data?.replies || [];
    const cursorInfo = replyData.data?.cursor;
    const pageInfo = replyData.data?.page;

    let hasMore: boolean;
    let nextCursor: string | null;
    let total: number;

    if (pn) {
      // pn-based response: use page.count for total, check if current page < total pages
      total = pageInfo?.count || cursorInfo?.all_count || 0;
      const currentPage = Number(pn);
      const totalPages = Math.ceil(total / 20);
      hasMore = currentPage < totalPages && replies.length > 0;
      nextCursor = hasMore ? String(currentPage + 1) : null;
    } else {
      // Cursor-based response
      hasMore = cursorInfo?.is_end === false;
      nextCursor = hasMore ? String(cursorInfo.next) : null;
      total = cursorInfo?.all_count || 0;
    }

    console.log('[Bilibili Replies] Result:', { mode, repliesCount: replies.length, total, hasMore, nextCursor });

    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        replies,
        total,
        hasMore,
        nextCursor,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { code: -1, message: `Failed to fetch replies: ${msg}` },
      { status: 500 }
    );
  }
}
