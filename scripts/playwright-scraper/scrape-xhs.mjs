#!/usr/bin/env node
/**
 * OutEye Playwright 小红书评论采集器
 *
 * 通过 API 拦截方式采集小红书评论（不依赖 DOM 选择器）。
 * 页面滚动时浏览器自动调用评论 API，脚本拦截响应并提取结构化数据。
 *
 * Usage:
 *   node scrape-xhs.mjs --url=https://www.xiaohongshu.com/explore/xxx
 *   node scrape-xhs.mjs --login   # 强制登录模式
 *
 * Options:
 *   --url=<string>        小红书笔记链接（必填，除非 --login）
 *   --max-scroll=<n>      最大滚动次数（默认30）
 *   --max-comments=<n>    最大评论数（默认1000）
 *   --headless            无头模式（默认有头）
 *   --login               强制登录模式，更新 Cookie
 *   --skip-login-check    跳过登录检测（用于调试）
 *
 * 输出：
 *   CSV 文件保存到 output/xhs_YYYYMMDD_HHMMSS.csv
 *   中断时保存到 output/xhs_YYYYMMDD_HHMMSS_partial.csv
 *   导入：回到 P0 页面"数据文件"区域，扫描后导入
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

// ─── State for interrupt-safe export ────────────────────────────
let collectedComments = [];
let currentNoteUrl = '';
let interruptSaved = false;

function savePartialOnInterrupt() {
  if (interruptSaved || collectedComments.length === 0) return;
  interruptSaved = true;
  console.log(`\n\n⚠️  检测到中断，正在保存已采集的 ${collectedComments.length} 条评论...`);
  exportCsv(collectedComments, currentNoteUrl, true);
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
  const opts = { url: null, maxScroll: 30, maxComments: 1000, headless: false, login: false, skipLoginCheck: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--url=')) opts.url = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--max-scroll=')) opts.maxScroll = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--max-comments=')) opts.maxComments = parseInt(arg.split('=')[1]);
    else if (arg === '--headless') opts.headless = true;
    else if (arg === '--login') opts.login = true;
    else if (arg === '--skip-login-check') opts.skipLoginCheck = true;
  }

  if (!opts.login && !opts.url) {
    console.error('Usage: node scrape-xhs.mjs --url=<xhs-url>');
    console.error('       node scrape-xhs.mjs --login');
    process.exit(1);
  }
  return opts;
}

// ─── Cookie management ──────────────────────────────────────────
function getCookies() {
  if (!existsSync(COOKIES_PATH)) return [];
  try { return JSON.parse(readFileSync(COOKIES_PATH, 'utf-8')); } catch { return []; }
}

function hasXhsSession(cookies) {
  // XHS login cookies: web_session, a1, webId
  const hasWebSession = cookies.some(c => c.name === 'web_session' && c.value && c.value.length > 5);
  const hasA1 = cookies.some(c => c.name === 'a1' && c.value && c.value.length > 5);
  return hasWebSession || hasA1;
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
  const cookies = getCookies();
  if (hasXhsSession(cookies)) {
    console.log('  ✅ 检测到小红书登录 Cookie');
    return true;
  }

  console.log('\n' + '='.repeat(50));
  console.log('⚠️  未检测到小红书登录状态');
  console.log('='.repeat(50));
  console.log('\n即将打开浏览器，请在页面中扫码登录小红书。');
  console.log('登录成功后，回到此终端按回车键继续。\n');

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });

  const existingCookies = getCookies();
  if (existingCookies.length > 0) {
    await context.addCookies(existingCookies);
  }

  const page = await context.newPage();
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('👆 请在浏览器窗口中扫码登录小红书');
  console.log('   登录成功后，回到此终端按回车键...\n');

  await prompt('按回车键继续 →');

  await saveCookies(context);

  const newCookies = getCookies();
  if (!hasXhsSession(newCookies)) {
    console.log('\n⚠️  仍未检测到登录状态。');
    const ans = await prompt('继续? (y/n) → ');
    if (ans.toLowerCase() !== 'y' && ans.toLowerCase() !== 'yes') {
      await browser.close();
      process.exit(0);
    }
  } else {
    console.log('✅ 登录成功，Cookie 已保存\n');
  }

  await page.close();
  await context.close();
  return true;
}

// ─── CSV export ─────────────────────────────────────────────────
function csvRow(text, likes, createTime, username, sourceId, sourceUrl) {
  const escape = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  return [escape(text), likes || 0, escape(createTime), escape(username), 'xhs', sourceId, escape(sourceUrl)].join(',');
}

function exportCsv(comments, noteUrl, isPartial = false) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const suffix = isPartial ? '_partial' : '';
  const csvPath = path.join(OUTPUT_DIR, `xhs_${ts}${suffix}.csv`);

  const rows = ['text,likes,create_time,username,platform,source_id,source_url'];
  for (const c of comments) {
    rows.push(csvRow(c.text, c.likes, c.createTime, c.username, c.commentId, noteUrl));
  }

  writeFileSync(csvPath, '﻿' + rows.join('\n'), 'utf-8');
  console.log(`\nCSV 已导出: ${csvPath} (${comments.length} 条)`);
  return csvPath;
}

// ─── Extract note ID from URL ───────────────────────────────────
function extractNoteId(url) {
  const m = url.match(/(?:explore|discovery\/item|note)\/([a-f0-9]+)/i);
  return m ? m[1] : null;
}

// ─── Parse XHS comment API response ─────────────────────────────
function parseCommentApiResponse(data) {
  const comments = [];
  if (!data?.comments) return comments;

  for (const c of data.comments) {
    const text = c.content || '';
    if (!text || text.trim().length < 2) continue;

    comments.push({
      text: text.trim(),
      likes: c.like_count || c.likeCount || 0,
      username: c.user_info?.nickname || c.user?.nickname || '',
      createTime: c.create_time ? new Date(c.create_time).toISOString() : (c.time || ''),
      commentId: c.id || c.comment_id || '',
    });

    // Sub-comments
    if (c.sub_comments && Array.isArray(c.sub_comments)) {
      for (const sc of c.sub_comments) {
        const subText = sc.content || '';
        if (!subText || subText.trim().length < 2) continue;
        comments.push({
          text: subText.trim(),
          likes: sc.like_count || sc.likeCount || 0,
          username: sc.user_info?.nickname || sc.user?.nickname || '',
          createTime: sc.create_time ? new Date(sc.create_time).toISOString() : (sc.time || ''),
          commentId: sc.id || sc.comment_id || '',
        });
      }
    }
  }
  return comments;
}

// ─── Main scrape logic ──────────────────────────────────────────
async function scrapeNote(page, noteUrl, maxScroll, maxComments) {
  const noteId = extractNoteId(noteUrl);
  if (!noteId) {
    console.error('Error: 无法解析笔记ID，请确认链接格式');
    return [];
  }

  console.log(`\n打开笔记: ${noteUrl}`);
  console.log(`笔记ID: ${noteId}`);

  // Set up API response interception
  const commentApiPattern = /\/api\/sns\/.*comment/i;
  const interceptedComments = new Map();

  page.on('response', async (response) => {
    const url = response.url();
    if (!commentApiPattern.test(url)) return;
    try {
      const json = await response.json();
      if (json.data || json.comments) {
        const parsed = parseCommentApiResponse(json.data || json);
        for (const c of parsed) {
          if (!interceptedComments.has(c.commentId)) {
            interceptedComments.set(c.commentId, c);
          }
        }
      }
    } catch { /* not JSON or parse error */ }
  });

  // Navigate
  try {
    await page.goto(noteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.error(`打开页面失败: ${err.message}`);
    return [];
  }

  await new Promise(r => setTimeout(r, 3000));

  // Close popup
  try {
    const closeBtn = page.locator('[class*="close"], .reds-icon-close').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }
  } catch { /* no popup */ }

  // Scroll to load comments
  console.log('\n滚动加载评论（通过 API 拦截）...');
  let noNewCount = 0;

  for (let scroll = 0; scroll < maxScroll && interceptedComments.size < maxComments; scroll++) {
    const prevSize = interceptedComments.size;

    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));

    // Try clicking "load more"
    try {
      const loadMore = page.locator('[class*="showMore"], [class*="load-more"], [class*="展开"]').first();
      if (await loadMore.isVisible({ timeout: 1000 })) {
        await loadMore.click();
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch { /* no button */ }

    collectedComments = Array.from(interceptedComments.values());
    const added = interceptedComments.size - prevSize;

    if (scroll % 3 === 0 || added > 0) {
      console.log(`  第 ${scroll + 1} 次滚动: +${added}, 累计 ${interceptedComments.size} 条`);
    }

    if (added === 0) {
      noNewCount++;
      if (noNewCount >= 3) {
        console.log('  连续3次无新评论，停止滚动');
        break;
      }
    } else {
      noNewCount = 0;
    }
  }

  collectedComments = Array.from(interceptedComments.values());
  return collectedComments;
}

