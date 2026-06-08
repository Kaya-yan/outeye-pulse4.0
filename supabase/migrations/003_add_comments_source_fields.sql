-- Migration 003: Add source tracking fields to comments table
-- Run this in Supabase SQL Editor

ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_tool TEXT DEFAULT 'api';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_comments_content_hash ON comments(content_hash);
CREATE INDEX IF NOT EXISTS idx_comments_source_tool ON comments(source_tool);
