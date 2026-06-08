import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CsvRow {
  [key: string]: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: CsvRow = {};
    headers.forEach((h, j) => { row[h] = values[j] || ''; });
    rows.push(row);
  }
  return rows;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanRows(rows: CsvRow[], existingHashes: Set<string>) {
  const kept: CsvRow[] = [];
  const removed: { row: CsvRow; reason: string }[] = [];
  let duplicates = 0;
  const adPattern = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;

  for (const row of rows) {
    const text = row.comment_content || row.content || row.text || row.comment || '';
    const username = row.user_nickname || row.nickname || row.username || row.user_name || '';
    const createTime = row.create_time || row.time || row.date || row.created_at || '';

    if (!text || text.trim().length === 0) { removed.push({ row, reason: '空评论' }); continue; }
    if (text.trim().length < 2) { removed.push({ row, reason: '过短' }); continue; }
    if (adPattern.test(text)) { removed.push({ row, reason: '疑似广告' }); continue; }

    const hash = simpleHash(`${text.trim()}|${username}|${createTime}`);
    if (existingHashes.has(hash)) { duplicates++; removed.push({ row, reason: '重复' }); continue; }
    existingHashes.add(hash);
    row._content_hash = hash;
    kept.push(row);
  }

  return { kept, removed, stats: { total: rows.length, kept: kept.length, removed: removed.length - duplicates, duplicates } };
}

function mapRowToComment(row: CsvRow, postId: string, projectId: string) {
  const text = row.comment_content || row.content || row.text || row.comment || '';
  const likes = parseInt(row.like_count || row.likes || row.like || '0') || 0;
  return {
    post_id: postId,
    project_id: projectId,
    text: text.trim(),
    likes,
    sampling_tier: likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low',
    is_sampled: likes >= 100 || Math.random() < 0.5,
    source_tool: 'media_crawler',
    source_url: row.note_url || row.video_url || row.url || row.link || null,
    content_hash: row._content_hash || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { filePath, postId, projectId, preview } = await request.json();

    if (!filePath || !projectId) {
      return NextResponse.json({ error: 'filePath and projectId required' }, { status: 400 });
    }

    // Read and parse CSV
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return NextResponse.json({ error: 'Cannot read file', path: filePath }, { status: 404 });
    }

    const rows = parseCsv(content);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV empty or invalid' }, { status: 400 });
    }

    // Get existing content hashes for dedup
    const { data: existing } = await supabase
      .from('comments')
      .select('content_hash')
      .eq('project_id', projectId)
      .not('content_hash', 'is', null);

    const existingHashes = new Set((existing || []).map(c => c.content_hash).filter(Boolean));

    // Clean
    const { kept, removed, stats } = cleanRows(rows, existingHashes);

    // Preview mode: return stats + sample rows without inserting
    if (preview) {
      return NextResponse.json({
        stats,
        sampleRows: kept.slice(0, 10).map(r => mapRowToComment(r, postId || '', projectId)),
        removedSample: removed.slice(0, 5),
      });
    }

    // Actually insert
    if (!postId) {
      return NextResponse.json({ error: 'postId required for import' }, { status: 400 });
    }

    const comments = kept.map(r => mapRowToComment(r, postId, projectId));

    // Batch insert with fallback
    let imported = 0;
    const { error: batchErr } = await supabase.from('comments').insert(comments);
    if (!batchErr) {
      imported = comments.length;
    } else {
      for (const c of comments) {
        const { error } = await supabase.from('comments').insert(c);
        if (!error) imported++;
      }
    }

    // Log to local_logs
    await supabase.from('local_logs').insert({
      platform: filePath.includes('xhs') ? 'xhs' : 'bilibili',
      keyword: '',
      source_tool: 'media_crawler',
      raw_count: stats.total,
      clean_count: stats.kept,
      import_count: imported,
      duplicate_count: stats.duplicates,
      data_file_path: filePath,
      status: 'completed',
      operator: 'web',
    });

    return NextResponse.json({ success: true, imported, stats });
  } catch (error) {
    console.error('Import route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
