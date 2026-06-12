import { createHash } from 'crypto';

/**
 * Bilibili WBI signature for search API.
 * Ported from tools/MediaCrawler/media_platform/bilibili/help.py
 */

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

const BILI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Accept': 'application/json',
};

// Cache WBI keys to avoid fetching on every request
let cachedKeys: { imgKey: string; subKey: string; fetchedAt: number } | null = null;
const KEY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getMixinKey(imgKey: string, subKey: string): string {
  const mixin = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map(i => mixin[i] || '').join('').slice(0, 32);
}

export function wbiSign(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
): Record<string, string> {
  const salt = getMixinKey(imgKey, subKey);
  const wts = Math.floor(Date.now() / 1000).toString();

  const merged: Record<string, string> = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), wts };

  // Sort by key
  const sorted = Object.fromEntries(Object.entries(merged).sort());

  // Filter forbidden characters from values
  for (const key of Object.keys(sorted)) {
    sorted[key] = sorted[key].replace(/[!'()*]/g, '');
  }

  const query = new URLSearchParams(sorted).toString();
  const wrid = createHash('md5').update(query + salt).digest('hex');
  sorted.w_rid = wrid;
  return sorted;
}

export async function getWbiKeys(): Promise<{ imgKey: string; subKey: string } | null> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < KEY_CACHE_TTL) {
    return { imgKey: cachedKeys.imgKey, subKey: cachedKeys.subKey };
  }

  try {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: BILI_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    const wbiImg = data?.data?.wbi_img;
    if (!wbiImg?.img_url || !wbiImg?.sub_url) return null;

    // Extract key from URL: https://i0.hdslb.com/bfs/wbi/xxx.png -> xxx
    const extractKey = (url: string) => url.split('/').pop()?.split('.')[0] || '';

    const imgKey = extractKey(wbiImg.img_url);
    const subKey = extractKey(wbiImg.sub_url);

    cachedKeys = { imgKey, subKey, fetchedAt: Date.now() };
    return { imgKey, subKey };
  } catch {
    return null;
  }
}

export interface BiliSearchResult {
  bvid: string;
  aid: number;
  title: string;
  author: string;
  mid: number;
  play: number;
  danmaku: number;
  favorites: number;
  likes: number;
  review: number;   // comment count
  pubdate: number;   // unix timestamp
  duration: string;
  description: string;
  pic: string;       // cover image url
  tag: string;
}

export async function searchBilibili(
  keyword: string,
  options: {
    page?: number;
    pageSize?: number;
    order?: '' | 'click' | 'pubdate' | 'dm' | 'stow';
    pubtimeBegin?: number;  // unix timestamp
    pubtimeEnd?: number;    // unix timestamp
  } = {},
): Promise<{ results: BiliSearchResult[]; total: number; pages: number } | null> {
  const keys = await getWbiKeys();
  if (!keys) return null;

  const params: Record<string, string | number> = {
    search_type: 'video',
    keyword,
    page: options.page || 1,
    page_size: options.pageSize || 20,
    order: options.order || '',
  };

  if (options.pubtimeBegin) params.pubtime_begin_s = options.pubtimeBegin;
  if (options.pubtimeEnd) params.pubtime_end_s = options.pubtimeEnd;

  const signed = wbiSign(params, keys.imgKey, keys.subKey);
  const qs = new URLSearchParams(signed).toString();

  try {
    const resp = await fetch(
      `https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`,
      { headers: BILI_HEADERS, signal: AbortSignal.timeout(15000) },
    );
    if (!resp.ok) return null;

    const data = await resp.json();
    if (data.code !== 0) return null;

    const results: BiliSearchResult[] = (data.data?.result || []).map((r: Record<string, unknown>) => ({
      bvid: r.bvid as string,
      aid: r.aid as number,
      title: stripHtml(r.title as string),
      author: r.author as string,
      mid: r.mid as number,
      play: r.play as number,
      danmaku: r.danmaku as number,
      favorites: r.favorites as number,
      likes: (r.like ?? 0) as number,
      review: r.review as number,
      pubdate: r.pubdate as number,
      duration: r.duration as string,
      description: r.description as string,
      pic: r.pic as string,
      tag: r.tag as string,
    }));

    return {
      results,
      total: data.data?.numResults || 0,
      pages: data.data?.numPages || 0,
    };
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
