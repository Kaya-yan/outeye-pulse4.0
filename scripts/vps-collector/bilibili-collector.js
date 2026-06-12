/**
 * Bilibili Comment Collector (VPS version)
 * Can be used for scheduled batch collection.
 *
 * Usage:
 *   node bilibili-collector.js --bvid BV1xx411c7mD
 *   node bilibili-collector.js --keyword "郭永怀" --limit 20
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const PROJECT_ID = process.env.PROJECT_ID;
const MAX_COMMENTS = parseInt(process.env.MAX_COMMENTS_PER_POST || '3000');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Accept': 'application/json',
};

// ─── WBI Signing ────────────────────────────────────────────────
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

let cachedKeys = null;

function getMixinKey(imgKey, subKey) {
  const mixin = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map(i => mixin[i] || '').join('').slice(0, 32);
}

function wbiSign(params, imgKey, subKey) {
  const salt = getMixinKey(imgKey, subKey);
  params.wts = Math.floor(Date.now() / 1000).toString();
  const sorted = Object.fromEntries(Object.entries(params).sort());
  for (const key of Object.keys(sorted)) {
    sorted[key] = sorted[key].replace(/[!'()*]/g, '');
  }
  const query = new URLSearchParams(sorted).toString();
  sorted.w_rid = createHash('md5').update(query + salt).digest('hex');
  return sorted;
}

async function getWbiKeys() {
  if (cachedKeys) return cachedKeys;
  const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: HEADERS });
  const data = await resp.json();
  const wbi = data?.data?.wbi_img;
  if (!wbi) return null;
  const extract = (url) => url.split('/').pop()?.split('.')[0] || '';
  cachedKeys = { imgKey: extract(wbi.img_url), subKey: extract(wbi.sub_url) };
  return cachedKeys;
}

// ─── Bilibili API ────────────────────────────────────────────────
async function fetchVideoInfo(bvid) {
  const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  const data = await resp.json();
  return data.code === 0 ? data.data : null;
}

async function fetchReplies(oid, cursor, mode) {
  const ps = encodeURIComponent(JSON.stringify({ next_offset: String(cursor) }));
  const url = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${oid}&mode=${mode}&pagination_str=${ps}`;
  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`API ${data.code}`);
  return { replies: data.data?.replies || [], cursor: data.data?.cursor?.next || 0, end: data.data?.cursor?.is_end === true };
}

async function searchVideos(keyword, page = 1) {
  const keys = await getWbiKeys();
  if (!keys) throw new Error('Failed to get WBI keys');
  const params = wbiSign({ search_type: 'video', keyword, page, page_size: 20, order: '' }, keys.imgKey, keys.subKey);
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  const data = await resp.json();
  if (data.code !== 0) return [];
  return (data.data?.result || []).map(r => ({
    bvid: r.bvid, title: r.title?.replace(/<[^>]*>/g, ''), author: r.author,
    play: r.play, review: r.review, likes: r.like || 0, pubdate: r.pubdate,
  }));
}

// ─── Simple Hash & Sampling ──────────────────────────────────────
function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function computeSampling(likes) {
  const tier = likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low';
  const retention = tier === 'high' ? 1.0 : 0.5;
  return { sampling_tier: tier, is_sampled: Math.random() < retention };
}

// ─── Collect One Video ──────────────────────────────────────────
async function collectOne(bvid) {
  const video = await fetchVideoInfo(bvid);
  if (!video) throw new Error(`Video not found: ${bvid}`);

  const url = `https://www.bilibili.com/video/${bvid}`;
  const adPattern = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;

  // Create or find post
  let postId;
  const { data: existing } = await supabase.from('posts').select('id').eq('url', url).single();
  if (existing) {
    postId = existing.id;
  } else {
    const { data: newPost } = await supabase.from('posts').insert({
      project_id: PROJECT_ID, platform: 'bilibili', url,
      title: video.title, author_name_mask: video.owner?.name || '',
      likes: video.stat?.like || 0, collected_by: 'vps-scraper', is_aigc: false,
    }).select('id').single();
    postId = newPost?.id;
  }
  if (!postId) throw new Error('Failed to create post');

  // Collect comments
  const allReplies = [];
  const seen = new Set();

  // Hot comments
  const hot = await fetchReplies(video.aid, 0, 3);
  for (const r of hot.replies) { if (!seen.has(r.rpid)) { seen.add(r.rpid); allReplies.push(r); } }
  await new Promise(r => setTimeout(r, 500));

  // Time-ordered
  let cursor = hot.cursor;
  for (let i = 0; i < Math.ceil(MAX_COMMENTS / 20) && allReplies.length < MAX_COMMENTS; i++) {
    const result = await fetchReplies(video.aid, cursor, 2);
    if (result.replies.length === 0) break;
    for (const r of result.replies) { if (!seen.has(r.rpid)) { seen.add(r.rpid); allReplies.push(r); } }
    if (result.end) break;
    cursor = result.cursor;
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
  }

  // Flatten
  const flat = [];
  const push = (r) => {
    const text = r.content?.message?.trim();
    if (text && text.length >= 2 && !adPattern.test(text)) {
      flat.push({ text, likes: r.like || 0, username: r.member?.uname || '', time: r.ctime ? new Date(r.ctime * 1000).toISOString() : '' });
    }
  };
  for (const r of allReplies) { push(r); if (r.replies) for (const sr of r.replies) push(sr); }

  // Dedup and insert
  const hashes = flat.map(c => simpleHash(`${c.text}|${c.username}|${c.time}`));
  const { data: existingHashes } = await supabase.from('comments').select('content_hash').in('content_hash', hashes);
  const existingSet = new Set((existingHashes || []).map(r => r.content_hash));

  const toInsert = [];
  let dupes = 0;
  for (let i = 0; i < flat.length; i++) {
    if (existingSet.has(hashes[i])) { dupes++; continue; }
    toInsert.push({
      post_id: postId, project_id: PROJECT_ID, text: flat[i].text, likes: flat[i].likes,
      source_tool: 'vps-scraper', source_url: url, content_hash: hashes[i],
      ...computeSampling(flat[i].likes),
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { error } = await supabase.from('comments').insert(toInsert);
    if (!error) {
      imported = toInsert.length;
    } else {
      for (const row of toInsert) {
        const { error: e } = await supabase.from('comments').insert(row);
        if (!e) imported++;
      }
    }
  }

  return { bvid, title: video.title, imported, duplicates: dupes };
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const bvid = args.find(a => a.startsWith('--bvid='))?.split('=')[1] || args[args.indexOf('--bvid') + 1];
  const keyword = args.find(a => a.startsWith('--keyword='))?.split('=')[1] || args[args.indexOf('--keyword') + 1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

  if (!bvid && !keyword) {
    console.log('Usage:');
    console.log('  node bilibili-collector.js --bvid BV1xx411c7mD');
    console.log('  node bilibili-collector.js --keyword "郭永怀" --limit 20');
    process.exit(0);
  }

  if (bvid) {
    console.log(`Collecting: ${bvid}`);
    const result = await collectOne(bvid);
    console.log(`Done: ${result.title} — ${result.imported} imported, ${result.duplicates} duplicates`);
  } else if (keyword) {
    console.log(`Searching: ${keyword} (limit: ${limit})`);
    const videos = await searchVideos(keyword, 1);
    const toCollect = videos.slice(0, limit);
    console.log(`Found ${videos.length} videos, collecting ${toCollect.length}...`);

    for (const v of toCollect) {
      try {
        console.log(`  ${v.title} (${v.play} plays, ${v.review} comments)`);
        const result = await collectOne(v.bvid);
        console.log(`  → ${result.imported} imported`);
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
      }
    }
  }

  console.log('All done.');
}

main().catch(console.error);
