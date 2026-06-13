import { NextRequest, NextResponse } from 'next/server';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Accept': 'application/json',
};

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

    const paginationStr = encodeURIComponent(JSON.stringify({ next_offset: cursor }));
    const replyUrl = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=${mode}&pagination_str=${paginationStr}`;

    const replyResponse = await fetch(replyUrl, { headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000) });

    if (!replyResponse.ok) {
      return NextResponse.json(
        { code: -1, message: `Bilibili reply API HTTP ${replyResponse.status}` },
        { status: replyResponse.status }
      );
    }

    const replyData = await replyResponse.json();

    if (replyData.code !== 0) {
      return NextResponse.json(replyData);
    }

    const replies = replyData.data?.replies || [];
    const cursorInfo = replyData.data?.cursor;
    const hasMore = cursorInfo?.is_end === false;
    const nextCursor = hasMore ? String(cursorInfo.next) : null;

    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        replies,
        total: cursorInfo?.all_count || 0,
        hasMore,
        nextCursor,
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
