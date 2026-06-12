# VPS Collector Deployment Guide

## Prerequisites

- A VPS with Node.js 18+ (Alibaba Cloud / Tencent Cloud recommended, ~50元/month)
- Playwright browser dependencies: `npx playwright install-deps chromium`

## Setup

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Clone or copy the vps-collector directory
cd /opt/outeye-collector

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy .env.example to .env and fill in values
cp .env.example .env
nano .env
```

## Environment Variables

Get values from your Supabase dashboard:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxx
PROJECT_ID=run: SELECT id FROM projects LIMIT 1
```

## XHS Cookie Login

XHS requires authentication. Login once to save cookies:

```bash
# On a machine with a display (or use VNC):
node cookie-manager.js login

# The browser opens, scan QR code, cookies are saved to ./cookies/xhs.json

# Verify cookies are valid:
node cookie-manager.js check

# Export cookies for .env:
node cookie-manager.js export
```

## Usage

```bash
# Collect Bilibili comments for a specific video
node bilibili-collector.js --bvid BV1xx411c7mD

# Search and collect Bilibili by keyword
node bilibili-collector.js --keyword "郭永怀" --limit 20

# Collect XHS comments for a specific note
node xhs-collector.js --url "https://www.xiaohongshu.com/explore/xxx"

# Search and collect XHS by keyword
node xhs-collector.js --keyword "郭永怀" --limit 10

# Test connection to Supabase
node test-connection.js
```

## Scheduled Collection (Cron)

```bash
# Edit crontab
crontab -e

# Daily Bilibili keyword collection at 2am
0 2 * * * cd /opt/outeye-collector && node bilibili-collector.js --keyword "郭永怀" --limit 20 >> /var/log/outeye.log 2>&1

# Daily XHS keyword collection at 3am
0 3 * * * cd /opt/outeye-collector && node xhs-collector.js --keyword "郭永怀" --limit 10 >> /var/log/outeye.log 2>&1
```

## Cookie Refresh

XHS cookies expire periodically. When collection fails:

1. Run `node cookie-manager.js login` on a machine with a display
2. Or manually export cookies from your browser and save to `./cookies/xhs.json`
3. Verify with `node cookie-manager.js check`

## Troubleshooting

- **Playwright launch fails**: Run `npx playwright install-deps chromium`
- **Supabase connection fails**: Check .env values, verify RLS policies
- **XHS 461/471 errors**: Cookies expired, re-login
- **Bilibili rate limiting**: Increase BATCH_DELAY_MS in .env
