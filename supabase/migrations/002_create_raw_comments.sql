-- Migration 002: Create raw_comments table for Bookmarklet data intake
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS raw_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT CHECK (platform IN ('bilibili', 'xhs')),
  source_id TEXT NOT NULL,
  source_url TEXT,
  text TEXT NOT NULL,
  likes INT DEFAULT 0,
  username_hash TEXT,
  rpid TEXT,
  collected_by TEXT DEFAULT 'bookmarklet',
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'ignored')),
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_comments_status ON raw_comments(status);
CREATE INDEX IF NOT EXISTS idx_raw_comments_source ON raw_comments(platform, source_id);
CREATE INDEX IF NOT EXISTS idx_raw_comments_rpid ON raw_comments(rpid);

-- RLS
ALTER TABLE raw_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_raw_comments" ON raw_comments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_raw_comments" ON raw_comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_raw_comments" ON raw_comments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_raw_comments" ON raw_comments FOR DELETE TO anon USING (true);

CREATE POLICY "auth_select_raw_comments" ON raw_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_raw_comments" ON raw_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_raw_comments" ON raw_comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
