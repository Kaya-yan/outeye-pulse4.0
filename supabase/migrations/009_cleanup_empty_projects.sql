-- ============================================================
-- Cleanup script: Remove empty/duplicate projects
-- Run AFTER migration 008 in Supabase Dashboard SQL Editor
-- ============================================================

-- Show current projects and their comment counts
SELECT p.id, p.name, p.keyword, count(c.id) as comment_count
FROM projects p
LEFT JOIN comments c ON c.project_id = p.id
GROUP BY p.id, p.name, p.keyword
ORDER BY comment_count DESC;

-- Delete empty projects (0 comments) that are duplicates
-- Keep: 7d778180 (305 comments, main 郭永怀 project)
-- Keep: 7e24b78a (51 comments, test project)
-- Delete: all others with 0 comments
DELETE FROM projects WHERE id IN (
  SELECT p.id FROM projects p
  LEFT JOIN comments c ON c.project_id = p.id
  GROUP BY p.id
  HAVING count(c.id) = 0
);

-- Verify after cleanup
SELECT p.id, p.name, p.keyword, count(c.id) as comment_count
FROM projects p
LEFT JOIN comments c ON c.project_id = p.id
GROUP BY p.id, p.name, p.keyword
ORDER BY comment_count DESC;
