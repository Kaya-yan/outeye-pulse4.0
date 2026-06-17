-- Migration 013: Create collection_runs / collection_run_events and attach run identity to existing collection tables
-- Phase 2 of collection-ops-unification: additive only, soft-compatible with existing flows

-- -----------------------------------------------------------------------------
-- Part A: New operational tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('xhs', 'bilibili')),
  source TEXT NOT NULL CHECK (source IN ('bookmarklet', 'playwright', 'vps', 'agent', 'search')),
  mode TEXT NOT NULL CHECK (mode IN ('direct_url', 'keyword_search', 'raw_intake', 'deep_scrape')),
  initiator TEXT NOT NULL DEFAULT 'ui' CHECK (initiator IN ('ui', 'cli', 'system')),
  target_type TEXT NOT NULL CHECK (target_type IN ('url', 'keyword', 'source_id', 'task', 'mixed')),
  target_value TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'running', 'awaiting_input', 'importing', 'completed', 'partial_success', 'failed', 'cancelled')),
  current_stage TEXT NOT NULL DEFAULT 'init' CHECK (current_stage IN ('init', 'queue', 'claim', 'crawl', 'receive', 'import', 'finalize')),
  failure_code TEXT,
  latest_error TEXT,
  latest_hint TEXT,
  received_count INT NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  imported_count INT NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  duplicate_count INT NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  filtered_count INT NOT NULL DEFAULT 0 CHECK (filtered_count >= 0),
  failed_count INT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  heartbeat_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id UUID NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('init', 'queue', 'claim', 'crawl', 'receive', 'import', 'finalize')),
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hint TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Part B: Indexes for collection_runs / collection_run_events
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_collection_runs_project_created
  ON collection_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_runs_platform_created
  ON collection_runs(platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_runs_active_created
  ON collection_runs(status, created_at DESC)
  WHERE status IN ('queued', 'running', 'awaiting_input', 'importing');

CREATE INDEX IF NOT EXISTS idx_collection_runs_active_heartbeat
  ON collection_runs(heartbeat_at)
  WHERE status IN ('queued', 'running', 'awaiting_input', 'importing');

CREATE INDEX IF NOT EXISTS idx_collection_run_events_run_created
  ON collection_run_events(collection_run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_collection_run_events_code_created
  ON collection_run_events(code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_run_events_stage_created
  ON collection_run_events(stage, created_at DESC);

-- -----------------------------------------------------------------------------
-- Part C: RLS and compatibility policies
-- -----------------------------------------------------------------------------

ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_run_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "anon_select_collection_runs" ON collection_runs FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "auth_select_collection_runs" ON collection_runs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "anon_insert_collection_runs" ON collection_runs FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "auth_insert_collection_runs" ON collection_runs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "anon_update_collection_runs" ON collection_runs FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "auth_update_collection_runs" ON collection_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "anon_delete_collection_runs" ON collection_runs FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_collection_runs' AND tablename = 'collection_runs') THEN
    CREATE POLICY "auth_delete_collection_runs" ON collection_runs FOR DELETE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "anon_select_collection_run_events" ON collection_run_events FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "auth_select_collection_run_events" ON collection_run_events FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "anon_insert_collection_run_events" ON collection_run_events FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "auth_insert_collection_run_events" ON collection_run_events FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "anon_update_collection_run_events" ON collection_run_events FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "auth_update_collection_run_events" ON collection_run_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "anon_delete_collection_run_events" ON collection_run_events FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_collection_run_events' AND tablename = 'collection_run_events') THEN
    CREATE POLICY "auth_delete_collection_run_events" ON collection_run_events FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Part D: Attach run identity to existing tables (only if they exist)
-- -----------------------------------------------------------------------------

ALTER TABLE IF EXISTS raw_comments ADD COLUMN IF NOT EXISTS collection_run_id UUID;
ALTER TABLE IF EXISTS task_queue ADD COLUMN IF NOT EXISTS collection_run_id UUID;
ALTER TABLE IF EXISTS agent_data ADD COLUMN IF NOT EXISTS collection_run_id UUID;
ALTER TABLE IF EXISTS search_tasks ADD COLUMN IF NOT EXISTS collection_run_id UUID;

DO $$
BEGIN
  IF to_regclass('public.raw_comments') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_comments_collection_run_id_fkey'
  ) THEN
    ALTER TABLE raw_comments
      ADD CONSTRAINT raw_comments_collection_run_id_fkey
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.task_queue') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_queue_collection_run_id_fkey'
  ) THEN
    ALTER TABLE task_queue
      ADD CONSTRAINT task_queue_collection_run_id_fkey
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.agent_data') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_data_collection_run_id_fkey'
  ) THEN
    ALTER TABLE agent_data
      ADD CONSTRAINT agent_data_collection_run_id_fkey
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.search_tasks') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_tasks_collection_run_id_fkey'
  ) THEN
    ALTER TABLE search_tasks
      ADD CONSTRAINT search_tasks_collection_run_id_fkey
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.raw_comments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_comments_collection_run_id ON raw_comments(collection_run_id)';
  END IF;

  IF to_regclass('public.task_queue') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_queue_collection_run_id ON task_queue(collection_run_id)';
  END IF;

  IF to_regclass('public.agent_data') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_data_collection_run_id ON agent_data(collection_run_id)';
  END IF;

  IF to_regclass('public.search_tasks') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_search_tasks_collection_run_id ON search_tasks(collection_run_id)';
  END IF;
END $$;
