-- Migration 004: Create local_logs table for collection history
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS local_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  keyword TEXT NOT NULL,
  source_tool TEXT DEFAULT 'media_crawler',
  config_json JSONB,
  raw_count INT DEFAULT 0,
  clean_count INT DEFAULT 0,
  import_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  data_file_path TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  operator TEXT DEFAULT 'local',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_local_logs_platform ON local_logs(platform);
CREATE INDEX IF NOT EXISTS idx_local_logs_status ON local_logs(status);
CREATE INDEX IF NOT EXISTS idx_local_logs_created ON local_logs(created_at DESC);

ALTER TABLE local_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_local_logs" ON local_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_local_logs" ON local_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
