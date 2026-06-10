import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

const VALID_PLATFORMS = ['xhs', 'bilibili'] as const;

/**
 * POST /api/agent/data
 * Local agent posts collected data (comments/posts) back to cloud.
 * Body: { task_id?, platform, data_type?, raw_data: [...], source_file? }
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

    // Store in agent_data table for staged import
    const { data: agentData, error: insertError } = await supabase
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

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Auto-import: batch insert into comments
    const importResult = await importComments(raw_data, platform);

    // Update agent_data status
    await supabase
      .from('agent_data')
      .update({
        status: importResult.errors > 0 && importResult.imported === 0 ? 'failed' : 'imported',
        imported_count: importResult.imported,
        duplicate_count: importResult.duplicates,
        imported_at: new Date().toISOString(),
      })
      .eq('id', agentData.id);

    return NextResponse.json({
      success: true,
      agent_data_id: agentData.id,
      received: raw_data.length,
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      errors: importResult.errors,
    });
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
}

/**
 * Batch-import comments into the main comments table.
 * Uses batched queries to avoid N+1 round-trips.
 */
async function importComments(
  rawItems: Record<string, unknown>[],
  _platform: string
): Promise<{ imported: number; duplicates: number; errors: number }> {
  // Step 1: Normalize and filter items, compute hashes
  const adPattern = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;
  const normalized: { text: string; likes: number; username: string; createTime: string; sourceUrl: string; hash: string }[] = [];
  let shortOrEmpty = 0;
  let adsFiltered = 0;

  for (const item of rawItems) {
    const text = String(item.text || item.content || '').trim();
    const likes = Number(item.likes || item.like || 0) || 0;
    const username = String(item.username || item.uname || '').trim();
    const createTime = String(item.create_time || item.ctime || '').trim();
    const sourceUrl = String(item.source_url || '').trim();

    if (!text || text.length < 2) { shortOrEmpty++; continue; }
    if (adPattern.test(text)) { adsFiltered++; continue; }

    const hash = simpleHash(`${text}|${username}|${createTime}`);
    normalized.push({ text, likes, username, createTime, sourceUrl, hash });
  }

  if (normalized.length === 0) {
    return { imported: 0, duplicates: 0, errors: shortOrEmpty + adsFiltered };
  }

  // Step 2: Batch-fetch existing hashes for dedup (one query)
  const allHashes = normalized.map(n => n.hash);
  const { data: existingRows } = await supabase
    .from('comments')
    .select('content_hash')
    .in('content_hash', allHashes);

  const existingHashes = new Set((existingRows || []).map(r => r.content_hash).filter(Boolean));

  // Step 3: Batch-fetch post IDs for source URLs (one query)
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
  }

  // Step 4: Build insert rows, skip duplicates and missing posts
  const toInsert: Record<string, unknown>[] = [];
  let duplicates = 0;
  let missingPost = 0;

  for (const n of normalized) {
    if (existingHashes.has(n.hash)) { duplicates++; continue; }
    const postId = urlToPostId.get(n.sourceUrl);
    if (!postId) { missingPost++; continue; }

    toInsert.push({
      post_id: postId,
      text: n.text,
      likes: n.likes,
      sampling_tier: getSamplingTier(n.likes),
      is_sampled: n.likes >= 100 || Math.random() < 0.5,
      content_hash: n.hash,
    });
  }

  // Step 5: Batch insert (try bulk first, fall back to individual)
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

  const errors = shortOrEmpty + adsFiltered + missingPost + (toInsert.length - imported);
  return { imported, duplicates, errors };
}

function getSamplingTier(likes: number): string {
  return likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low';
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
