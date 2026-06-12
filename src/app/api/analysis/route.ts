import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

const SYSTEM_PROMPT = `你是一位文化记忆研究领域的量化分析专家。请严格遵循以下学术框架对评论进行编码分析。

【理论框架与维度定义】
1. 精细加工可能性模型(ELM)：评估受众对郭永怀信息的认知加工深度(D1)
2. Russell情感环状模型：测量情感效价(D2_valence)与唤醒度(D2_arousal)
3. 阿斯曼文化记忆理论：评估从个体记忆到集体记忆的认同层级(D3)
4. 行为意向阶梯：测量从认知到行动的转化(D4)
5. 叙事传输理论：评估受众被叙事卷入的程度(D5)
6. 媒介伦理框架：识别历史虚无主义与消费主义风险(D6)

【输出格式】
严格返回JSON数组，禁止任何解释文本。格式：
[{"d1":8.5,"d2_valence":0.8,"d2_arousal":0.7,"d3":5,"d4":3,"d5":7.2,"d6":0,"narrative_type":"T2","labov_weights":[0.1,0.2,0.3,0.2,0.1,0.1],"risk_level":"safe","evidence_keywords":[{"word":"民族脊梁","weight":0.25,"dimension":"d3"}]}]`;

const BATCH_SIZE = 10;

