import { NextRequest, NextResponse } from 'next/server';
import { buildAgentImportLifecycleArtifacts, createAnalysisTriggerEvent, resolveImportProjectId } from '@/lib/agent-data-run';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, computeSampling, findExistingHashes, AD_PATTERN } from '@/lib/hash';

const supabase = createServerClient();

const VALID_PLATFORMS = ['xhs', 'bilibili'] as const;

/**
 * POST /api/agent/data
 * Local agent posts collected data (comments/posts) back to cloud.
 * Body: { task_id?, platform, data_type?, raw_data: [...], source_file?, project_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      task_id,
      platform,
      data_type = 'comments',
      raw_data,
      source_file,
      project_id,
    } = body;

    if (!platform || !raw_data || !Array.isArray(raw_data)) {
      return NextResponse.json(
        { error: 'platform and raw_data (array) required' },
        { status: 400 }
      );
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'platform must be xhs or bilibili' }, { status: 400 });
    }

    let collectionRunId: string | null = null;
    let currentRun: Record<string, unknown> | null = null;

    if (task_id) {
      const { data: taskRow } = await supabase
        .from('task_queue')
        .select('collection_run_id')
        .eq('id', task_id)
        .single();

      collectionRunId = taskRow?.collection_run_id || null;
    }

    if (collectionRunId) {
      const { data: runRow } = await supabase
        .from('collection_runs')
        .select('project_id, platform, source, mode, initiator, target_type, target_value, status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at')
        .eq('id', collectionRunId)
        .single();

      currentRun = runRow || null;
    }

    const insertAgentDataWithRun = async () => {
      return supabase
        .from('agent_data')
        .insert({
          task_id: task_id || null,
          collection_run_id: collectionRunId,
          platform,
          data_type,
          raw_data,
          count: raw_data.length,
          source_file: source_file || null,
          status: 'pending',
        })
        .select('id')
        .single();
    };

    const insertAgentDataWithoutRun = async () => {
      return supabase
        .from('agent_data')
        .insert({
          task_id: task_id || null,
          platform,
          data_type,
          raw_data,
          count: raw_data.length,
          source_file: source_file || null,
          status: 'pending',
        })
        .select('id')
        .single();
    };

    let agentDataResult = await insertAgentDataWithoutRun();

    if (collectionRunId) {
      agentDataResult = await insertAgentDataWithRun();
      if (agentDataResult.error && /collection_run_id/i.test(agentDataResult.error.message)) {
        agentDataResult = await insertAgentDataWithoutRun();
      }
    }

    if (agentDataResult.error) {
      return NextResponse.json({ error: `agent_data insert failed: ${agentDataResult.error.message}` }, { status: 500 });
    }

    const agentData = agentDataResult.data;

    const effectiveProjectId = resolveImportProjectId(project_id, (currentRun?.project_id as string | null | undefined) ?? null);

    // Auto-import: batch insert into comments
    const importResult = await importComments(raw_data, platform, effectiveProjectId || undefined);

    if (collectionRunId && currentRun) {
      const now = new Date().toISOString();
      const artifacts = buildAgentImportLifecycleArtifacts({
        run: currentRun,
        received: raw_data.length,
        imported: importResult.imported,
        duplicates: importResult.duplicates,
        filtered: importResult.filtered,
        failed: importResult.failed,
        now,
      });

      await supabase
        .from('collection_runs')
        .update({
          ...artifacts.runUpdate,
          updated_at: now,
        })
        .eq('id', collectionRunId);

      await supabase
        .from('collection_run_events')
        .insert(artifacts.events.map(event => ({
          collection_run_id: collectionRunId,
          ...event,
        })));
    }

    if (importResult.imported > 0 && project_id) {
      const origin = new URL(request.url).origin;
      const now = new Date().toISOString();

      try {
        const analysisResponse = await fetch(`${origin}/api/analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project_id }),
        });

        if (collectionRunId) {
          const event = createAnalysisTriggerEvent({
            projectId: project_id,
            imported: importResult.imported,
            ok: analysisResponse.ok,
            errorMessage: analysisResponse.ok ? undefined : `analysis API returned ${analysisResponse.status}`,
            now,
          });

          await supabase
            .from('collection_run_events')
            .insert({
              collection_run_id: collectionRunId,
              ...event,
            });
        }
      } catch (error) {
        if (collectionRunId) {
          const event = createAnalysisTriggerEvent({
            projectId: project_id,
            imported: importResult.imported,
            ok: false,
            errorMessage: error instanceof Error ? error.message : String(error),
            now,
          });

          await supabase
            .from('collection_run_events')
            .insert({
              collection_run_id: collectionRunId,
              ...event,
            });
        }
      }
    }

    // Update agent_data status
    await supabase
      .from('agent_data')
      .update({
        status: importResult.imported === 0 ? 'failed' : 'imported',
        imported_count: importResult.imported,
        duplicate_count: importResult.duplicates,
        imported_at: new Date().toISOString(),
        error_message: importResult.imported === 0 ? `0 imported, ${importResult.duplicates} dup, ${importResult.errors} err` : null,
      })
      .eq('id', agentData.id);

    return NextResponse.json({
      success: importResult.imported > 0,
      agent_data_id: agentData.id,
      received: raw_data.length,
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      errors: importResult.errors,
      details: importResult.details,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}

/**
 * Batch-import comments into the main comments table.
 * Auto-creates post records when they don't exist.
 */
