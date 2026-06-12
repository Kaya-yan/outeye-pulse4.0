-- ============================================================
-- Migration 008: Combined fix for missing tables and columns
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================

-- ── PART A: Create search_tasks and search_results tables ──
-- (from migration 006, which was never applied)

CREATE TABLE IF NOT EXISTS search_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('bilibili', 'xhs')),
  keyword text NOT NULL,
  time_range_start timestamptz,
  time_range_end timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result_count int DEFAULT 0,
  total_comments int DEFAULT 0,
  total_views bigint DEFAULT 0,
  total_likes bigint DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_task_id uuid NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_id text,
  url text,
  title text,
  author text,
  avatar text,
  views bigint DEFAULT 0,
  likes int DEFAULT 0,
  danmaku int DEFAULT 0,
  comments_count int DEFAULT 0,
  favorites int DEFAULT 0,
  duration text,
  description text,
  cover_url text,
  tags text,
  published_at timestamptz,
  collected boolean DEFAULT false,
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_tasks_project ON search_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_search_tasks_keyword ON search_tasks(keyword);
CREATE INDEX IF NOT EXISTS idx_search_results_task ON search_results(search_task_id);
CREATE INDEX IF NOT EXISTS idx_search_results_platform_id ON search_results(platform_id);

ALTER TABLE search_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on search_tasks' AND tablename = 'search_tasks') THEN
    CREATE POLICY "Allow all on search_tasks" ON search_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on search_results' AND tablename = 'search_results') THEN
    CREATE POLICY "Allow all on search_results" ON search_results FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── PART B: Add missing columns to comments ──
-- (from migration 007, which was never applied)

ALTER TABLE comments ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending'
  CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE comments ADD COLUMN IF NOT EXISTS rpid TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_tool TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Backfill analysis_status based on existing analysis JSONB
UPDATE comments SET analysis_status = 'completed' WHERE analysis IS NOT NULL AND analysis_status = 'pending';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_posts_url ON posts(url);
CREATE INDEX IF NOT EXISTS idx_comments_content_hash ON comments(content_hash);


-- ── PART C: Fix FK cascades ──

ALTER TABLE analysis_logs DROP CONSTRAINT IF EXISTS analysis_logs_project_id_fkey;
ALTER TABLE analysis_logs ADD CONSTRAINT analysis_logs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_project_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;


-- ── PART D: Add missing RLS policies ──

DO $$
BEGIN
  -- Reports policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_reports' AND tablename = 'reports') THEN
    CREATE POLICY "anon_update_reports" ON reports FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_reports' AND tablename = 'reports') THEN
    CREATE POLICY "auth_update_reports" ON reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_reports' AND tablename = 'reports') THEN
    CREATE POLICY "anon_delete_reports" ON reports FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_reports' AND tablename = 'reports') THEN
    CREATE POLICY "auth_delete_reports" ON reports FOR DELETE TO authenticated USING (true);
  END IF;

  -- Delete policies for other tables
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_projects' AND tablename = 'projects') THEN
    CREATE POLICY "anon_delete_projects" ON projects FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_projects' AND tablename = 'projects') THEN
    CREATE POLICY "auth_delete_projects" ON projects FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_posts' AND tablename = 'posts') THEN
    CREATE POLICY "anon_delete_posts" ON posts FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_posts' AND tablename = 'posts') THEN
    CREATE POLICY "auth_delete_posts" ON posts FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_comments' AND tablename = 'comments') THEN
    CREATE POLICY "anon_delete_comments" ON comments FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_comments' AND tablename = 'comments') THEN
    CREATE POLICY "auth_delete_comments" ON comments FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_analysis_logs' AND tablename = 'analysis_logs') THEN
    CREATE POLICY "anon_delete_analysis_logs" ON analysis_logs FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_analysis_logs' AND tablename = 'analysis_logs') THEN
    CREATE POLICY "auth_delete_analysis_logs" ON analysis_logs FOR DELETE TO authenticated USING (true);
  END IF;
END $$;


-- ── PART E: Reset stuck analysis state ──

-- Reset the stuck analysis log
UPDATE analysis_logs SET status = 'failed', error_message = 'Reset by migration 008 - was stuck at processing'
WHERE status = 'processing' AND completed_at IS NULL;

-- Reset any comments stuck in processing (if analysis_status column was partially created before)
UPDATE comments SET analysis_status = 'pending' WHERE analysis_status = 'processing';
