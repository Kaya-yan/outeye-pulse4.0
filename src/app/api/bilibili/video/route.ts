import { NextRequest, NextResponse } from 'next/server';
import { fetchVideoInfo } from '@/lib/bilibili-wbi';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bvid = searchParams.get('bvid');

  if (!bvid) {
    return NextResponse.json(
      { code: -1, message: 'bvid parameter is required' },
      { status: 400 }
    );
  }

  try {
    const data = await fetchVideoInfo(bvid);
    if (!data) {
      return NextResponse.json(
        { code: -1, message: 'Video not found or API error' },
        { status: 404 }
      );
    }
    return NextResponse.json({ code: 0, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Bilibili video API error:', msg);
    return NextResponse.json(
      { code: -1, message: `Failed to fetch video info: ${msg}` },
      { status: 500 }
    );
  }
}
