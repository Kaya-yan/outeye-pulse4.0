import { supabase } from './supabase';
import type { Project, Post, Comment, AnalysisLog } from '@/types';

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
  return data || [];
}

export async function fetchProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching project:', error);
    return null;
  }
  return data;
}

export async function createProject(project: Partial<Project>): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return null;
  }
  return data;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating project:', error);
    return false;
  }
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting project:', error);
    return false;
  }
  return true;
}

export async function fetchPosts(projectId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('project_id', projectId)
    .order('collected_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return data || [];
}

export async function createPost(post: Partial<Post>): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .insert(post)
    .select()
    .single();

  if (error) {
    console.error('Error creating post:', error);
    return null;
  }
  return data;
}

export async function deletePost(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting post:', error);
    return false;
  }
  return true;
}

export async function fetchComments(projectId: string, filters?: {
  postId?: string;
  samplingTier?: string;
  isSampled?: boolean;
  hasAnalysis?: boolean;
}): Promise<Comment[]> {
  let query = supabase
    .from('comments')
    .select('*')
    .eq('project_id', projectId);

  if (filters?.postId) {
    query = query.eq('post_id', filters.postId);
  }
  if (filters?.samplingTier) {
    query = query.eq('sampling_tier', filters.samplingTier);
  }
  if (filters?.isSampled !== undefined) {
    query = query.eq('is_sampled', filters.isSampled);
  }
  if (filters?.hasAnalysis === true) {
    query = query.not('analysis', 'is', null);
  } else if (filters?.hasAnalysis === false) {
    query = query.is('analysis', null);
  }

  const { data, error } = await query.order('likes', { ascending: false });

  if (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
  return data || [];
}

export async function createComment(comment: Partial<Comment>): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('comments')
    .insert(comment)
    .select()
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    return null;
  }
  return data;
}

export async function updateComment(id: string, updates: Partial<Comment>): Promise<boolean> {
  const { error } = await supabase
    .from('comments')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating comment:', error);
    return false;
  }
  return true;
}

export async function deleteComment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting comment:', error);
    return false;
  }
  return true;
}

export async function createAnalysisLog(log: Partial<AnalysisLog>): Promise<AnalysisLog | null> {
  const { data, error } = await supabase
    .from('analysis_logs')
    .insert(log)
    .select()
    .single();

  if (error) {
    console.error('Error creating analysis log:', error);
    return null;
  }
  return data;
}

export async function updateAnalysisLog(id: string, updates: Partial<AnalysisLog>): Promise<boolean> {
  const { error } = await supabase
    .from('analysis_logs')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating analysis log:', error);
    return false;
  }
  return true;
}

export async function getUnanalyzedComments(projectId: string, limit = 100): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_sampled', true)
    .is('analysis', null)
    .limit(limit);

  if (error) {
    console.error('Error fetching unanalyzed comments:', error);
    return [];
  }
  return data || [];
}

export async function batchInsertComments(comments: Partial<Comment>[]): Promise<number> {
  if (comments.length === 0) return 0;

  // Validate required fields before insert
  const invalid = comments.find(c => !c.text || !c.post_id || !c.project_id || !c.sampling_tier);
  if (invalid) {
    console.error('batchInsertComments: invalid data found:', {
      text: invalid.text?.slice(0, 50),
      post_id: invalid.post_id,
      project_id: invalid.project_id,
      sampling_tier: invalid.sampling_tier,
    });
  }

  // Insert without .select() to use return=minimal (compatible with new short key format)
  const { error } = await supabase
    .from('comments')
    .insert(comments);

  if (!error) {
    return comments.length;
  }

  // Batch failed — log detailed error and fall back to single inserts
  console.error('batchInsertComments batch error:', {
    code: (error as unknown as Record<string, unknown>).code,
    message: error.message,
    details: (error as unknown as Record<string, unknown>).details,
    hint: (error as unknown as Record<string, unknown>).hint,
  });

  let inserted = 0;
  for (let i = 0; i < comments.length; i++) {
    const { error: singleError } = await supabase
      .from('comments')
      .insert(comments[i]);
    if (singleError) {
      console.error(`batchInsertComments row ${i} failed:`, {
        code: (singleError as unknown as Record<string, unknown>).code,
        message: singleError.message,
        details: (singleError as unknown as Record<string, unknown>).details,
        hint: (singleError as unknown as Record<string, unknown>).hint,
        row: { post_id: comments[i].post_id, text: comments[i].text?.slice(0, 50) },
      });
    } else {
      inserted++;
    }
  }
  console.log(`batchInsertComments fallback: ${inserted}/${comments.length} succeeded`);
  return inserted;
}

