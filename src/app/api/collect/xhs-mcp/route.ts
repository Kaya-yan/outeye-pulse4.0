import { NextRequest, NextResponse } from 'next/server';

const MCP_URL = process.env.XHS_MCP_URL || 'http://localhost:18060/mcp';

/**
 * POST /api/collect/xhs-mcp
 * Search XHS notes via xiaohongshu-mcp service.
 * Fallback when VPS collector is not available.
 *
 * Body: { action: 'search' | 'detail', keyword?, feed_id?, xsec_token?, page?, filters? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, keyword, feed_id, xsec_token, page = 1, filters } = body;

    // Check MCP service availability
    const mcpAvailable = await checkMcpHealth();
    if (!mcpAvailable) {
      return NextResponse.json({
        success: false,
        error: '小红书 MCP 服务未启动。请运行 scripts/start-mcp.sh 启动服务。',
        needMcp: true,
      });
    }

    if (action === 'search') {
      if (!keyword) {
        return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
      }

      const result = await mcpCall('search_feeds', {
        keyword: keyword.trim(),
        filters: filters || {},
      });

      if (!result) {
        return NextResponse.json({ error: 'MCP 搜索失败' }, { status: 502 });
      }

      // Transform MCP response to match our format
      const feeds = (result.feeds || result || []) as Record<string, unknown>[];
      const results = feeds.map((feed) => {
        const noteCard = feed.noteCard as Record<string, unknown> || {};
        const interactInfo = noteCard.interactInfo as Record<string, unknown> || {};
        return {
          id: feed.id,
          note_id: feed.id,
          title: noteCard.displayTitle || noteCard.title || '',
          author: (noteCard.user as Record<string, unknown>)?.nickname || '',
          url: `https://www.xiaohongshu.com/explore/${feed.id}`,
          views: Number(interactInfo.viewCount) || 0,
          likes: Number(interactInfo.likedCount) || 0,
          comments_count: Number(interactInfo.commentCount) || 0,
          cover_url: noteCard.cover ? (noteCard.cover as Record<string, unknown>).url : null,
          description: noteCard.desc || '',
          xsec_token: feed.xsecToken || '',
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

    if (action === 'detail') {
      if (!feed_id || !xsec_token) {
        return NextResponse.json({ error: '缺少 feed_id 或 xsec_token' }, { status: 400 });
      }

      const result = await mcpCall('get_feed_detail', {
        feed_id,
        xsec_token,
        load_all_comments: true,
        limit: 50,
      });

      if (!result) {
        return NextResponse.json({ error: 'MCP 获取详情失败' }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        detail: result,
        source: 'mcp',
      });
    }

    return NextResponse.json({ error: '未知 action，支持 search 或 detail' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `MCP 调用失败: ${msg}` }, { status: 500 });
  }
}

/**
 * GET /api/collect/xhs-mcp — check MCP service status
 */
export async function GET() {
  const mcpAvailable = await checkMcpHealth();
  return NextResponse.json({
    available: mcpAvailable,
    url: MCP_URL,
  });
}

async function checkMcpHealth(): Promise<boolean> {
  try {
    const resp = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    // MCP response format: { result: { content: [{ type: 'text', text: '...' }] } }
    const content = data?.result?.content;
    if (Array.isArray(content) && content.length > 0) {
      const textBlock = content.find((c: { type: string }) => c.type === 'text');
      if (textBlock?.text) {
        try {
          return JSON.parse(textBlock.text);
        } catch {
          return { raw: textBlock.text };
        }
      }
    }
    return data?.result || null;
  } catch {
    return null;
  }
}
