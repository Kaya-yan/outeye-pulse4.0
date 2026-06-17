import { NextRequest, NextResponse } from 'next/server';
import { buildCancelRunArtifacts } from '@/lib/collection-run-cancel';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
    ? body.reason.trim()
    : 'cancelled by operator';

  const { data: run, error } = await supabase
    .from('collection_runs')
    .select('project_id, platform, source, mode, initiator, target_type, target_value, status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    return NextResponse.json({ error: 'run is already terminal' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const artifacts = buildCancelRunArtifacts({ run, reason, now });

  await supabase
    .from('collection_runs')
    .update({ ...artifacts.runUpdate, updated_at: now })
    .eq('id', id);

  await supabase
    .from('collection_run_events')
    .insert({
      collection_run_id: id,
      ...artifacts.event,
    });

  return NextResponse.json({ success: true });
}
