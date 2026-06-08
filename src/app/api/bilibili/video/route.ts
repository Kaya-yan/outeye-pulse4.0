import { NextRequest, NextResponse } from 'next/server';

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
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { code: -1, message: `Bilibili API HTTP ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Bilibili video API error:', msg);
    return NextResponse.json(
      { code: -1, message: `Failed to fetch video info: ${msg}` },
      { status: 500 }
    );
  }
}
