import { NextRequest, NextResponse } from 'next/server';
import { buildBookmarkletCommentInsertRows } from '@/lib/bookmarklet-link-rows';
import { buildBookmarkletLinkLifecycleArtifacts } from '@/lib/bookmarklet-run';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceId, postId, projectId } = body;

    if (!sourceId || !postId || !projectId) {
      return NextResponse.json({ error: 'sourceId, postId and projectId required' }, { status: 400 });
    }

    const { data: raw, error: fetchErr } = await supabase
      .from('raw_comments')
      .select('*')
      .eq('source_id', sourceId)
      .eq('status', 'pending');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!raw || raw.length === 0) {
      return NextResponse.json({ imported: 0, success: true });
    }

    const collectionRunId = raw.find(r => r.collection_run_id)?.collection_run_id || null;

    const { data: existing } = await supabase
      .from('comments')
      .select('rpid')
      .eq('post_id', postId);

    const existingRpid = new Set((existing || []).map(c => c.rpid).filter(Boolean));
    const rows = buildBookmarkletCommentInsertRows({
      raw,
      postId,
      projectId,
      existingRpid,
      sampleRandom: 0.1,
    });

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('comments').insert(rows);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    await supabase
      .from('raw_comments')
      .update({ status: 'linked', post_id: postId, project_id: projectId })
      .eq('source_id', sourceId)
      .eq('status', 'pending');

    if (collectionRunId) {
      const { data: runRow } = await supabase
        .from('collection_runs')
        .select('project_id, platform, source, mode, initiator, target_type, target_value, status, current_stage, failure_code, latest_error, latest_hint, received_count, imported_count, duplicate_count, filtered_count, failed_count, heartbeat_at, started_at, finished_at')
        .eq('id', collectionRunId)
        .single();

      if (runRow) {
        const now = new Date().toISOString();
        const duplicates = Math.max(0, raw.length - rows.length);
        const artifacts = buildBookmarkletLinkLifecycleArtifacts({
          run: runRow,
          imported: rows.length,
          duplicates,
          failed: 0,
          now,
        });

        await supabase
          .from('collection_runs')
          .update({ ...artifacts.runUpdate, updated_at: now })
          .eq('id', collectionRunId);

        await supabase
          .from('collection_run_events')
          .insert(artifacts.events.map(event => ({
            collection_run_id: collectionRunId,
            ...event,
          })));
      }
    }

    return NextResponse.json({ imported: rows.length, success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}
