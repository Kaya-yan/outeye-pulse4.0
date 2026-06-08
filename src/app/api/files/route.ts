import { NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import path from 'path';

interface CsvFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  platform: 'xhs' | 'bilibili';
  source: 'mediacrawler' | 'playwright';
}

function scanDir(dir: string, platform: 'xhs' | 'bilibili', source: 'mediacrawler' | 'playwright'): CsvFile[] {
  const files: CsvFile[] = [];
  try {
    if (!statSync(dir).isDirectory()) return files;
  } catch {
    return files;
  }
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.csv')) continue;
      const fullPath = path.join(dir, entry);
      try {
        const stat = statSync(fullPath);
        files.push({
          name: entry,
          path: fullPath,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          platform,
          source,
        });
      } catch { /* skip unreadable */ }
    }
  } catch { /* dir unreadable */ }
  return files;
}

export async function GET() {
  const cwd = process.cwd();
  const files: CsvFile[] = [];

  // MediaCrawler output
  for (const platform of ['xhs', 'bilibili'] as const) {
    files.push(...scanDir(path.join(cwd, 'tools', 'MediaCrawler', 'data', platform), platform, 'mediacrawler'));
  }

  // Playwright output (flat directory with platform prefix in filename)
  const pwDir = path.join(cwd, 'scripts', 'playwright-scraper', 'output');
  try {
    if (statSync(pwDir).isDirectory()) {
      for (const entry of readdirSync(pwDir)) {
        if (!entry.endsWith('.csv')) continue;
        const fullPath = path.join(pwDir, entry);
        try {
          const stat = statSync(fullPath);
          const platform = entry.startsWith('xhs') ? 'xhs' : 'bilibili';
          files.push({
            name: entry,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            platform,
            source: 'playwright',
          });
        } catch { /* skip */ }
      }
    }
  } catch { /* dir missing */ }

  files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  return NextResponse.json({ files });
}
