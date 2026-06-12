import { NextRequest, NextResponse } from 'next/server';
import { searchBilibili } from '@/lib/bilibili-wbi';

/**
 * POST /api/collect/bilibili-search
 * Search Bilibili videos by keyword with optional time range filtering.
 * Body: { keyword, page?, pageSize?, order?, pubtimeBegin?, pubtimeEnd? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, page, pageSize, order, pubtimeBegin, pubtimeEnd } = body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    const result = await searchBilibili(keyword.trim(), {
      page: page || 1,
      pageSize: pageSize || 20,
      order: order || '',
      pubtimeBegin,
      pubtimeEnd,
    });

    if (!result) {
      return NextResponse.json({ error: '搜索失败，B站 API 可能限流，请稍后重试' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      keyword: keyword.trim(),
      total: result.total,
      pages: result.pages,
      page: page || 1,
      results: result.results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `搜索失败: ${msg}` }, { status: 500 });
  }
}
