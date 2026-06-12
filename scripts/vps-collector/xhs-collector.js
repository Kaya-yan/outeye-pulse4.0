/**
 * XHS (Xiaohongshu) Comment Collector
 * Runs on a VPS with Playwright installed.
 *
 * Usage:
 *   node xhs-collector.js --url "https://www.xiaohongshu.com/explore/xxx"
 *   node xhs-collector.js --keyword "郭永怀" --limit 10
 *
 * Requires XHS cookies in .env (XHS_COOKIES) or cookies/xhs.json
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const PROJECT_ID = process.env.PROJECT_ID;
const MAX_COMMENTS = parseInt(process.env.MAX_COMMENTS_PER_POST || '3000');
const BATCH_DELAY = parseInt(process.env.BATCH_DELAY_MS || '2000');
const HEADLESS = process.env.HEADLESS !== 'false';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Cookie Management ──────────────────────────────────────────
function loadCookies() {
  const envCookies = process.env.XHS_COOKIES;
  if (envCookies) {
    try { return JSON.parse(envCookies); } catch { /* fall through */ }
  }

  const file = './cookies/xhs.json';
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf-8'));
  }

  console.error('No XHS cookies found. Run: node cookie-manager.js login');
  process.exit(1);
}

function saveCookies(cookies) {
  if (!existsSync('./cookies')) mkdirSync('./cookies', { recursive: true });
  writeFileSync('./cookies/xhs.json', JSON.stringify(cookies, null, 2));
}

// ─── XHS API Interception ──────────────────────────────────────
async function collectComments(page, noteId) {
  const comments = [];
  let hasMore = true;
  let cursor = '';

  // Intercept XHS comment API responses
  page.on('response', async (response) => {
    if (response.url().includes('/api/sns/web/v2/comment/page')) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          for (const c of data.data.comments) {
            comments.push({
              text: c.content || '',
              likes: c.like_count || 0,
              username: c.user_info?.nickname || '',
              createTime: c.create_time ? new Date(c.create_time).toISOString() : '',
              noteId,
            });
          }
        }
        hasMore = data?.data?.has_more === true;
        cursor = data?.data?.cursor || '';
      } catch { /* ignore parse errors */ }
    }
  });

  // Navigate to note page
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // Wait for comments to load
  await page.waitForTimeout(2000);

  // Scroll to load more comments
  let scrollAttempts = 0;
  while (hasMore && comments.length < MAX_COMMENTS && scrollAttempts < 50) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000 + Math.random() * 1000);
    scrollAttempts++;
  }

  return comments;
}

// ─── Search Notes by Keyword ────────────────────────────────────
async function searchNotes(page, keyword, limit = 10) {
  const notes = [];

  page.on('response', async (response) => {
    if (response.url().includes('/api/sns/web/v1/search/notes')) {
      try {
        const data = await response.json();
        if (data?.data?.items) {
          for (const item of data.data.items) {
            notes.push({
              noteId: item.id,
              title: item.note_card?.display_title || '',
              author: item.note_card?.user?.nickname || '',
              likes: item.note_card?.interact_info?.liked_count || 0,
              comments: item.note_card?.interact_info?.comment_count || 0,
            });
          }
        }
      } catch { /* ignore */ }
    }
  });

  await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=51`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.waitForTimeout(3000);

  // Scroll to load more results
  for (let i = 0; i < Math.ceil(limit / 20); i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(1500);
  }

  return notes.slice(0, limit);
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => a.startsWith('--url='))?.split('=')[1] || args[args.indexOf('--url') + 1];
  const keyword = args.find(a => a.startsWith('--keyword='))?.split('=')[1] || args[args.indexOf('--keyword') + 1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

  if (!url && !keyword) {
    console.log('Usage:');
    console.log('  node xhs-collector.js --url "https://www.xiaohongshu.com/explore/xxx"');
    console.log('  node xhs-collector.js --keyword "郭永怀" --limit 10');
    process.exit(0);
  }

  const cookies = loadCookies();

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // Add cookies
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    if (url) {
      // Collect comments from a specific note
      const noteId = url.match(/explore\/(\w+)/)?.[1] || url;
      console.log(`Collecting comments for note: ${noteId}`);

      const comments = await collectComments(page, noteId);
      console.log(`Collected ${comments.length} comments`);

      // Save to Supabase
      if (SUPABASE_URL && SUPABASE_KEY && PROJECT_ID) {
        const { data: existingPost } = await supabase
          .from('posts')
          .select('id')
          .eq('url', url)
          .single();

        let postId;
        if (existingPost) {
          postId = existingPost.id;
        } else {
          const { data: newPost } = await supabase
            .from('posts')
            .insert({
              project_id: PROJECT_ID,
              platform: 'xhs',
              url,
              title: `小红书笔记 ${noteId}`,
              collected_by: 'vps-scraper',
            })
            .select('id')
            .single();
          postId = newPost?.id;
        }

        if (postId) {
          // Dedup and insert
          const toInsert = comments
            .filter(c => c.text && c.text.length >= 2)
            .map(c => ({
              post_id: postId,
              project_id: PROJECT_ID,
              text: c.text,
              likes: c.likes,
              sampling_tier: c.likes >= 100 ? 'high' : c.likes >= 10 ? 'mid' : 'low',
              is_sampled: c.likes >= 100 || Math.random() < 0.5,
              collected_by: 'vps-scraper',
            }));

          const { error } = await supabase.from('comments').insert(toInsert);
          if (error) {
            console.error('Supabase insert error:', error.message);
          } else {
            console.log(`Saved ${toInsert.length} comments to Supabase`);
          }
        }
      } else {
        // Save locally
        const out = `./output/xhs_${noteId}_${Date.now()}.json`;
        if (!existsSync('./output')) mkdirSync('./output', { recursive: true });
        writeFileSync(out, JSON.stringify(comments, null, 2));
        console.log(`Saved to ${out}`);
      }

    } else if (keyword) {
      // Search and collect
      console.log(`Searching for: ${keyword} (limit: ${limit})`);
      const notes = await searchNotes(page, keyword, limit);
      console.log(`Found ${notes.length} notes`);

      for (const note of notes) {
        console.log(`  Collecting: ${note.title || note.noteId} (${note.likes} likes)`);
        const comments = await collectComments(page, note.noteId);
        console.log(`  → ${comments.length} comments`);
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }
  } finally {
    // Save updated cookies
    const newCookies = await context.cookies();
    saveCookies(newCookies);

    await browser.close();
    console.log('Done.');
  }
}

main().catch(console.error);
