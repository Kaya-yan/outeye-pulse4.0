import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

/**
 * POST /api/collect/xhs-search
 * Search XHS notes by keyword.
 * Three modes (priority order):
 *   1. VPS collector proxy
 *   2. MCP service (xiaohongshu-mcp)
 *   3. Cached search_results table
 * Body: { keyword, page?, pageSize?, timeRange?, dateFrom?, dateTo? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, page = 1, pageSize = 20, timeRange, dateFrom, dateTo } = body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    // Compute time filter boundaries
    let timeBegin: string | null = null;
    let timeEnd: string | null = null;
    if (timeRange === 'custom' && (dateFrom || dateTo)) {
      if (dateFrom) timeBegin = new Date(dateFrom + '-01').toISOString();
      if (dateTo) {
        const d = new Date(dateTo + '-01');
        timeEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      }
    } else if (timeRange && timeRange !== 'all' && timeRange !== 'custom') {
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
      } catch { /* fall through */ }
    }

    // Mode 2: Try MCP service (xiaohongshu-mcp)
    const mcpUrl = process.env.XHS_MCP_URL || 'http://localhost:18060/mcp';
    try {
      const mcpResp = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'tools/call',
          params: {
            name: 'search_feeds',
            arguments: { keyword: keyword.trim() },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (mcpResp.ok) {
        const mcpData = await mcpResp.json();
        const content = mcpData?.result?.content;
        if (Array.isArray(content) && content.length > 0) {
          const textBlock = content.find((c: { type: string }) => c.type === 'text');
          if (textBlock?.text) {
            const parsed = JSON.parse(textBlock.text);
            const feeds = parsed.feeds || parsed || [];
            const results = feeds.map((feed: Record<string, unknown>) => {
              const noteCard = (feed.noteCard as Record<string, unknown>) || {};
              const interactInfo = (noteCard.interactInfo as Record<string, unknown>) || {};
              return {
                id: feed.id,
                note_id: feed.id,
                title: (noteCard.displayTitle as string) || '',
                author: ((noteCard.user as Record<string, unknown>)?.nickname as string) || '',
                url: `https://www.xiaohongshu.com/explore/${feed.id}`,
                views: Number(interactInfo.viewCount) || 0,
                likes: Number(interactInfo.likedCount) || 0,
                comments_count: Number(interactInfo.commentCount) || 0,
                cover_url: noteCard.cover ? (noteCard.cover as Record<string, unknown>).url : null,
                description: (noteCard.desc as string) || '',
                xsec_token: (feed.xsecToken as string) || '',
              };
            });
            return NextResponse.json({
              success: true,
              keyword: keyword.trim(),
              total: results.length,
              results,
              source: 'mcp',
            });
          }
        }
      }
    } catch { /* MCP not available */ }

    // Mode 3: Read from search_results table (populated by VPS cron jobs)
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

    // No data source available
    return NextResponse.json({
      success: false,
      error: '小红书搜索需要配置 VPS 采集器或启动 MCP 服务。请运行 scripts/start-mcp.sh 或部署 VPS 采集器。',
      needVps: true,
      keyword: keyword.trim(),
      results: [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `搜索失败: ${msg}` }, { status: 500 });
  }
}
