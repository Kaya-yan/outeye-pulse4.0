import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { simpleHash } from '@/lib/hash';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Allowed base directories for CSV import (path traversal protection)
const ALLOWED_BASES = [
  path.join(process.cwd(), 'tools', 'MediaCrawler', 'data'),
  path.join(process.cwd(), 'scripts', 'playwright-scraper', 'output'),
];

function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return ALLOWED_BASES.some(base => resolved.startsWith(base) && resolved.endsWith('.csv'));
}

function parseCsvSafe(content: string): Record<string, string>[] {
  const result = Papa.parse(content, { header: true, skipEmptyLines: true, dynamicTyping: false });
  return (result.data as Record<string, string>[]).filter(row =>
    Object.values(row).some(v => v && String(v).trim())
  );
}

function cleanRows(rows: Record<string, string>[], existingHashes: Set<string>) {
  const kept: Record<string, string>[] = [];
  const removed: { row: Record<string, string>; reason: string }[] = [];
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

function detectSourceTool(filePath: string): string {
  if (filePath.includes('playwright-scraper')) return 'playwright';
  return 'media_crawler';
}

function mapRowToComment(row: Record<string, string>, postId: string, projectId: string, sourceTool: string) {
  const text = row.comment_content || row.content || row.text || row.comment || '';
  const likes = parseInt(row.like_count || row.likes || row.like || '0') || 0;
  return {
    post_id: postId,
    project_id: projectId,
    text: text.trim(),
    likes,
    sampling_tier: likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low',
    is_sampled: likes >= 100 || Math.random() < 0.5,
    source_tool: sourceTool,
    source_url: row.note_url || row.video_url || row.url || row.link || null,
    content_hash: row._content_hash || null,
  };
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: '云端环境不支持本地文件导入，请在本地运行' }, { status: 400 });
  }

  try {
    const { filePath, postId, projectId, preview } = await request.json();

    if (!filePath || !projectId) {
      return NextResponse.json({ error: 'filePath and projectId required' }, { status: 400 });
    }

    // Path traversal protection
    if (!isPathAllowed(filePath)) {
      return NextResponse.json({ error: '不允许读取该路径的文件' }, { status: 403 });
    }

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return NextResponse.json({ error: '无法读取文件', path: filePath }, { status: 404 });
    }

    const rows = parseCsvSafe(content);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV 为空或格式无效' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('comments')
      .select('content_hash')
      .eq('project_id', projectId)
      .not('content_hash', 'is', null);

    const existingHashes = new Set((existing || []).map(c => c.content_hash).filter(Boolean));
    const { kept, removed, stats } = cleanRows(rows, existingHashes);
    const sourceTool = detectSourceTool(filePath);

    if (preview) {
      return NextResponse.json({
        stats,
        sampleRows: kept.slice(0, 10).map(r => mapRowToComment(r, postId || '', projectId, sourceTool)),
        removedSample: removed.slice(0, 5),
      });
    }

    if (!postId) {
      return NextResponse.json({ error: 'postId required for import' }, { status: 400 });
    }

    const comments = kept.map(r => mapRowToComment(r, postId, projectId, sourceTool));

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

    // Detect keyword from CSV filename or content
    const keyword = path.basename(filePath, '.csv').replace(/_\d{8}_?\d{0,6}$/, '').replace(/^(bilibili|xhs)_?/, '') || '';

    await supabase.from('local_logs').insert({
      platform: filePath.includes('xhs') ? 'xhs' : 'bilibili',
      keyword,
      source_tool: sourceTool,
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
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
