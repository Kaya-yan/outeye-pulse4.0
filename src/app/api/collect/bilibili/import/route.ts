import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { simpleHash, computeSampling, findExistingHashes, AD_PATTERN } from '@/lib/hash';

const supabase = createServerClient();

/**
 * POST /api/collect/bilibili/import
 * Lightweight endpoint to insert pre-collected comments into DB.
 * Called by the frontend after client-side pagination is complete.
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
      toInsert.push({
        post_id: postId,
        project_id: projectId,
        text: valid[i].text,
        likes: valid[i].likes || 0,
        source_tool: 'client-paginate',
        source_url: sourceUrl,
        content_hash: hashes[i],
        ...computeSampling(valid[i].likes || 0),
      });
    }

    let imported = 0;
    const errors: string[] = [];

    if (toInsert.length > 0) {
      // Try batch insert first
      const { error } = await supabase.from('comments').insert(toInsert);
      if (!error) {
        imported = toInsert.length;
      } else {
        // Fallback: one by one
        for (const row of toInsert) {
          const { error: e } = await supabase.from('comments').insert(row);
          if (!e) {
            imported++;
          } else if (errors.length < 3) {
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
