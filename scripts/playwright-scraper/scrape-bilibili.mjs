#!/usr/bin/env node
/**
 * OutEye Playwright B站评论深度采集器
 *
 * B站评论区使用 closed Shadow DOM，通过 page.request 直接调用 B站 API。
 * 支持 Cookie 持久化、登录检测、二级评论采集、自动重试、中断安全保存。
 *
 * Usage:
 *   node scrape-bilibili.mjs --bvid=BV19fGb6BEpz
 *   node scrape-bilibili.mjs --bvid=BV19fGb6BEpz --headless
 *   node scrape-bilibili.mjs --login   # 强制登录模式
 *
 * Options:
 *   --bvid=<string>       B站视频BV号（必填，除非 --login）
 *   --max-scroll=<n>      最大滚动分页数（默认50）
 *   --max-comments=<n>    最大评论数（默认2000）
 *   --headless            无头模式（默认有头）
 *   --login               强制登录模式，更新 Cookie
 *   --skip-login-check    跳过登录检测（用于调试）
 *
 * 输出：
 *   CSV 文件保存到 output/bilibili_YYYYMMDD_HHMMSS.csv
 *   中断时保存到 output/bilibili_YYYYMMDD_HHMMSS_partial.csv
 *   导入：回到 P0 页面"数据文件"区域，扫描后导入
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, 'cookies-bilibili.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

// ─── State for interrupt-safe export ────────────────────────────
let collectedReplies = [];
let currentBvid = '';
let interruptSaved = false;

function savePartialOnInterrupt() {
  if (interruptSaved || collectedReplies.length === 0) return;
  interruptSaved = true;
  console.log(`\n\n⚠️  检测到中断，正在保存已采集的 ${collectedReplies.length} 条评论...`);
  exportCsv(collectedReplies, currentBvid, true);
  console.log('部分数据已保存。');
  process.exit(0);
}

process.on('SIGINT', savePartialOnInterrupt);
process.on('SIGTERM', savePartialOnInterrupt);

// ─── Helpers ────────────────────────────────────────────────────
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ─── Parse CLI args ─────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { bvid: null, maxScroll: 50, maxComments: 2000, headless: false, login: false, skipLoginCheck: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--bvid=')) opts.bvid = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--max-scroll=')) opts.maxScroll = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--max-comments=')) opts.maxComments = parseInt(arg.split('=')[1]);
    else if (arg === '--headless') opts.headless = true;
    else if (arg === '--login') opts.login = true;
    else if (arg === '--skip-login-check') opts.skipLoginCheck = true;
    else if (!arg.startsWith('-')) {
      const m = arg.match(/(BV\w+)/);
      opts.bvid = m ? m[1] : arg;
    }
  }

  if (!opts.bvid && !opts.login) {
    console.error('Usage: node scrape-bilibili.mjs --bvid=BVxxx');
    console.error('       node scrape-bilibili.mjs --login');
    process.exit(1);
  }
  return opts;
}

// ─── Cookie management ──────────────────────────────────────────
function getCookies() {
  if (!existsSync(COOKIES_PATH)) return [];
  try { return JSON.parse(readFileSync(COOKIES_PATH, 'utf-8')); } catch { return []; }
}

function hasSessdata(cookies) {
  return cookies.some(c => c.name === 'SESSDATA' && c.value && c.value.length > 10);
}

async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log(`  Cookies 已保存 (${cookies.length} 条)`);
  } catch { /* non-fatal */ }
}

async function loadCookies(context) {
  const cookies = getCookies();
  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`  已加载 ${cookies.length} 条 Cookie`);
  }
  return cookies;
}

// ─── Login flow ─────────────────────────────────────────────────
async function ensureLogin(browser) {
  // Check existing cookies first
  const cookies = getCookies();
  if (hasSessdata(cookies)) {
    console.log('  ✅ 检测到 SESSDATA，Cookie 有效');
    return true;
  }

  // No valid SESSDATA — need login
  console.log('\n' + '='.repeat(50));
  console.log('⚠️  未检测到 B站登录状态');
  console.log('='.repeat(50));
  console.log('\n即将打开浏览器，请在页面中登录 B站。');
  console.log('登录成功后，回到此终端按回车键继续。\n');

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });

  // Load existing cookies (anonymous ones) as a base
  const existingCookies = getCookies();
  if (existingCookies.length > 0) {
    await context.addCookies(existingCookies);
  }

  const page = await context.newPage();
  await page.goto('https://www.bilibili.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for user to complete login
  console.log('👆 请在浏览器窗口中登录 B站');
  console.log('   登录成功后，回到此终端按回车键...\n');

  await prompt('按回车键继续 →');

  // Save cookies after login
  await saveCookies(context);

  // Verify SESSDATA was captured
  const newCookies = getCookies();
  if (!hasSessdata(newCookies)) {
    console.log('\n⚠️  仍未检测到 SESSDATA。可能原因：');
    console.log('  1. 登录未成功');
    console.log('  2. B站登录流程变化');
    console.log('\n是否继续采集？（未登录将严重影响采集数量）');
    const ans = await prompt('继续? (y/n) → ');
    if (ans.toLowerCase() !== 'y' && ans.toLowerCase() !== 'yes') {
      await browser.close();
      process.exit(0);
    }
  } else {
    console.log('✅ 登录成功，SESSDATA 已保存\n');
  }

  await page.close();
  await context.close();
  return true;
}