/**
 * POST /api/analysis
 *
 * Two modes:
 * 1. Start mode: { projectId?, postId?, commentIds? } — creates log, returns logId + total
 * 2. Batch mode: { logId, projectId } — processes one batch, returns progress
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, commentIds, postId, logId } = body;

    // ── Batch mode: process next batch for existing log ──
    if (logId) {
      return await processNextBatch(logId, projectId);
    }

    // ── Start mode: create analysis session ──
    if (!projectId && !commentIds) {
      return NextResponse.json({ error: 'projectId or commentIds required' }, { status: 400 });
    }

    // Clean up orphaned processing state from previous interrupted runs
    try {
      await supabase
        .from('comments')
        .update({ analysis_status: 'pending' })
        .eq('analysis_status', 'processing');
    } catch { /* analysis_status column may not exist yet */ }

    // Resolve comments to analyze
    let comments: { id: string }[] = [];

    if (commentIds && Array.isArray(commentIds)) {
      const { data, error } = await supabase
        .from('comments')
        .select('id')
        .in('id', commentIds)
        .eq('analysis_status', 'pending');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    } else if (postId) {
      const { data, error } = await supabase
        .from('comments')
        .select('id')
        .eq('post_id', postId)
        .eq('analysis_status', 'pending')
        .order('likes', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    } else {
      const { data, error } = await supabase
        .from('comments')
        .select('id')
        .eq('project_id', projectId)
        .eq('analysis_status', 'pending')
        .order('likes', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    }

    if (comments.length === 0) {
      return NextResponse.json({ success: true, message: '没有待分析的评论', total: 0, logId: null });
    }

    // Create analysis_log entry
    const { data: logEntry, error: logError } = await supabase
      .from('analysis_logs')
      .insert({
        project_id: projectId || null,
        status: 'processing',
        total_comments: comments.length,
        processed_comments: 0,
        failed_comments: 0,
        progress_percent: 0,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (logError) {
      return NextResponse.json({ error: `Failed to create analysis log: ${logError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      logId: logEntry.id,
      total: comments.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `analysis failed: ${msg}` }, { status: 500 });
  }
}

/**
 * Process one batch of comments for an existing analysis log.
 */
async function processNextBatch(logId: string, projectId?: string) {
  // Get the log to know the project
  const { data: log } = await supabase
    .from('analysis_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (!log) {
    return NextResponse.json({ error: 'Analysis log not found' }, { status: 404 });
  }

  if (log.status === 'completed' || log.status === 'failed') {
    return NextResponse.json({
      success: true,
      done: true,
      processed: log.processed_comments,
      failed: log.failed_comments,
      total: log.total_comments,
      status: log.status,
    });
  }

  const pid = projectId || log.project_id;

  // Find next batch of pending comments (skips failed/completed)
  const { data: comments, error: fetchError } = await supabase
    .from('comments')
    .select('id, text')
    .eq('project_id', pid)
    .eq('analysis_status', 'pending')
    .order('likes', { ascending: false })
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!comments || comments.length === 0) {
    // No more comments to process — mark as completed
    await supabase
      .from('analysis_logs')
      .update({
        status: log.failed_comments > 0 ? 'completed' : 'completed',
        completed_at: new Date().toISOString(),
        error_message: log.failed_comments > 0 ? `${log.failed_comments} 条分析失败` : null,
      })
      .eq('id', logId);

    return NextResponse.json({
      success: true,
      done: true,
      processed: log.processed_comments,
      failed: log.failed_comments,
      total: log.total_comments,
      status: 'completed',
    });
  }

  // Mark as processing
  await supabase
    .from('comments')
    .update({ analysis_status: 'processing' })
    .in('id', comments.map(c => c.id));

  // Call AI
  let processed = 0;
  let failed = 0;
  let tokens = 0;

  try {
    const result = await analyzeBatch(comments);
    processed = result.processed;
    tokens = result.tokens;

    // Mark successful
    if (result.succeededIds.length > 0) {
      await supabase
        .from('comments')
        .update({ analysis_status: 'completed' })
        .in('id', result.succeededIds);
    }

    // Mark failed (partial response)
    const failedIds = comments.map(c => c.id).filter(id => !result.succeededIds.includes(id));
    if (failedIds.length > 0) {
      failed = failedIds.length;
      await supabase
        .from('comments')
        .update({ analysis_status: 'failed' })
        .in('id', failedIds);
    }
  } catch {
    failed = comments.length;
    await supabase
      .from('comments')
      .update({ analysis_status: 'failed' })
      .in('id', comments.map(c => c.id));
  }

  // Update log progress
  const newProcessed = log.processed_comments + processed;
  const newFailed = log.failed_comments + failed;
  const totalDone = newProcessed + newFailed;
  const progress = Math.round((totalDone / log.total_comments) * 100);

  await supabase
    .from('analysis_logs')
    .update({
      processed_comments: newProcessed,
      failed_comments: newFailed,
      progress_percent: progress,
      token_consumed: (log.token_consumed || 0) + tokens,
    })
    .eq('id', logId);

  // Check if there are more pending comments to process
  const { count: remaining } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', pid)
    .eq('analysis_status', 'pending');

  const done = !remaining || remaining === 0;

  if (done) {
    await supabase
      .from('analysis_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: newFailed > 0 ? `${newFailed} 条分析失败` : null,
      })
      .eq('id', logId);
  }

  return NextResponse.json({
    success: true,
    done,
    batchProcessed: processed,
    batchFailed: failed,
    processed: newProcessed,
    failed: newFailed,
    total: log.total_comments,
    progress,
    remaining: done ? 0 : remaining,
    tokens,
  });
}

/**
 * GET /api/analysis?logId=xxx — query analysis progress
 * GET /api/analysis?projectId=xxx — query recent analysis logs
 */
export async function GET(request: NextRequest) {
  const logId = request.nextUrl.searchParams.get('logId');
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (logId) {
    const { data, error } = await supabase
      .from('analysis_logs')
      .select('*')
      .eq('id', logId)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  }

  if (projectId) {
    const { data, error } = await supabase
      .from('analysis_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data || [] });
  }

  return NextResponse.json({ error: 'logId or projectId required' }, { status: 400 });
}

// ─── AI helpers ────────────────────────────────────────────────

async function analyzeBatch(batch: { id: string; text: string }[]): Promise<{ processed: number; tokens: number; succeededIds: string[] }> {
  const mimoApiKey = process.env.MIMO_API_KEY;
  const mimoApiUrl = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages';

  if (!mimoApiKey) {
    throw new Error('MIMO_API_KEY not configured');
  }

  // Deduplicate by text — AI returns one result per unique text
  const uniqueTexts: string[] = [];
  const textToIds = new Map<string, string[]>();
  for (const c of batch) {
    const key = c.text.trim();
    if (!textToIds.has(key)) {
      textToIds.set(key, []);
      uniqueTexts.push(key);
    }
    textToIds.get(key)!.push(c.id);
  }

  const userContent = uniqueTexts
    .map((text, i) => `【${i + 1}】${text}`)
    .join('\n');

  const response = await fetch(mimoApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mimoApiKey}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      max_tokens: Math.max(4000, uniqueTexts.length * 300),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MiMo API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const result = await response.json();

  let analysisText = '';
  if (Array.isArray(result.content)) {
    const textBlock = result.content.find((b: { type: string }) => b.type === 'text');
    analysisText = textBlock?.text || '';
  }

  if (!analysisText) {
    throw new Error('Empty AI response');
  }

  let analysisArray: Record<string, unknown>[];
  try {
    const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
    analysisArray = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
  } catch {
    throw new Error('Failed to parse AI JSON response');
  }

  // Map results back: each unique text gets one analysis, applied to ALL comments with that text
  const succeededIds: string[] = [];
  const updates: PromiseLike<number>[] = [];

  for (let i = 0; i < Math.min(uniqueTexts.length, analysisArray.length); i++) {
    const text = uniqueTexts[i];
    const ids = textToIds.get(text) || [];
    const validated = validateAnalysis(analysisArray[i]);
    const analysisPayload = {
      ...validated,
      model_version: 'mimo-v2.5-pro',
      analyzed_at: new Date().toISOString(),
    };

    for (const id of ids) {
      updates.push(
        supabase
          .from('comments')
          .update({ analysis: analysisPayload })
          .eq('id', id)
          .then(({ error }) => {
            if (!error) { succeededIds.push(id); return 1; }
            return 0;
          })
      );
    }
  }
  await Promise.all(updates);

  return {
    processed: succeededIds.length,
    tokens: result.usage?.output_tokens || 0,
    succeededIds,
  };
}

function validateAnalysis(raw: Record<string, unknown>): Record<string, unknown> {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = typeof v === 'number' ? v : fallback;
    return Math.max(min, Math.min(max, n));
  };

  return {
    ...raw,
    d1: clamp(raw.d1, 1, 10, 5),
    d2_valence: clamp(raw.d2_valence, -1, 1, 0),
    d2_arousal: clamp(raw.d2_arousal, 0, 1, 0.5),
    d3: clamp(raw.d3, 1, 6, 3),
    d4: clamp(raw.d4, 1, 5, 3),
    d5: clamp(raw.d5, 1, 10, 5),
    d6: clamp(raw.d6, 0, 1, 0),
    risk_level: ['safe', 'low', 'medium', 'high'].includes(raw.risk_level as string) ? raw.risk_level : 'safe',
  };
}
