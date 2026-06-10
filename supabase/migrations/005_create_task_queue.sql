-- Migration 005: Create task_queue and agent_data for cloud orchestration
-- Layer 2: Cloud orchestrator (Supabase) + Local agent (Python) architecture
-- Run this in Supabase SQL Editor

-- Task queue: cloud dispatches collection tasks to local agents
CREATE TABLE IF NOT EXISTS task_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  target_url TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'comments' CHECK (task_type IN ('comments', 'posts', 'full')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled')),
  priority INT DEFAULT 0,
  max_comments INT DEFAULT 2000,
  config_json JSONB DEFAULT '{}',
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  claimed_by TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent data: local agents post collected data here for cloud import
CREATE TABLE IF NOT EXISTS agent_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES task_queue(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  data_type TEXT NOT NULL DEFAULT 'comments' CHECK (data_type IN ('comments', 'posts', 'mixed')),
  raw_data JSONB,
  count INT DEFAULT 0,
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'importing', 'imported', 'failed')),
  error_message TEXT,
  imported_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  imported_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for task_queue
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status);
CREATE INDEX IF NOT EXISTS idx_task_queue_platform ON task_queue(platform);
CREATE INDEX IF NOT EXISTS idx_task_queue_scheduled ON task_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_task_queue_claimed ON task_queue(claimed_by) WHERE status IN ('claimed', 'running');
CREATE INDEX IF NOT EXISTS idx_task_queue_claim_sort ON task_queue(priority DESC, scheduled_at ASC) WHERE status = 'pending';

-- Indexes for agent_data
CREATE INDEX IF NOT EXISTS idx_agent_data_task ON agent_data(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_data_status ON agent_data(status);
CREATE INDEX IF NOT EXISTS idx_agent_data_platform ON agent_data(platform);
CREATE INDEX IF NOT EXISTS idx_agent_data_created ON agent_data(created_at DESC);

-- RLS: same pattern as existing tables
ALTER TABLE task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_data ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "anon_select_task_queue" ON task_queue FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_task_queue" ON task_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_select_agent_data" ON agent_data FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_agent_data" ON agent_data FOR SELECT TO authenticated USING (true);

-- INSERT
CREATE POLICY "anon_insert_task_queue" ON task_queue FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_insert_task_queue" ON task_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon_insert_agent_data" ON agent_data FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_insert_agent_data" ON agent_data FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE
CREATE POLICY "anon_update_task_queue" ON task_queue FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_task_queue" ON task_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_agent_data" ON agent_data FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_agent_data" ON agent_data FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE (only for cleanup)
CREATE POLICY "anon_delete_task_queue" ON task_queue FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_task_queue" ON task_queue FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_delete_agent_data" ON agent_data FOR DELETE TO anon USING (true);
CREATE POLICY "auth_delete_agent_data" ON agent_data FOR DELETE TO authenticated USING (true);

-- Helper function: claim next pending task (atomic, prevents race conditions)
CREATE OR REPLACE FUNCTION claim_next_task(agent_id TEXT)
RETURNS TABLE(id UUID, platform TEXT, target_url TEXT, task_type TEXT, max_comments INT, priority INT, config_json JSONB) AS $$
BEGIN
  RETURN QUERY
  UPDATE task_queue
  SET status = 'claimed',
      claimed_at = NOW(),
      claimed_by = agent_id
  WHERE task_queue.id = (
    SELECT tq.id FROM task_queue tq
    WHERE tq.status = 'pending'
      AND tq.scheduled_at <= NOW()
      AND tq.retry_count < tq.max_retries
    ORDER BY tq.priority DESC, tq.scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING task_queue.id, task_queue.platform, task_queue.target_url, task_queue.task_type, task_queue.max_comments, task_queue.priority, task_queue.config_json;
END;
$$ LANGUAGE plpgsql;

-- Helper function: complete a task
CREATE OR REPLACE FUNCTION complete_task(task_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE task_queue
  SET status = 'completed',
      completed_at = NOW(),
      claimed_at = NULL,
      claimed_by = NULL
  WHERE id = task_uuid;
END;
$$ LANGUAGE plpgsql;

-- Helper function: fail a task (with retry logic)
CREATE OR REPLACE FUNCTION fail_task(task_uuid UUID, error_msg TEXT)
RETURNS void AS $$
BEGIN
  UPDATE task_queue
  SET status = CASE
        WHEN retry_count + 1 < max_retries THEN 'pending'
        ELSE 'failed'
      END,
      retry_count = retry_count + 1,
      error_message = error_msg,
      claimed_at = NULL,
      claimed_by = NULL,
      started_at = NULL
  WHERE id = task_uuid;
END;
$$ LANGUAGE plpgsql;