export async function batchInsertPosts(posts: Partial<Post>[]): Promise<number> {
  if (posts.length === 0) return 0;

  const { error } = await supabase
    .from('posts')
    .insert(posts);

  if (!error) {
    return posts.length;
  }

  console.error('batchInsertPosts error:', {
    code: (error as unknown as Record<string, unknown>).code,
    message: error.message,
    details: (error as unknown as Record<string, unknown>).details,
    hint: (error as unknown as Record<string, unknown>).hint,
  });

  let inserted = 0;
  for (let i = 0; i < posts.length; i++) {
    const { error: singleError } = await supabase
      .from('posts')
      .insert(posts[i]);
    if (singleError) {
      console.error(`batchInsertPosts row ${i} failed:`, {
        code: (singleError as unknown as Record<string, unknown>).code,
        message: singleError.message,
        row: { title: posts[i].title?.slice(0, 50), url: posts[i].url?.slice(0, 50) },
      });
    } else {
      inserted++;
    }
  }
  return inserted;
}

// ==================== local_logs ====================

export async function fetchLocalLogs(limit = 20): Promise<import('@/types').LocalLog[]> {
  const { data, error } = await supabase
    .from('local_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching local_logs:', error);
    return [];
  }
  return data || [];
}

export async function createLocalLog(log: Partial<import('@/types').LocalLog>): Promise<import('@/types').LocalLog | null> {
  const { data, error } = await supabase
    .from('local_logs')
    .insert(log)
    .select()
    .single();

  if (error) {
    console.error('Error creating local_log:', error);
    return null;
  }
  return data;
}

export async function updateLocalLog(id: string, updates: Partial<import('@/types').LocalLog>): Promise<boolean> {
  const { error } = await supabase
    .from('local_logs')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating local_log:', error);
    return false;
  }
  return true;
}

// ==================== raw_comments (Bookmarklet intake) ====================

export interface RawComment {
  id?: string;
  platform: 'bilibili' | 'xhs';
  source_id: string;
  source_url?: string;
  text: string;
  likes: number;
  username_hash?: string;
  rpid?: string;
  collected_by?: string;
  collected_at?: string;
  status?: 'pending' | 'linked' | 'ignored';
  post_id?: string;
  project_id?: string;
}

export async function fetchPendingRawComments(): Promise<RawComment[]> {
  const { data, error } = await supabase
    .from('raw_comments')
    .select('*')
    .eq('status', 'pending')
    .order('collected_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending raw_comments:', error);
    return [];
  }
  return data || [];
}

export async function linkRawComments(
  sourceId: string,
  postId: string,
  projectId: string
): Promise<number> {
  const { data: raw, error: fetchErr } = await supabase
    .from('raw_comments')
    .select('*')
    .eq('source_id', sourceId)
    .eq('status', 'pending');

  if (fetchErr || !raw || raw.length === 0) return 0;

  // Dedup by rpid
  const { data: existing } = await supabase
    .from('comments')
    .select('rpid')
    .eq('post_id', postId);

  const existingRpid = new Set((existing || []).map(c => c.rpid).filter(Boolean));

  const toInsert = raw
    .filter(r => !r.rpid || !existingRpid.has(r.rpid))
    .map(r => ({
      post_id: postId,
      project_id: projectId,
      text: r.text,
      likes: r.likes || 0,
      sampling_tier: (r.likes || 0) >= 100 ? 'high' as const : (r.likes || 0) >= 10 ? 'mid' as const : 'low' as const,
      is_sampled: (r.likes || 0) >= 100 || Math.random() < 0.5,
      rpid: r.rpid || null,
      collected_by: r.collected_by || 'bookmarklet',
    }));

  if (toInsert.length === 0) {
    await supabase.from('raw_comments').update({ status: 'linked' }).eq('source_id', sourceId).eq('status', 'pending');
    return 0;
  }

  const { error: insertErr } = await supabase.from('comments').insert(toInsert);
  if (insertErr) {
    console.error('Error linking raw_comments:', insertErr);
    return 0;
  }

  await supabase
    .from('raw_comments')
    .update({ status: 'linked', post_id: postId, project_id: projectId })
    .eq('source_id', sourceId)
    .eq('status', 'pending');

  return toInsert.length;
}

export async function ignoreRawComments(sourceId: string): Promise<boolean> {
  const { error } = await supabase
    .from('raw_comments')
    .update({ status: 'ignored' })
    .eq('source_id', sourceId)
    .eq('status', 'pending');
  return !error;
}

export async function insertRawComments(rows: RawComment[]): Promise<number> {
  const { error } = await supabase.from('raw_comments').insert(rows);
  if (error) {
    console.error('Error inserting raw_comments:', error);
    return 0;
  }
  return rows.length;
}
