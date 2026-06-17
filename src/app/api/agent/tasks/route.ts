import { NextRequest, NextResponse } from 'next/server';
import { buildAgentTaskCreationArtifacts } from '@/lib/agent-task-run';
import { createRunEvent, markRunRunning, type CollectionRunState } from '@/lib/collection-run-state';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

const VALID_PLATFORMS = ['xhs', 'bilibili'] as const;

/**
 * GET /api/agent/tasks?agent_id=xxx — Claim next pending task (for agent)
 * GET /api/agent/tasks?status=pending,running — Query tasks by status (for UI)
 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');
  const statusParam = request.nextUrl.searchParams.get('status');

  // Mode 1: Agent claims next task
  if (agentId) {
    const { data, error } = await supabase.rpc('claim_next_task', { agent_id: agentId });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return NextResponse.json({ task: null, message: 'no pending tasks' });
    }

    const task = Array.isArray(data) ? data[0] : data;
    if (!task || !task.id) {
      return NextResponse.json({ task: null, message: 'no pending tasks' });
    }
    return NextResponse.json({ task });
  }

  // Mode 2: Query tasks by status (for UI)
  if (statusParam) {
    const statuses = statusParam.split(',').map(s => s.trim());
    const { data, error } = await supabase
      .from('task_queue')
      .select('id, platform, target_url, status, created_at, started_at, completed_at, error_message, retry_count, max_retries')
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      // Table might not exist — return empty instead of 500
      console.warn('[Agent Tasks] Query error (table may not exist):', error.message);
      return NextResponse.json({ tasks: [] });
    }

    return NextResponse.json({ tasks: data || [] });
  }

  return NextResponse.json({ error: 'agent_id or status required' }, { status: 400 });
}

/**
 * POST /api/agent/tasks
 * Create a new task in the queue.
 * Body: { platform, target_url, task_type?, max_comments?, config_json?, priority?, scheduled_at? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      platform,
      target_url,
      task_type = 'comments',
      max_comments = 2000,
      config_json = {},
      priority = 0,
      scheduled_at,
      project_id,
      projectId,
    } = body;

    if (!platform || !target_url) {
      return NextResponse.json({ error: 'platform and target_url required' }, { status: 400 });
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'platform must be xhs or bilibili' }, { status: 400 });
    }

    const maxC = Math.max(1, Math.min(50000, Number(max_comments) || 2000));
    const prio = Math.max(-100, Math.min(100, Number(priority) || 0));
    const now = scheduled_at || new Date().toISOString();
    const resolvedProjectId = project_id || projectId || null;

    const artifacts = buildAgentTaskCreationArtifacts({
      project_id: resolvedProjectId,
      platform,
      target_url,
      task_type,
      max_comments: maxC,
      config_json,
      priority: prio,
      scheduled_at: scheduled_at || null,
      now,
    });

    let collectionRunId: string | null = null;

    const { data: runData, error: runError } = await supabase
      .from('collection_runs')
      .insert(artifacts.run)
      .select('id')
      .single();

    if (!runError && runData?.id) {
      collectionRunId = runData.id;

      await supabase
        .from('collection_run_events')
        .insert({
          collection_run_id: collectionRunId,
          ...artifacts.event,
        });
    } else if (runError && !runError.message.includes('collection_runs')) {
      console.warn('[Agent Tasks] Failed to create collection run:', runError.message);
    }

    const insertWithRunId = async () => {
      return supabase
        .from('task_queue')
        .insert({
          ...artifacts.taskPayload,
          collection_run_id: collectionRunId,
        })
        .select()
        .single();
    };

    const insertWithoutRunId = async () => {
      return supabase
        .from('task_queue')
        .insert(artifacts.taskPayload)
        .select()
        .single();
    };

    let taskResult = await insertWithoutRunId();

    if (collectionRunId) {
      taskResult = await insertWithRunId();
      if (taskResult.error && /collection_run_id/i.test(taskResult.error.message)) {
        taskResult = await insertWithoutRunId();
      }
    }

    if (taskResult.error) {
      const msg = taskResult.error.message.includes('task_queue')
        ? '任务队列表尚未创建，请在 Supabase SQL Editor 中执行 005_create_task_queue.sql 迁移'
        : taskResult.error.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ task: taskResult.data, success: true, collection_run_id: collectionRunId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}

/**
 * PATCH /api/agent/tasks
 * Update task status (complete, fail, heartbeat).
 * Supports both query param (?id=xxx) and body ({ task_id }) for task ID.
 * Body: { task_id?, status, error_message? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept task ID from query param or body
    const task_id = request.nextUrl.searchParams.get('id') || body.task_id;
    const { status, error_message } = body;

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status required' }, { status: 400 });
    }

    if (status === 'completed') {
      // Try RPC first, fallback to direct update
      const { error: rpcError } = await supabase.rpc('complete_task', { task_uuid: task_id });
      if (rpcError) {
        const { error } = await supabase
          .from('task_queue')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (status === 'failed') {
      // Try RPC first, fallback to direct update
      const { error: rpcError } = await supabase.rpc('fail_task', {
        task_uuid: task_id,
        error_msg: error_message || 'unknown error',
      });
      if (rpcError) {
        const { error } = await supabase
          .from('task_queue')
          .update({ status: 'failed', error_message: error_message || 'unknown error' })
          .eq('id', task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (status === 'running') {
      const now = new Date().toISOString();
      const { data: taskRow, error } = await supabase
        .from('task_queue')
        .update({ status: 'running', started_at: now })
        .eq('id', task_id)
        .select('id, collection_run_id')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (taskRow?.collection_run_id) {
        const { data: runRow, error: runFetchError } = await supabase
          .from('collection_runs')
          .select('status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at')
          .eq('id', taskRow.collection_run_id)
          .single();

        if (!runFetchError && runRow) {
          const runUpdate = markRunRunning(runRow as CollectionRunState, {
            stage: 'claim',
            now,
          });

          await supabase
            .from('collection_runs')
            .update({
              ...runUpdate,
              updated_at: now,
            })
            .eq('id', taskRow.collection_run_id);

          await supabase
            .from('collection_run_events')
            .insert({
              collection_run_id: taskRow.collection_run_id,
              ...createRunEvent({
                stage: 'claim',
                level: 'info',
                code: 'TASK_CLAIMED',
                message: 'Agent claimed queued task',
                details_json: { task_id },
                now,
              }),
            });
        }
      }
    } else {
      return NextResponse.json({ error: `unsupported status: ${status}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}
