import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bvid = searchParams.get('bvid');
  const cursor = searchParams.get('cursor') || '0';
  const mode = searchParams.get('mode') || '3'; // 2=time, 3=hot

  if (!bvid) {
    return NextResponse.json(
      { code: -1, message: 'bvid parameter is required' },
      { status: 400 }
    );
  }

  try {
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com',
      'Accept': 'application/json',
    };

    // Get aid from bvid
    const viewResponse = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: commonHeaders }
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

    const aid = viewData.data?.aid;

    const paginationStr = encodeURIComponent(JSON.stringify({ next_offset: cursor }));
    const replyUrl = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=${mode}&pagination_str=${paginationStr}`;
    console.log('[Bilibili API] 请求评论:', { aid, cursor, mode, url: replyUrl.slice(0, 120) });

    const replyResponse = await fetch(replyUrl, { headers: commonHeaders });

    if (!replyResponse.ok) {
      return NextResponse.json(
        { code: -1, message: `Bilibili reply API HTTP ${replyResponse.status}` },
        { status: replyResponse.status }
      );
    }

    const replyData = await replyResponse.json();

    if (replyData.code !== 0) {
      console.error('[Bilibili API] 评论接口错误:', replyData.code, replyData.message);
      return NextResponse.json(replyData);
    }

    const replies = replyData.data?.replies || [];
    const cursorInfo = replyData.data?.cursor;
    const hasMore = cursorInfo?.is_end === false;
    const nextCursor = hasMore ? String(cursorInfo.next) : null;

    console.log('[Bilibili API] 返回:', {
      mode,
      repliesCount: replies.length,
      total: cursorInfo?.all_count,
      isEnd: cursorInfo?.is_end,
      nextCursor,
      firstRpid: replies[0]?.rpid,
      firstLikes: replies[0]?.like,
    });

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
    console.error('Bilibili replies API error:', msg);
    return NextResponse.json(
      { code: -1, message: `Failed to fetch replies: ${msg}` },
      { status: 500 }
    );
  }
}
