-- OutEye 4.0 · Pulse 记忆工坊
-- Supabase PostgreSQL Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  keyword TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sampling_config JSONB DEFAULT '{
    "high_likes_threshold": 100,
    "high_likes_retention": 1.0,
    "mid_likes_retention": 0.5,
    "low_likes_retention": 0.3,
    "batch_size": 10
  }',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  title TEXT,
  content TEXT,
  author_id_hash TEXT,
  author_name_mask TEXT,
  likes INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  shares INT DEFAULT 0,
  is_aigc BOOLEAN DEFAULT FALSE,
  aigc_type TEXT CHECK (aigc_type IN ('ai_image', 'ai_video', 'ai_text', 'human_image', 'human_video', 'human_text', 'uncertain')),
  narrative_type TEXT CHECK (narrative_type IN ('T1', 'T2', 'T3', 'T4', 'T5', 'T6')),
  url TEXT NOT NULL,
  publish_time TIMESTAMP WITH TIME ZONE,
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  collected_by TEXT,
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Comments table (core data table)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  likes INT DEFAULT 0,
  sampling_tier TEXT NOT NULL CHECK (sampling_tier IN ('high', 'mid', 'low')),
  is_sampled BOOLEAN DEFAULT TRUE,
  analysis JSONB DEFAULT NULL,
  is_empty BOOLEAN DEFAULT FALSE,
  is_offensive BOOLEAN DEFAULT FALSE,
  is_ad BOOLEAN DEFAULT FALSE,
  is_irrelevant BOOLEAN DEFAULT FALSE,
  human_corrected JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis logs table
CREATE TABLE analysis_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress_percent INT DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  total_comments INT DEFAULT 0,
  processed_comments INT DEFAULT 0,
  failed_comments INT DEFAULT 0,
  token_consumed INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  report_type TEXT CHECK (report_type IN ('weekly', 'monthly', 'event', 'thesis_package')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_posts_project_id ON posts(project_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_project_id ON comments(project_id);
CREATE INDEX idx_comments_sampling ON comments(project_id, sampling_tier, is_sampled);
CREATE INDEX idx_comments_analysis ON comments(project_id) WHERE analysis IS NULL;
CREATE INDEX idx_analysis_logs_project ON analysis_logs(project_id);

-- Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- SELECT policies (anon + authenticated)
CREATE POLICY "anon_select_projects" ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_posts" ON posts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_comments" ON comments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_analysis_logs" ON analysis_logs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_reports" ON reports FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_projects" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_posts" ON posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_comments" ON comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_analysis_logs" ON analysis_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select_reports" ON reports FOR SELECT TO authenticated USING (true);

-- INSERT policies (anon + authenticated)
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_posts" ON posts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_comments" ON comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_analysis_logs" ON analysis_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_reports" ON reports FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_insert_projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_posts" ON posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_comments" ON comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_analysis_logs" ON analysis_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_reports" ON reports FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE policies (anon + authenticated)
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_posts" ON posts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_comments" ON comments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_analysis_logs" ON analysis_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_projects" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_posts" ON posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_comments" ON comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_analysis_logs" ON analysis_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
