import { NextRequest, NextResponse } from 'next/server';
import { searchBilibili, type BiliSearchResult } from '@/lib/bilibili-wbi';

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

    const kw = keyword.trim();

    const result = await searchBilibili(kw, {
      page: page || 1,
      pageSize: pageSize || 20,
      order: order || '',
      pubtimeBegin,
      pubtimeEnd,
    });

    if (!result) {
      return NextResponse.json({ error: '搜索失败，B站 API 可能限流，请稍后重试' }, { status: 502 });
    }

    // Filter out results with low keyword relevance
    const filtered = filterByRelevance(result.results, kw);

    return NextResponse.json({
      success: true,
      keyword: kw,
      total: result.total,
      total_note: result.total >= 1000 ? 'B站搜索上限，实际可能更多' : null,
      pages: result.pages,
      page: page || 1,
      results: filtered,
      raw_count: result.results.length,
      filtered_count: filtered.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `搜索失败: ${msg}` }, { status: 500 });
  }
}

/**
 * Filter search results by keyword relevance.
 * Removes results where the keyword doesn't appear in title, description, or tags.
 * Also handles multi-keyword queries (any keyword match is sufficient).
 */
function filterByRelevance(results: BiliSearchResult[], keyword: string): BiliSearchResult[] {
  // Split keyword by common separators for multi-keyword support
  const keywords = keyword
    .split(/[\s,，、;；+/]+/)
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);

  if (keywords.length === 0) return results;

  return results.filter(r => {
    const title = (r.title || '').toLowerCase();
    const desc = (r.description || '').toLowerCase();
    const tags = (r.tag || '').toLowerCase();
    const combined = `${title} ${desc} ${tags}`;

    // At least one keyword must appear in title, description, or tags
    return keywords.some(kw => combined.includes(kw));
  });
}
