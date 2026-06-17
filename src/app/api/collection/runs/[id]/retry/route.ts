import { NextRequest, NextResponse } from 'next/server';
import { buildRetryRunArtifacts } from '@/lib/collection-run-retry';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data: run, error } = await supabase
    .from('collection_runs')
    .select('id, project_id, platform, source, mode, initiator, target_type, target_value, status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const artifacts = buildRetryRunArtifacts({ run, now });

  const { data: newRun, error: insertError } = await supabase
    .from('collection_runs')
    .insert(artifacts.run)
    .select('*')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from('collection_run_events')
    .insert({
      collection_run_id: newRun.id,
      ...artifacts.event,
    });

  if (newRun.source === 'agent') {
    const { error: taskError } = await supabase
      .from('task_queue')
      .insert({
        platform: newRun.platform,
        target_url: newRun.target_value,
        task_type: 'comments',
        max_comments: 2000,
        priority: 0,
        scheduled_at: now,
        collection_run_id: newRun.id,
      });

    if (taskError && !/collection_run_id/i.test(taskError.message)) {
      console.warn('[Retry Run] Failed to create retry task_queue row:', taskError.message);
    }
  }

  return NextResponse.json({ success: true, run: newRun });
}
