import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

/**
 * POST /api/collect/xhs-search
 * Search XHS notes by keyword.
 * Two modes:
 *   1. If VPS collector is configured, proxy to it
 *   2. Otherwise, read from search_results table (populated by VPS cron)
 * Body: { keyword, page?, pageSize? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, page = 1, pageSize = 20, timeRange } = body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    // Compute time filter boundaries
    let timeBegin: string | null = null;
    let timeEnd: string | null = null;
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      const days = timeRange === '1y' ? 365 : timeRange === '6m' ? 180 : timeRange === '3m' ? 90 : 30;
      timeBegin = new Date(now.getTime() - days * 86400000).toISOString();
      timeEnd = now.toISOString();
    }

    // Mode 1: Try proxying to VPS collector
    const vpsUrl = process.env.VPS_COLLECTOR_URL;
    if (vpsUrl) {
      try {
        const resp = await fetch(`${vpsUrl}/api/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'xhs', keyword: keyword.trim(), page, pageSize, timeBegin, timeEnd }),
          signal: AbortSignal.timeout(30000),
        });
        if (resp.ok) {
          const data = await resp.json();
          return NextResponse.json({ success: true, ...data, source: 'vps' });
        }
      } catch { /* fall through to local search */ }
    }

    // Mode 2: Read from search_results table (populated by VPS cron jobs)
    // Find the most recent completed search task for this keyword
    const taskQuery = supabase
      .from('search_tasks')
      .select('id, result_count, total_comments, total_views, total_likes')
      .eq('platform', 'xhs')
      .eq('keyword', keyword.trim())
      .eq('status', 'completed');
    if (timeBegin) taskQuery.gte('created_at', timeBegin);
    if (timeEnd) taskQuery.lte('created_at', timeEnd);
    const { data: task } = await taskQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (task) {
      const resultsQuery = supabase
        .from('search_results')
        .select('*')
        .eq('search_task_id', task.id);
      if (timeBegin) resultsQuery.gte('published_at', timeBegin);
      if (timeEnd) resultsQuery.lte('published_at', timeEnd);
      const { data: results } = await resultsQuery
        .order('views', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      return NextResponse.json({
        success: true,
        keyword: keyword.trim(),
        total: task.result_count,
        total_comments: task.total_comments,
        total_views: task.total_views,
        total_likes: task.total_likes,
        results: results || [],
        source: 'cached',
      });
    }

    // No VPS and no cached results
    return NextResponse.json({
      success: false,
      error: '小红书搜索需要配置 VPS 采集器。请先部署 scripts/vps-collector 并运行关键词搜索。',
      needVps: true,
      keyword: keyword.trim(),
      results: [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `搜索失败: ${msg}` }, { status: 500 });
  }
}
