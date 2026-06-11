import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

const VALID_PLATFORMS = ['xhs', 'bilibili'] as const;

/**
 * GET /api/agent/tasks?agent_id=xxx
 * Claim next pending task for a local agent (atomic via Postgres function).
 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');
  if (!agentId) {
    return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
  }

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
    } = body;

    if (!platform || !target_url) {
      return NextResponse.json({ error: 'platform and target_url required' }, { status: 400 });
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'platform must be xhs or bilibili' }, { status: 400 });
    }

    const maxC = Math.max(1, Math.min(50000, Number(max_comments) || 2000));
    const prio = Math.max(-100, Math.min(100, Number(priority) || 0));

    const { data, error } = await supabase
      .from('task_queue')
      .insert({
        platform,
        target_url,
        task_type,
        max_comments: maxC,
        config_json,
        priority: prio,
        scheduled_at: scheduled_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      const msg = error.message.includes('task_queue')
        ? '任务队列表尚未创建，请在 Supabase SQL Editor 中执行 005_create_task_queue.sql 迁移'
        : error.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ task: data, success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}

/**
 * PATCH /api/agent/tasks
 * Update task status (complete, fail, heartbeat).
 * Body: { task_id, status, error_message? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { task_id, status, error_message } = await request.json();

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status required' }, { status: 400 });
    }

    if (status === 'completed') {
      const { error } = await supabase.rpc('complete_task', { task_uuid: task_id });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (status === 'failed') {
      const { error } = await supabase.rpc('fail_task', {
        task_uuid: task_id,
        error_msg: error_message || 'unknown error',
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (status === 'running') {
      const { error } = await supabase
        .from('task_queue')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: `unsupported status: ${status}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}
