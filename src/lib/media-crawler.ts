// MediaCrawler integration utilities
// Generates config snippets and commands for manual execution

export interface CrawlerConfig {
  platform: 'xhs' | 'bilibili';
  keyword: string;
  count: number;
  collectComments: boolean;
  collectSubComments: boolean;
  collectDanmaku?: boolean; // B站弹幕
}

export interface DataFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  platform: 'xhs' | 'bilibili';
}

const TOOLS_DIR = 'tools/MediaCrawler';

export function getCrawlerDir(): string {
  return TOOLS_DIR;
}

export function getDataDir(platform: 'xhs' | 'bilibili'): string {
  return `${TOOLS_DIR}/data/${platform}`;
}

export function getConfigPath(platform: 'xhs' | 'bilibili'): string {
  return `${TOOLS_DIR}/config/${platform}_config.py`;
}

// Generate the Python config snippet for the user to paste
export function generateConfigSnippet(config: CrawlerConfig): string {
  const { platform, keyword, count, collectComments, collectSubComments, collectDanmaku } = config;

  if (platform === 'xhs') {
    return `# === OutEye 采集配置（复制到 ${getConfigPath('xhs')} 对应位置）===
# 替换 keywords 列表
keywords = ["${keyword}"]

# 采集数量限制
crawler_max_notes_count = ${count}

# 登录方式（cookie 需要先扫码登录一次）
login_type = "cookie"  # 可选: "cookie" / "qrcode"

# 是否采集评论
${collectComments ? '' : '# '}enable_comments = ${collectComments ? 'True' : 'False'}

# 是否采集二级评论（子回复）
${collectSubComments ? '' : '# '}enable_sub_comments = ${collectSubComments ? 'True' : 'False'}

# 数据保存方式
save_data_option = "csv"  # 可选: "csv" / "json" / "db"`;
  }

  // bilibili
  return `# === OutEye 采集配置（复制到 ${getConfigPath('bilibili')} 对应位置）===
# 替换 keywords 列表（搜索关键词）
keywords = ["${keyword}"]

# 采集数量限制
crawler_max_dynamics_count = ${count}

# 登录方式
login_type = "cookie"  # 可选: "cookie" / "qrcode"

# 是否采集评论
${collectComments ? '' : '# '}enable_comments = ${collectComments ? 'True' : 'False'}

# 是否采集二级评论
${collectSubComments ? '' : '# '}enable_sub_comments = ${collectSubComments ? 'True' : 'False'}

# 是否采集弹幕
${collectDanmaku ? '' : '# '}enable_danmaku = ${collectDanmaku ? 'True' : 'False'}

# 数据保存方式
save_data_option = "csv"`;
}

// Generate the terminal command to copy
export function generateCommand(config: CrawlerConfig): string {
  const { platform } = config;
  return `cd ${TOOLS_DIR} && python main.py --platform ${platform} --lt cookie --type search --save_data_option csv`;
}

// Expected output file pattern
export function getOutputPattern(platform: 'xhs' | 'bilibili'): string {
  if (platform === 'xhs') {
    return 'data/xhs/search_comments_YYYYMMDD.csv';
  }
  return 'data/bilibili/detail_comments_YYYYMMDD.csv';
}

// Clean CSV data and return preview
export interface CleanResult {
  kept: Record<string, string>[];
  removed: { row: Record<string, string>; reason: string }[];
  stats: { total: number; kept: number; removed: number; duplicates: number };
}

export function cleanCsvData(
  rows: Record<string, string>[],
  existingHashes: Set<string>
): CleanResult {
  const kept: Record<string, string>[] = [];
  const removed: { row: Record<string, string>; reason: string }[] = [];
  let duplicates = 0;

  for (const row of rows) {
    // Get text field (various possible column names)
    const text = row.comment_content || row.content || row.text || row.comment || '';
    const username = row.user_nickname || row.nickname || row.username || row.user_name || '';
    const createTime = row.create_time || row.time || row.date || row.created_at || '';

    // Skip empty
    if (!text || text.trim().length === 0) {
      removed.push({ row, reason: '空评论' });
      continue;
    }

    // Skip very short (likely emoji-only or garbage)
    if (text.trim().length < 2) {
      removed.push({ row, reason: '过短（<2字符）' });
      continue;
    }

    // Skip obvious ads
    const adPatterns = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;
    if (adPatterns.test(text)) {
      removed.push({ row, reason: '疑似广告' });
      continue;
    }

    // Dedup by content hash
    const hashInput = `${text.trim()}|${username}|${createTime}`;
    // Simple hash (not crypto, but fast and sufficient for dedup)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(36);

    if (existingHashes.has(hashStr)) {
      duplicates++;
      removed.push({ row, reason: '重复数据' });
      continue;
    }
    existingHashes.add(hashStr);

    // Store hash in row for later use
    row._content_hash = hashStr;
    kept.push(row);
  }

  return {
    kept,
    removed,
    stats: {
      total: rows.length,
      kept: kept.length,
      removed: removed.length - duplicates,
      duplicates,
    },
  };
}

// Map CSV columns to Comment fields for Supabase insertion
export function mapCsvToComment(
  row: Record<string, string>,
  postId: string,
  projectId: string
): Record<string, unknown> {
  const text = row.comment_content || row.content || row.text || row.comment || '';
  const likes = parseInt(row.like_count || row.likes || row.like || '0') || 0;
  const username = row.user_nickname || row.nickname || row.username || row.user_name || '';
  const createTime = row.create_time || row.time || row.date || row.created_at || '';
  const sourceUrl = row.note_url || row.video_url || row.url || row.link || '';

  return {
    post_id: postId,
    project_id: projectId,
    text: text.trim(),
    likes,
    sampling_tier: likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low',
    is_sampled: likes >= 100 || Math.random() < 0.5,
    source_tool: 'media_crawler',
    source_url: sourceUrl || null,
    content_hash: row._content_hash || null,
  };
}

// Determine platform from CSV file path or headers
export function detectPlatformFromCsv(
  filePath: string,
  headers: string[]
): 'xhs' | 'bilibili' | null {
  if (filePath.includes('/xhs/') || filePath.includes('\\xhs\\')) return 'xhs';
  if (filePath.includes('/bilibili/') || filePath.includes('\\bilibili\\')) return 'bilibili';
  // Guess from headers
  if (headers.includes('note_url') || headers.includes('note_id')) return 'xhs';
  if (headers.includes('video_url') || headers.includes('bv_id')) return 'bilibili';
  return null;
}
