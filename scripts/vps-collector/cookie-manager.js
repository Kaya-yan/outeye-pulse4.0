/**
 * XHS Cookie Manager
 * Provides QR code login and cookie validation for XHS.
 *
 * Usage:
 *   node cookie-manager.js login    — Show QR code for XHS login, save cookies
 *   node cookie-manager.js check    — Validate existing cookies
 *   node cookie-manager.js export   — Print cookies as JSON for .env
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from 'dotenv';

config();

const COOKIE_FILE = './cookies/xhs.json';

function loadCookies() {
  if (existsSync(COOKIE_FILE)) {
    return JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
  }
  return null;
}

function saveCookies(cookies) {
  if (!existsSync('./cookies')) mkdirSync('./cookies', { recursive: true });
  writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`Cookies saved to ${COOKIE_FILE}`);
}

async function login() {
  console.log('Launching browser for XHS login...');
  console.log('A browser window will open. Please scan the QR code to login.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });

  console.log('\nWaiting for login... (the browser will close automatically after successful login)');

  // Wait for login to complete (check for user avatar or specific cookie)
  let attempts = 0;
  while (attempts < 120) { // 2 minutes timeout
    const cookies = await context.cookies();
    const webSession = cookies.find(c => c.name === 'web_session');
    if (webSession && webSession.value) {
      console.log('Login successful!');
      saveCookies(cookies);

      // Also print as env variable
      console.log('\nAdd this to your .env file:');
      console.log(`XHS_COOKIES=${JSON.stringify(JSON.stringify(cookies))}`);

      await browser.close();
      return;
    }

    await page.waitForTimeout(1000);
    attempts++;
  }

  console.log('Login timeout. Please try again.');
  await browser.close();
}

async function check() {
  const cookies = loadCookies();
  if (!cookies) {
    console.log('No cookies found. Run: node cookie-manager.js login');
    return;
  }

  console.log('Checking XHS cookies...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    const response = await page.goto('https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.success || data.data?.nickname) {
        console.log(`Cookies valid. Logged in as: ${data.data?.nickname || 'unknown'}`);
      } else {
        console.log('Cookies may be expired. Please re-login.');
        console.log('Response:', text.slice(0, 200));
      }
    } catch {
      console.log('Unexpected response. Cookies may be invalid.');
    }
  } catch (err) {
    console.error('Connection error:', err.message);
  } finally {
    await browser.close();
  }
}

async function exportCookies() {
  const cookies = loadCookies();
  if (!cookies) {
    console.log('No cookies found. Run: node cookie-manager.js login');
    return;
  }

  console.log('\nAdd this to your .env file:');
  console.log(`XHS_COOKIES=${JSON.stringify(JSON.stringify(cookies))}`);
}

// ─── Main ────────────────────────────────────────────────────────
const command = process.argv[2];

switch (command) {
  case 'login':
    login().catch(console.error);
    break;
  case 'check':
    check().catch(console.error);
    break;
  case 'export':
    exportCookies();
    break;
  default:
    console.log('Usage:');
    console.log('  node cookie-manager.js login    — QR code login');
    console.log('  node cookie-manager.js check    — Validate cookies');
    console.log('  node cookie-manager.js export   — Print cookies for .env');
}
