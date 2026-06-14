import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, computeSampling, findExistingHashes, AD_PATTERN } from '@/lib/hash';

const supabase = createServerClient();

const INSERT_CHUNK = 300; // rows per batch insert to avoid Supabase timeout

/**
 * POST /api/collect/bilibili/import
 * Lightweight endpoint to insert pre-collected comments into DB.
 * Body: { postId, projectId, sourceUrl, comments: { text, likes, username, createTime, rpid }[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId, projectId, sourceUrl, comments } = body;

    if (!postId || !comments || !Array.isArray(comments)) {
      return NextResponse.json({ error: '缺少 postId 或 comments' }, { status: 400 });
    }

    // Filter invalid / ad comments
    const valid = comments.filter((c: { text?: string }) => {
      const text = c.text?.trim();
      return text && text.length >= 2 && !AD_PATTERN.test(text);
    });

    if (valid.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: 0, filtered: comments.length });
    }

    // Dedup by content hash
    const hashes = valid.map((c: { text: string; username: string; createTime: string }) =>
      simpleHash(`${c.text}|${c.username}|${c.createTime}`)
    );
    const existingHashes = await findExistingHashes(supabase, hashes);

    const toInsert: Record<string, unknown>[] = [];
    let duplicates = 0;

    for (let i = 0; i < valid.length; i++) {
      if (existingHashes.has(hashes[i])) {
        duplicates++;
        continue;
      }
      const likes = valid[i].likes || 0;
      toInsert.push({
        post_id: postId,
        project_id: projectId,
        text: valid[i].text,
        likes,
        source_tool: 'client-paginate',
        source_url: sourceUrl,
        content_hash: hashes[i],
        ...computeSampling(likes),
      });
    }

    let imported = 0;
    const errors: string[] = [];

    // Chunked batch insert
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { error } = await supabase.from('comments').insert(chunk);

      if (!error) {
        imported += chunk.length;
      } else {
        // Fallback: one by one for this chunk
        for (const row of chunk) {
          const { error: e } = await supabase.from('comments').insert(row);
          if (!e) {
            imported++;
          } else if (errors.length < 5) {
            errors.push(e.message);
          }
        }
      }
    }

    return NextResponse.json({
      imported,
      duplicates,
      filtered: comments.length - valid.length,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `导入失败: ${msg}` }, { status: 500 });
  }
}
