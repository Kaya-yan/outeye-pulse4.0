-- Migration 007: Add missing columns, indexes, CASCADE, and RLS policies

-- 1. Add analysis_status column to comments (used by analysis/route.ts)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending'
  CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'));

-- 2. Add rpid column to comments (used by bookmarklet dedup in supabase-service.ts)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS rpid TEXT;

-- 3. Add source_tool and content_hash columns if missing (used by collection routes)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_tool TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source_url TEXT;

-- 4. Add index on posts.url for fast lookup during collection
CREATE INDEX IF NOT EXISTS idx_posts_url ON posts(url);

-- 5. Add index on comments.content_hash for dedup
CREATE INDEX IF NOT EXISTS idx_comments_content_hash ON comments(content_hash);

-- 6. Add composite index on search_tasks for common queries
CREATE INDEX IF NOT EXISTS idx_search_tasks_project_status ON search_tasks(project_id, status);

-- 7. Fix analysis_logs FK to CASCADE on project delete
ALTER TABLE analysis_logs DROP CONSTRAINT IF EXISTS analysis_logs_project_id_fkey;
ALTER TABLE analysis_logs ADD CONSTRAINT analysis_logs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 8. Fix reports FK to CASCADE on project delete
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_project_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 9. Add missing RLS policies for reports (UPDATE + DELETE)
CREATE POLICY "anon_update_reports" ON reports FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_reports" ON reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_reports" ON reports FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_reports" ON reports FOR DELETE TO authenticated USING (true);

-- 10. Add missing DELETE policies for other tables
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_projects" ON projects FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_delete_posts" ON posts FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_posts" ON posts FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_delete_comments" ON comments FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_comments" ON comments FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_delete_analysis_logs" ON analysis_logs FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_analysis_logs" ON analysis_logs FOR DELETE TO authenticated USING (true);
