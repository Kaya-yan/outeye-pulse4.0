-- Migration 012: Add content column to posts for video subtitles/note content
-- Used by bilibili-subtitle extraction and xiaohongshu note content storage

ALTER TABLE posts ADD COLUMN IF NOT EXISTS content TEXT;

-- Index for full-text search on content (optional, for future use)
-- CREATE INDEX IF NOT EXISTS idx_posts_content_gin ON posts USING gin(to_tsvector('chinese', content));
