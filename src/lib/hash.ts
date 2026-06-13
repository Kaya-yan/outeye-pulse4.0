import type { SamplingConfig } from '@/types';

export const AD_PATTERN = /加微信|私聊|优惠|折扣|代购|链接|下单|购买|vx|淘宝|拼多多/i;

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Simple DJB2 hash for content deduplication.
 * Returns a base-36 string to keep Supabase storage compact.
 */
export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

const DEFAULT_SAMPLING: SamplingConfig = {
  high_likes_threshold: 100,
  high_likes_retention: 1.0,
  mid_likes_retention: 1.0,
  low_likes_retention: 1.0,
  batch_size: 10,
};

export function getSamplingTier(likes: number, config: SamplingConfig = DEFAULT_SAMPLING): 'high' | 'mid' | 'low' {
  if (likes >= config.high_likes_threshold) return 'high';
  if (likes >= config.high_likes_threshold / 10) return 'mid';
  return 'low';
}

export function computeSampling(likes: number, config: SamplingConfig = DEFAULT_SAMPLING): { sampling_tier: 'high' | 'mid' | 'low'; is_sampled: boolean } {
  const tier = getSamplingTier(likes, config);
  const retention = tier === 'high' ? config.high_likes_retention
    : tier === 'mid' ? config.mid_likes_retention
    : config.low_likes_retention;
  return { sampling_tier: tier, is_sampled: Math.random() < retention };
}

const CHUNK_SIZE = 500;

/**
 * Given an array of content hashes, queries the DB for which ones already exist.
 * Returns a Set of existing hashes for O(1) lookup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findExistingHashes(supabase: any, hashes: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
    const chunk = hashes.slice(i, i + CHUNK_SIZE);
    const { data: rows } = await supabase
      .from('comments')
      .select('content_hash')
      .in('content_hash', chunk);
    for (const r of rows || []) {
      if (r.content_hash) existing.add(r.content_hash);
    }
  }
  return existing;
}
