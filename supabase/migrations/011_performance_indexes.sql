-- Migration 011: Performance indexes for common query patterns

-- Comments: analysis_status lookups (used by analysis/route.ts batch queries)
CREATE INDEX IF NOT EXISTS idx_comments_analysis_status
  ON comments(project_id, analysis_status)
  WHERE analysis_status = 'pending';

-- Comments: post_id + analysis_status composite (used by analysis start mode)
CREATE INDEX IF NOT EXISTS idx_comments_post_analysis
  ON comments(post_id, analysis_status);

-- Comments: project_id + likes DESC (used by analysis ordering)
CREATE INDEX IF NOT EXISTS idx_comments_project_likes
  ON comments(project_id, likes DESC);

-- Posts: project_id + collected_at (used by fetchPosts ordering)
CREATE INDEX IF NOT EXISTS idx_posts_project_collected
  ON posts(project_id, collected_at DESC);

-- Raw comments: source_id + status (used by linkRawComments)
CREATE INDEX IF NOT EXISTS idx_raw_comments_source_status
  ON raw_comments(source_id, status)
  WHERE status = 'pending';

-- Search results: search_task_id (used by fetchSearchResults)
CREATE INDEX IF NOT EXISTS idx_search_results_task
  ON search_results(search_task_id);

-- Analysis logs: project_id + created_at (used by fetchAnalysisLogs)
CREATE INDEX IF NOT EXISTS idx_analysis_logs_project_created
  ON analysis_logs(project_id, created_at DESC);
