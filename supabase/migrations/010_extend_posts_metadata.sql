-- ============================================================
-- Migration 010: Extend posts metadata + deduplicate posts
-- Run in Supabase Dashboard SQL Editor AFTER 009
-- ============================================================

-- ── PART A: Add missing columns to posts ──

ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count bigint DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS description text;

-- ── PART B: Deduplicate posts ──
-- Problem: same video URL was inserted multiple times, creating duplicate posts
-- Solution: keep the post with the most comments, reassign others, delete duplicates

-- Step 1: For each project+url combo, find the "canonical" post (earliest created, or most comments)
-- Step 2: Reassign comments from duplicate posts to the canonical one
-- Step 3: Delete the empty duplicate posts

DO $$
DECLARE
  dup RECORD;
  canonical_id uuid;
BEGIN
  -- Find duplicate groups (same project_id + same url)
  FOR dup IN
    SELECT project_id, url, array_agg(id ORDER BY created_at) as ids, count(*) as cnt
    FROM posts
    WHERE url IS NOT NULL AND url != ''
    GROUP BY project_id, url
    HAVING count(*) > 1
  LOOP
    -- Pick the first one as canonical (earliest created)
    canonical_id := dup.ids[1];

    -- Reassign comments from all other posts in this group to the canonical one
    UPDATE comments
    SET post_id = canonical_id
    WHERE post_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);

    -- Delete the now-empty duplicate posts
    DELETE FROM posts
    WHERE id = ANY(dup.ids[2:array_length(dup.ids, 1)]);

    RAISE NOTICE 'Merged % duplicate posts for url % into %', dup.cnt - 1, dup.url, canonical_id;
  END LOOP;
END $$;

-- Step 4: Also handle posts with NULL url but same title in same project
DO $$
DECLARE
  dup RECORD;
  canonical_id uuid;
BEGIN
  FOR dup IN
    SELECT project_id, title, array_agg(id ORDER BY created_at) as ids, count(*) as cnt
    FROM posts
    WHERE url IS NULL OR url = ''
    GROUP BY project_id, title
    HAVING count(*) > 1
  LOOP
    canonical_id := dup.ids[1];
    UPDATE comments SET post_id = canonical_id WHERE post_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    DELETE FROM posts WHERE id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    RAISE NOTICE 'Merged % duplicate posts (no url) for title %', dup.cnt - 1, dup.title;
  END LOOP;
END $$;

-- ── PART C: Add index for faster dedup lookups ──
CREATE INDEX IF NOT EXISTS idx_posts_project_url ON posts(project_id, url);

-- ── Verify ──
SELECT p.id, p.title, p.platform, p.view_count, p.creator_name, p.aigc_type,
       (SELECT count(*) FROM comments c WHERE c.post_id = p.id) as comment_count
FROM posts p
ORDER BY p.project_id, p.created_at;
