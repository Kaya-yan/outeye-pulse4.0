import { NextRequest, NextResponse } from 'next/server';
import { createBookmarkletRunArtifacts } from '@/lib/bookmarklet-run';
import { mergeRunsWithLatestEvents } from '@/lib/collection-runs-list';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      source,
      project_id,
      projectId,
      platform,
    } = body;

    if (source !== 'bookmarklet') {
      return NextResponse.json({ error: 'only bookmarklet source is supported currently' }, { status: 400 });
    }

    if (!platform || !['bilibili', 'xhs'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be bilibili or xhs' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const artifacts = createBookmarkletRunArtifacts({
      project_id: project_id || projectId || null,
      platform,
      now,
    });

    const { data: runData, error: runError } = await supabase
      .from('collection_runs')
      .insert(artifacts.run)
      .select('*')
      .single();

    if (runError) {
      const msg = runError.message.includes('collection_runs')
        ? 'collection_runs 表尚未创建，请先在 Supabase 中执行 013_create_collection_runs.sql 迁移'
        : runError.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    await supabase
      .from('collection_run_events')
      .insert({
        collection_run_id: runData.id,
        ...artifacts.event,
      });

    return NextResponse.json({ run: runData, success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const statusParam = request.nextUrl.searchParams.get('status');
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 20);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitParam) ? limitParam : 20));

  let query = supabase
    .from('collection_runs')
    .select('id, project_id, platform, source, mode, initiator, target_type, target_value, status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (statusParam) {
    const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }
  }

  const { data: runs, error } = await query;

  if (error) {
    if (error.message.includes('collection_runs')) {
      return NextResponse.json({ runs: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!runs || runs.length === 0) {
    return NextResponse.json({ runs: [] });
  }

  const runIds = runs.map(run => run.id);
  const { data: events, error: eventsError } = await supabase
    .from('collection_run_events')
    .select('collection_run_id, code, message, level, stage, hint, created_at')
    .in('collection_run_id', runIds)
    .order('created_at', { ascending: false });

  if (eventsError && !eventsError.message.includes('collection_run_events')) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  return NextResponse.json({ runs: mergeRunsWithLatestEvents(runs, events || []) });
}
