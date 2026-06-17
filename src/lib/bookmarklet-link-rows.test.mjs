import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookmarkletCommentInsertRows } from './bookmarklet-link-rows.ts';

test('builds comment insert rows for bookmarklet linking without writing collected_by', () => {
  const rows = buildBookmarkletCommentInsertRows({
    raw: [{ text: '测试评论', likes: 12, rpid: 'r1', collected_by: 'bookmarklet' }],
    postId: 'post-1',
    projectId: 'project-1',
    existingRpid: new Set(),
    sampleRandom: 0.1,
  });

  assert.deepEqual(rows, [{
    post_id: 'post-1',
    project_id: 'project-1',
    text: '测试评论',
    likes: 12,
    sampling_tier: 'mid',
    is_sampled: true,
    rpid: 'r1',
  }]);
  assert.equal('collected_by' in rows[0], false);
});