async function importComments(
  rawItems: Record<string, unknown>[],
  platform: string,
  projectId?: string
): Promise<{ imported: number; duplicates: number; filtered: number; failed: number; errors: number; details: string[] }> {
  const normalized: { text: string; likes: number; username: string; createTime: string; sourceUrl: string; hash: string }[] = [];
  const details: string[] = [];
  let shortOrEmpty = 0;
  let adsFiltered = 0;

  for (const item of rawItems) {
    const text = String(item.text || item.content || '').trim();
    const likes = Number(item.likes || item.like || 0) || 0;
    const username = String(item.username || item.uname || '').trim();
    const createTime = String(item.create_time || item.ctime || '').trim();
    const sourceUrl = String(item.source_url || '').trim();

    if (!text || text.length < 2) { shortOrEmpty++; continue; }
    if (AD_PATTERN.test(text)) { adsFiltered++; continue; }

    const hash = simpleHash(`${text}|${username}|${createTime}`);
    normalized.push({ text, likes, username, createTime, sourceUrl, hash });
  }

  if (normalized.length === 0) {
    const filtered = shortOrEmpty + adsFiltered;
    details.push(`All ${rawItems.length} items filtered: ${shortOrEmpty} short/empty, ${adsFiltered} ads`);
    return { imported: 0, duplicates: 0, filtered, failed: 0, errors: filtered, details };
  }

  const existingHashes = await findExistingHashes(supabase, normalized.map(n => n.hash));

  // Resolve post IDs — auto-create missing posts
  const uniqueUrls = [...new Set(normalized.map(n => n.sourceUrl).filter(Boolean))];
  const urlToPostId = new Map<string, string>();

  if (uniqueUrls.length > 0) {
    const { data: postRows } = await supabase
      .from('posts')
      .select('id, url')
      .in('url', uniqueUrls);

    for (const row of postRows || []) {
      urlToPostId.set(row.url, row.id);
    }

    // Auto-create missing posts
    const missingUrls = uniqueUrls.filter(u => !urlToPostId.has(u));
    for (const url of missingUrls) {
      const title = extractTitleFromUrl(url, platform);
      const { data: newPost, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform,
          url,
          title,
          project_id: projectId || null,
          collected_by: 'agent',
        })
        .select('id')
        .single();

      if (!postErr && newPost) {
        urlToPostId.set(url, newPost.id);
        details.push(`Auto-created post for ${url}`);
      } else {
        details.push(`Failed to create post for ${url}: ${postErr?.message}`);
      }
    }
  }

  // Build insert rows
  const toInsert: Record<string, unknown>[] = [];
  let duplicates = 0;
  let missingPost = 0;

  for (const n of normalized) {
    if (existingHashes.has(n.hash)) { duplicates++; continue; }
    const postId = urlToPostId.get(n.sourceUrl);
    if (!postId) { missingPost++; continue; }

    toInsert.push({
      post_id: postId,
      project_id: projectId || null,
      text: n.text,
      likes: n.likes,
      ...computeSampling(n.likes),
      content_hash: n.hash,
    });
  }

  // Batch insert
  let imported = 0;
  if (toInsert.length > 0) {
    const { error: batchErr } = await supabase.from('comments').insert(toInsert);
    if (!batchErr) {
      imported = toInsert.length;
    } else {
      for (const row of toInsert) {
        const { error } = await supabase.from('comments').insert(row);
        if (!error) imported++;
      }
    }
  }

  if (shortOrEmpty > 0) details.push(`${shortOrEmpty} short/empty`);
  if (adsFiltered > 0) details.push(`${adsFiltered} ads filtered`);
  if (missingPost > 0) details.push(`${missingPost} missing post (auto-create failed)`);
  if (duplicates > 0) details.push(`${duplicates} duplicates`);

  const filtered = shortOrEmpty + adsFiltered;
  const failed = missingPost + (toInsert.length - imported);
  const errors = filtered + failed;
  return { imported, duplicates, filtered, failed, errors, details };
}

function extractTitleFromUrl(url: string, platform: string): string {
  if (platform === 'bilibili') {
    const m = url.match(/(BV\w{10})/);
    return m ? `B站视频 ${m[1]}` : 'B站视频';
  }
  if (platform === 'xhs') {
    const m = url.match(/\/explore\/(\w+)/) || url.match(/\/discovery\/item\/(\w+)/);
    return m ? `小红书笔记 ${m[1]}` : '小红书笔记';
  }
  return `${platform} 内容`;
}
