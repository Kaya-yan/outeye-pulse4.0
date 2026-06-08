// B站 API 服务
// 用于获取视频信息和评论

const BILIBILI_API = {
  search: 'https://search.bilibili.com/all',
  view: 'https://api.bilibili.com/x/web-interface/view',
  reply: 'https://api.bilibili.com/x/v2/reply/main',
};

export interface BilibiliVideo {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
  pubdate: number;
  pic: string;
}

export interface BilibiliReply {
  rpid: number;
  mid: number;
  uname: string;
  content: {
    message: string;
    [key: string]: unknown;
  };
  like: number;
  rcount: number;
  ctime: number;
  replies?: BilibiliReply[];
}

export async function fetchVideoInfo(bvid: string): Promise<BilibiliVideo | null> {
  try {
    const response = await fetch(`/api/bilibili/video?bvid=${bvid}`);
    const data = await response.json();

    if (data.code !== 0) {
      console.error('Bilibili API error:', data.message);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching video info:', error);
    return null;
  }
}

export async function fetchVideoReplies(
  bvid: string,
  cursor = '0',
  mode: '2' | '3' = '2'
): Promise<{ replies: BilibiliReply[]; total: number; hasMore: boolean; nextCursor: string | null; error?: string }> {
  try {
    const response = await fetch(
      `/api/bilibili/replies?bvid=${bvid}&cursor=${cursor}&mode=${mode}`
    );
    const data = await response.json();

    if (data.code !== 0) {
      console.error('Bilibili API error:', data.message);
      return { replies: [], total: 0, hasMore: false, nextCursor: null, error: data.message };
    }

    return {
      replies: data.data?.replies || [],
      total: data.data?.total || 0,
      hasMore: data.data?.hasMore || false,
      nextCursor: data.data?.nextCursor || null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching replies:', msg);
    return { replies: [], total: 0, hasMore: false, nextCursor: null, error: msg };
  }
}

export function extractBvid(url: string): string | null {
  // 支持多种 B站 URL 格式
  const patterns = [
    /bilibili\.com\/video\/(BV\w+)/,
    /b23\.tv\/(BV\w+)/,
    /bilibili\.com\/video\/(av\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // 直接输入 BV 号
  if (/^BV\w+$/.test(url)) return url;

  return null;
}
