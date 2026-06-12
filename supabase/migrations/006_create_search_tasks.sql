-- Search tasks: keyword-based searches across platforms
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

-- Search results: individual posts found by a search
CREATE TABLE IF NOT EXISTS search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_task_id uuid NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_id text,          -- BV号 for bilibili, note_id for xhs
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_tasks_project ON search_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_search_tasks_keyword ON search_tasks(keyword);
CREATE INDEX IF NOT EXISTS idx_search_results_task ON search_results(search_task_id);
CREATE INDEX IF NOT EXISTS idx_search_results_platform_id ON search_results(platform_id);

-- RLS
ALTER TABLE search_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on search_tasks" ON search_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on search_results" ON search_results FOR ALL USING (true) WITH CHECK (true);
