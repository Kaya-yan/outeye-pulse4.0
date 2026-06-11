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
