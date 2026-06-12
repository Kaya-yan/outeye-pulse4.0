import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sleep } from '@/lib/hash';

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

const BATCH_SIZE = 20;
const MAX_RETRIES = 2;

export async function POST(request: NextRequest) {
  try {
    const { projectId, commentIds, postId } = await request.json();

    if (!projectId && !commentIds) {
      return NextResponse.json({ error: 'projectId or commentIds required' }, { status: 400 });
    }

    // Resolve comments to analyze
    let comments: { id: string; text: string }[] = [];

    if (commentIds && Array.isArray(commentIds)) {
      // commentIds 路径：允许指定任意评论（如手动选择），不强制 is_sampled
      const { data, error } = await supabase
        .from('comments')
        .select('id, text')
        .in('id', commentIds)
        .is('analysis', null);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    } else if (postId) {
      const { data, error } = await supabase
        .from('comments')
        .select('id, text')
        .eq('post_id', postId)
        .eq('is_sampled', true)
        .is('analysis', null)
        .order('likes', { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    } else {
      const { data, error } = await supabase
        .from('comments')
        .select('id, text')
        .eq('project_id', projectId)
        .eq('is_sampled', true)
        .is('analysis', null)
        .order('likes', { ascending: false })
        .limit(1000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    }

    if (comments.length === 0) {
      return NextResponse.json({ success: true, message: '没有待分析的评论', processed: 0 });
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

    const logId = logEntry.id;

    // Mark all as processing
    const commentIdsToProcess = comments.map(c => c.id);
    await supabase
      .from('comments')
      .update({ analysis_status: 'processing' })
      .in('id', commentIdsToProcess);

    // Process in batches
    const batches: typeof comments[] = [];
    for (let i = 0; i < comments.length; i += BATCH_SIZE) {
      batches.push(comments.slice(i, i + BATCH_SIZE));
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    let totalTokens = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      let success = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await analyzeBatch(batch);
          totalProcessed += result.processed;
          totalTokens += result.tokens;

          // Mark successful comments
          const processedIds = batch.slice(0, result.processed).map(c => c.id);
          if (processedIds.length > 0) {
            await supabase
              .from('comments')
              .update({ analysis_status: 'completed' })
              .in('id', processedIds);
          }

          success = true;
          break;
        } catch {
          if (attempt === MAX_RETRIES) {
            totalFailed += batch.length;
            // Mark failed comments
            await supabase
              .from('comments')
              .update({ analysis_status: 'failed' })
              .in('id', batch.map(c => c.id));
          }
        }
      }

      // Update progress
      const progress = Math.round(((totalProcessed + totalFailed) / comments.length) * 100);
      await supabase
        .from('analysis_logs')
        .update({
          processed_comments: totalProcessed,
          failed_comments: totalFailed,
          progress_percent: progress,
          token_consumed: totalTokens,
        })
        .eq('id', logId);

      // Small delay between batches to avoid rate limiting
      if (batchIdx < batches.length - 1) {
        await sleep(1000);
      }
    }

    // Mark log as completed
    await supabase
      .from('analysis_logs')
      .update({
        status: totalFailed === comments.length ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        error_message: totalFailed > 0 ? `${totalFailed}/${comments.length} 条分析失败` : null,
      })
      .eq('id', logId);

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      failed: totalFailed,
      total: comments.length,
      total_tokens: totalTokens,
      log_id: logId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `analysis failed: ${msg}` }, { status: 500 });
  }
}

/**
 * GET /api/analysis?logId=xxx — 查询分析进度
 * GET /api/analysis?projectId=xxx — 查询项目最近的分析日志
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

async function analyzeBatch(batch: { id: string; text: string }[]): Promise<{ processed: number; tokens: number }> {
  const mimoApiKey = process.env.MIMO_API_KEY;
  const mimoApiUrl = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages';

  if (!mimoApiKey) {
    throw new Error('MIMO_API_KEY not configured');
  }

  const userContent = batch
    .map((c, i) => `【${i + 1}】${c.text}`)
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
      max_tokens: 4000,
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

  const updates = batch.slice(0, analysisArray.length).map((c, i) =>
    supabase
      .from('comments')
      .update({
        analysis: {
          ...analysisArray[i],
          model_version: 'mimo-v2.5-pro',
          analyzed_at: new Date().toISOString(),
        },
      })
      .eq('id', c.id)
      .then(({ error }) => (error ? 0 : 1)),
  );
  const results = await Promise.all(updates);
  const processed = results.reduce<number>((s, r) => s + r, 0);

  return {
    processed,
    tokens: result.usage?.output_tokens || 0,
  };
}
