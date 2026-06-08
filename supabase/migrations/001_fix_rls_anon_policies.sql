-- Migration 001: Fix RLS policies for anon role
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This adds explicit anon role policies so the anon key (sb_publishable_*) can read/write data

-- Drop existing public policies (they don't work with new short key format)
DROP POLICY IF EXISTS "Public read access" ON projects;
DROP POLICY IF EXISTS "Public read access" ON posts;
DROP POLICY IF EXISTS "Public read access" ON comments;
DROP POLICY IF EXISTS "Public read access" ON analysis_logs;
DROP POLICY IF EXISTS "Public read access" ON reports;

DROP POLICY IF EXISTS "Insert access" ON projects;
DROP POLICY IF EXISTS "Insert access" ON posts;
DROP POLICY IF EXISTS "Insert access" ON comments;
DROP POLICY IF EXISTS "Insert access" ON analysis_logs;
DROP POLICY IF EXISTS "Insert access" ON reports;

DROP POLICY IF EXISTS "Update access" ON projects;
DROP POLICY IF EXISTS "Update access" ON posts;
DROP POLICY IF EXISTS "Update access" ON comments;
DROP POLICY IF EXISTS "Update access" ON analysis_logs;
DROP POLICY IF EXISTS "Update access" ON reports;

-- ============================================
-- Anon SELECT policies (read access)
-- ============================================
CREATE POLICY "anon_select_projects" ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_posts" ON posts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_comments" ON comments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_analysis_logs" ON analysis_logs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_reports" ON reports FOR SELECT TO anon USING (true);

-- Also grant to authenticated role
CREATE POLICY "auth_select_projects" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_posts" ON posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_comments" ON comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_analysis_logs" ON analysis_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_reports" ON reports FOR SELECT TO authenticated USING (true);

-- ============================================
-- Anon INSERT policies (write access)
-- ============================================
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_posts" ON posts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_comments" ON comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_analysis_logs" ON analysis_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_reports" ON reports FOR INSERT TO anon WITH CHECK (true);

-- Also grant to authenticated role
CREATE POLICY "auth_insert_projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_posts" ON posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_comments" ON comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_analysis_logs" ON analysis_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_reports" ON reports FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- Anon UPDATE policies (for analysis results, human corrections)
-- ============================================
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_posts" ON posts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_comments" ON comments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_analysis_logs" ON analysis_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Also grant to authenticated role
CREATE POLICY "auth_update_projects" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_posts" ON posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_comments" ON comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_analysis_logs" ON analysis_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Service role bypasses RLS automatically, no policy needed
-- ============================================

-- Verify: After running this, check policies with:
-- SELECT * FROM pg_policies WHERE tablename IN ('projects', 'posts', 'comments');
