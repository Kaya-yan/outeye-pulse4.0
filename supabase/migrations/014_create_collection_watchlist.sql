-- Migration 014: Create collection_watchlist for continuous observation scaffolding

CREATE TABLE IF NOT EXISTS collection_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  target_type TEXT NOT NULL DEFAULT 'content' CHECK (target_type IN ('content', 'keyword', 'author', 'topic')),
  target_value TEXT NOT NULL,
  url TEXT,
  title TEXT,
  author TEXT,
  summary TEXT,
  recall_source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  last_collected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_watchlist_project_created
  ON collection_watchlist(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_watchlist_platform_status
  ON collection_watchlist(platform, status);

ALTER TABLE collection_watchlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "anon_select_collection_watchlist" ON collection_watchlist FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "auth_select_collection_watchlist" ON collection_watchlist FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "anon_insert_collection_watchlist" ON collection_watchlist FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "auth_insert_collection_watchlist" ON collection_watchlist FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "anon_update_collection_watchlist" ON collection_watchlist FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_collection_watchlist' AND tablename = 'collection_watchlist') THEN
    CREATE POLICY "auth_update_collection_watchlist" ON collection_watchlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