// ─── Fallback: DOM extraction ───────────────────────────────────
async function scrapeByDomFallback(page, maxScroll) {
  console.log('\nAPI 拦截未捕获到评论，尝试 DOM 提取（降级方案）...');

  const domComments = new Map();

  for (let scroll = 0; scroll < maxScroll; scroll++) {
    const newComments = await page.evaluate(() => {
      const selectors = [
        '[class*="commentItem"]',
        '[class*="comment-item"]',
        '[class*="CommentItem"]',
        '.note-comment',
        '[class*="commentList"] [class*="item"]',
      ];

      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }

      const results = [];
      for (const item of items) {
        const textEl = item.querySelector('[class*="content"], [class*="text"], .note-text');
        const likesEl = item.querySelector('[class*="like"] [class*="count"], [class*="likeCount"], [class*="likeNum"]');
        const userEl = item.querySelector('[class*="name"], [class*="nickname"], [class*="author"]');
        const timeEl = item.querySelector('[class*="time"], [class*="date"]');

        const text = textEl?.textContent?.trim() || '';
        if (!text || text.length < 2) continue;

        const likesStr = likesEl?.textContent?.trim() || '0';
        const likes = parseInt(likesStr.replace(/[^\d]/g, '')) || 0;
        const username = userEl?.textContent?.trim() || '';
        const createTime = timeEl?.textContent?.trim() || '';
        const commentId = `${text.slice(0, 30)}_${username}_${likes}`;

        results.push({ text, likes, username, createTime, commentId });
      }
      return results;
    });

    let added = 0;
    for (const c of newComments) {
      if (!domComments.has(c.commentId)) {
        domComments.set(c.commentId, c);
        added++;
      }
    }

    if (scroll % 3 === 0 || added > 0) {
      console.log(`  DOM 第 ${scroll + 1} 次滚动: +${added}, 累计 ${domComments.size} 条`);
    }

    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

    if (added === 0 && scroll > 3) break;
  }

  if (domComments.size === 0) {
    console.log('\n⚠️  DOM 提取也未找到评论。可能原因：');
    console.log('  1. Cookie 已过期，请运行 --login 重新登录');
    console.log('  2. 笔记已删除或限制访问');
    console.log('  3. 小红书页面结构变化，API 和 DOM 选择器均失效');
  }

  return Array.from(domComments.values());
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  console.log('\n=== OutEye Playwright 小红书采集器 ===');
  console.log('输出模式: CSV（由 P0 页面导入 Supabase）\n');

  const browser = await chromium.launch({
    headless: opts.headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    // Login mode
    if (opts.login) {
      await ensureLogin(browser);
      await browser.close();
      return;
    }

    // Ensure login
    if (!opts.skipLoginCheck) {
      await ensureLogin(browser);
    }

    currentNoteUrl = opts.url;
    console.log(`笔记链接: ${opts.url}`);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
    });
    await loadCookies(context);
    const page = await context.newPage();

    // Primary: API interception
    const comments = await scrapeNote(page, opts.url, opts.maxScroll, opts.maxComments);

    // Fallback: DOM extraction
    let finalComments = comments;
    if (comments.length === 0) {
      finalComments = await scrapeByDomFallback(page, Math.min(opts.maxScroll, 10));
    }

    console.log(`\n采集完成: ${finalComments.length} 条评论`);

    if (finalComments.length === 0) {
      await browser.close();
      return;
    }

    // Export CSV
    const csvPath = exportCsv(finalComments, opts.url);

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`采集汇总`);
    console.log(`${'='.repeat(50)}`);
    console.log(`评论: ${finalComments.length} 条`);
    console.log(`CSV: ${csvPath}`);
    console.log(`\n下一步：回到 P0 页面 → 数据文件 → 扫描文件 → 预览 → 导入`);

    await saveCookies(context);

  } catch (err) {
    console.error('\nError:', err.message);
    if (collectedComments.length > 0) {
      console.log(`正在保存已采集的 ${collectedComments.length} 条评论...`);
      exportCsv(collectedComments, opts.url, true);
    }
  } finally {
    await browser.close();
  }
}

main();