// ─── Retry with exponential backoff ─────────────────────────────
async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message?.includes('412') || err.message?.includes('429');
      if (attempt === maxRetries || isRateLimit) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 1000;
      console.log(`  ${label} 失败 (第${attempt}次)，${(delay / 1000).toFixed(1)}秒后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── CSV export ─────────────────────────────────────────────────
function exportCsv(replies, bvid, isPartial = false) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const suffix = isPartial ? '_partial' : '';
  const csvPath = path.join(OUTPUT_DIR, `bilibili_${ts}${suffix}.csv`);

  const rows = ['text,likes,create_time,username,platform,source_id,source_url'];
  for (const r of replies) {
    rows.push(csvRow(r.content, r.like, r.ctime, r.uname, 'bilibili', String(r.rpid), `https://www.bilibili.com/video/${bvid}`));
    for (const sr of (r.sub_replies || [])) {
      rows.push(csvRow(sr.content, sr.like, sr.ctime, sr.uname, 'bilibili', String(sr.rpid), `https://www.bilibili.com/video/${bvid}`));
    }
  }

  writeFileSync(csvPath, '﻿' + rows.join('\n'), 'utf-8');
  console.log(`\nCSV 已导出: ${csvPath} (${replies.length} 条主评论)`);
  return csvPath;
}

function csvRow(text, likes, ctime, username, platform, sourceId, sourceUrl) {
  const escape = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  const timeStr = ctime ? new Date(ctime * 1000).toISOString() : '';
  return [escape(text), likes || 0, escape(timeStr), escape(username), platform, sourceId, escape(sourceUrl)].join(',');
}

// ─── B站 API ────────────────────────────────────────────────────
async function fetchVideoInfo(page, bvid) {
  return withRetry(async () => {
    const resp = await page.request.get(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: { 'Referer': `https://www.bilibili.com/video/${bvid}` } }
    );
    const json = await resp.json();
    if (json.code !== 0) throw new Error(`API code ${json.code}: ${json.message}`);
    const d = json.data;
    return { title: d.title, desc: d.desc, owner: d.owner, stat: d.stat, aid: d.aid, cid: d.cid };
  }, '获取视频信息');
}

