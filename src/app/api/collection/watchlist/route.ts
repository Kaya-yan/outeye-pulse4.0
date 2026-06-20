import { NextRequest, NextResponse } from 'next/server';
import { buildWatchlistEntry } from '@/lib/collection-watchlist';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, candidate } = body;

    if (!candidate || !candidate.platform || !candidate.platformId || !candidate.url) {
      return NextResponse.json({ error: 'candidate payload is incomplete' }, { status: 400 });
    }

    const entry = buildWatchlistEntry({
      projectId: project_id || null,
      candidate,
    });

    const { data, error } = await supabase
      .from('collection_watchlist')
      .insert(entry)
      .select('*')
      .single();

    if (error) {
      const msg = error.message.includes('collection_watchlist')
        ? 'collection_watchlist 表尚未创建，请先在 Supabase 中执行 014_create_collection_watchlist.sql 迁移'
        : error.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}
