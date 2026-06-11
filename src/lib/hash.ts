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

export function getSamplingTier(likes: number): string {
  return likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low';
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
