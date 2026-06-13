import { NextRequest, NextResponse } from 'next/server';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Accept': 'application/json',
};

/**
 * GET /api/bilibili/sub-replies
 * Fetch sub-replies (reply threads) for a parent comment.
 *
 * Params:
 *   aid  - video aid (required)
 *   root - parent rpid (required)
 *   pn   - page number (default 1)
 *   ps   - page size (default 20)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const aid = searchParams.get('aid');
  const root = searchParams.get('root');
  const pn = searchParams.get('pn') || '1';
  const ps = searchParams.get('ps') || '20';

  if (!aid || !root) {
    return NextResponse.json(
      { code: -1, message: 'aid and root parameters are required' },
      { status: 400 }
    );
  }

  try {
    const url = `https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${aid}&root=${root}&ps=${ps}&pn=${pn}`;
    const resp = await fetch(url, { headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000) });

    if (!resp.ok) {
      return NextResponse.json(
        { code: -1, message: `Bilibili sub-reply API HTTP ${resp.status}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    if (data.code !== 0) {
      return NextResponse.json(data);
    }

    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        replies: data.data?.replies || [],
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { code: -1, message: `Failed to fetch sub-replies: ${msg}` },
      { status: 500 }
    );
  }
}
