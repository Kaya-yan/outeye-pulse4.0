import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';

function run(cmd: string): { ok: boolean; output: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process');
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    return { ok: true, output: out };
  } catch {
    return { ok: false, output: '' };
  }
}

function extractVersion(raw: string): string {
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : raw || 'unknown';
}

export async function GET() {
  // Detect if running on Vercel (serverless, no local tools)
  const isVercel = !!process.env.VERCEL;
  const toolsDir = path.join(process.cwd(), 'tools', 'MediaCrawler');

  if (isVercel) {
    return NextResponse.json({
      python: false,
      pythonVersion: null,
      playwright: false,
      playwrightVersion: null,
      mediaCrawlerStatus: 'not_found' as const,
      mediaCrawlerConfig: false,
      dataDir: false,
      toolsDir,
      allReady: false,
      isCloud: true,
    });
  }

  // Local environment detection
  const py1 = run('python --version');
  const py2 = py1.ok && py1.output ? py1 : run('py --version');
  const python = py2.ok && /python/i.test(py2.output);
  const pythonVersion = python ? extractVersion(py2.output) : null;

  const pw = run('npx playwright --version');
  const playwright = pw.ok;
  const playwrightVersion = playwright ? extractVersion(pw.output) : null;

  const mcMain = existsSync(path.join(toolsDir, 'main.py'));
  const mcConfig = existsSync(path.join(toolsDir, 'config'));
  const mcVenv = existsSync(path.join(toolsDir, 'venv'));

  let mediaCrawlerStatus: 'not_found' | 'downloaded' | 'ready';
  if (!mcMain) {
    mediaCrawlerStatus = 'not_found';
  } else if (!mcVenv || !mcConfig) {
    mediaCrawlerStatus = 'downloaded';
  } else {
    mediaCrawlerStatus = 'ready';
  }

  const dataDir = existsSync(path.join(toolsDir, 'data'));

  return NextResponse.json({
    python,
    pythonVersion,
    playwright,
    playwrightVersion,
    mediaCrawlerStatus,
    mediaCrawlerConfig: mcConfig,
    dataDir,
    toolsDir,
    allReady: python && mediaCrawlerStatus === 'ready',
    isCloud: false,
  });
}