async function fetchReplies(page, bvid, oid, nextOffset, mode) {
  const url = `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${oid}&mode=${mode}&next=${nextOffset}`;
  try {
    const resp = await withRetry(async () => {
      const r = await page.request.get(url, {
        headers: { 'Referer': `https://www.bilibili.com/video/${bvid}`, 'Origin': 'https://www.bilibili.com' },
        timeout: 15000,
      });
      const j = await r.json();
      if (j.code !== 0) throw new Error(`API code ${j.code}: ${j.message}`);
      return j;
    }, `评论页(mode=${mode},offset=${nextOffset})`);

    const cursor = resp.data?.cursor || {};
    const replies = (resp.data?.replies || []).map(r => ({
      content: r.content?.message || '',
      like: r.like || 0,
      rpid: r.rpid,
      uname: r.member?.uname || '',
      rcount: r.rcount || 0,
      ctime: r.ctime,
      sub_replies: [],
    }));

    // Fetch sub-replies for popular comments
    for (const reply of replies) {
      if (reply.rcount > 0) {
        try {
          const subUrl = `https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${oid}&root=${reply.rpid}&ps=20&pn=1`;
          const subJson = await withRetry(async () => {
            const subResp = await page.request.get(subUrl, {
              headers: { 'Referer': `https://www.bilibili.com/video/${bvid}` },
              timeout: 10000,
            });
            const j = await subResp.json();
            if (j.code !== 0) throw new Error(`Sub API code ${j.code}`);
            return j;
          }, `子评论(rpid=${reply.rpid})`, 2);

          if (subJson.data?.replies) {
            reply.sub_replies = subJson.data.replies.map(sr => ({
              content: sr.content?.message || '',
              like: sr.like || 0,
              rpid: sr.rpid,
              uname: sr.member?.uname || '',
              ctime: sr.ctime,
            }));
          }
          await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        } catch { /* sub-reply failure is non-fatal */ }
      }
    }

    return {
      replies,
      cursor: {
        is_end: cursor.is_end ?? false,
        next: cursor.next ?? nextOffset,
        all_count: cursor.all_count ?? 0,
      },
    };
  } catch (e) {
    return { replies: [], cursor: null, error: e.message };
  }
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  currentBvid = opts.bvid || '';

  console.log('\n=== OutEye Playwright B站采集器 ===');
  console.log('输出模式: CSV（由 P0 页面导入 Supabase）\n');

  const browser = await chromium.launch({
    headless: opts.headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    // ── Login mode ──
    if (opts.login) {
      await ensureLogin(browser);
      await browser.close();
      return;
    }

    // ── Ensure login before scraping ──
    if (!opts.skipLoginCheck) {
      await ensureLogin(browser);
    }

    console.log(`BV号: ${opts.bvid}`);
    console.log(`窗口: ${opts.headless ? '无头' : '有头'}\n`);

    // Create scraping context with validated cookies
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
    });
    await loadCookies(context);
    const page = await context.newPage();

    // 1. Navigate to video to establish session
    console.log('[1/4] 打开视频页面...');
    await page.goto(`https://www.bilibili.com/video/${opts.bvid}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await saveCookies(context);

    // 2. Get video info
    console.log('[2/4] 获取视频信息...');
    const videoInfo = await fetchVideoInfo(page, opts.bvid);
    if (!videoInfo) {
      console.error('无法获取视频信息，退出');
      await browser.close();
      process.exit(1);
    }
    console.log(`  标题: ${videoInfo.title}`);
    console.log(`  评论数: ${videoInfo.stat?.reply || '未知'}`);
    const oid = videoInfo.aid;

    // 3. Collect comments
    console.log('\n[3/4] 采集评论...');
    const allRepliesMap = new Map();

    // Phase A: Hot comments
    console.log('  阶段A: 热门评论 (mode=3)...');
    const hotResult = await fetchReplies(page, opts.bvid, oid, 0, 3);
    for (const r of hotResult.replies) allRepliesMap.set(r.rpid, r);
    collectedReplies = Array.from(allRepliesMap.values());
    console.log(`  热评: ${hotResult.replies.length} 条, 累计 ${allRepliesMap.size} 条`);
    if (hotResult.cursor?.all_count) console.log(`  API 报告总评论数: ${hotResult.cursor.all_count}`);
    await new Promise(r => setTimeout(r, 500));

    // Phase B: Chronological, paginated
    console.log('  阶段B: 全量采集 (mode=2)...');
    let nextOffset = 0;
    let scrollCount = 0;
    let noNewCount = 0;

    while (scrollCount < opts.maxScroll && allRepliesMap.size < opts.maxComments) {
      scrollCount++;
      const prevSize = allRepliesMap.size;

      const result = await fetchReplies(page, opts.bvid, oid, nextOffset, 2);

      if (result.error) {
        const isRateLimit = result.error.includes('412') || result.error.includes('429');
        if (isRateLimit) {
          console.log(`  ⚠️ B站限流 (HTTP 412/429)，已采集 ${allRepliesMap.size} 条`);
          break;
        }
        console.error(`  API 错误: ${result.error}`);
        break;
      }

      for (const r of result.replies) allRepliesMap.set(r.rpid, r);
      collectedReplies = Array.from(allRepliesMap.values());

      const added = allRepliesMap.size - prevSize;
      if (scrollCount % 5 === 0 || added > 0) {
        console.log(`  第 ${scrollCount} 页: +${added}, 累计 ${allRepliesMap.size} 条`);
      }

      // Check end conditions
      if (result.cursor?.is_end) {
        console.log('  ✅ 已到达评论末尾 (cursor.is_end=true)');
        break;
      }
      if (result.replies.length === 0) {
        console.log('  ✅ 本页无评论，停止');
        break;
      }

      if (added === 0) {
        noNewCount++;
        if (noNewCount >= 3) {
          console.log('  ⚠️ 连续3次无新评论，停止');
          console.log('  （如果评论数远少于预期，请检查是否已登录）');
          break;
        }
      } else {
        noNewCount = 0;
      }

      nextOffset = result.cursor?.next ?? 0;
      const delay = 2000 + Math.random() * 3000;
      await new Promise(r => setTimeout(r, delay));
    }

    const allReplies = Array.from(allRepliesMap.values());
    collectedReplies = allReplies;
    console.log(`\n采集完成: ${allReplies.length} 条主评论`);

    if (allReplies.length === 0) {
      console.log('\n未采集到评论。可能原因：');
      console.log('  1. Cookie 已过期，请运行 --login 重新登录');
      console.log('  2. 视频已删除或限制访问');
      console.log('  3. B站 API 结构变化');
      await browser.close();
      return;
    }

    // 4. Export CSV
    console.log('\n[4/4] 导出 CSV...');
    const csvPath = exportCsv(allReplies, opts.bvid);

    // Summary
    const totalWithSub = allReplies.reduce((sum, r) => sum + 1 + (r.sub_replies?.length || 0), 0);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`采集汇总`);
    console.log(`${'='.repeat(50)}`);
    console.log(`视频: ${videoInfo.title}`);
    console.log(`主评论: ${allReplies.length} 条`);
    console.log(`含子评论: ${totalWithSub} 条`);
    console.log(`CSV: ${csvPath}`);
    console.log(`\n下一步：回到 P0 页面 → 数据文件 → 扫描文件 → 预览 → 导入`);

    await saveCookies(context);

  } catch (err) {
    console.error('\nError:', err.message);
    if (collectedReplies.length > 0) {
      console.log(`正在保存已采集的 ${collectedReplies.length} 条评论...`);
      exportCsv(collectedReplies, opts.bvid, true);
    }
  } finally {
    await browser.close();
  }
}

main();
