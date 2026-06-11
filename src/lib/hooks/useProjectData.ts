'use client';

import { useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useAppStore } from '@/stores/useAppStore';
import { fetchProjects, fetchPosts, fetchComments } from '@/lib/supabase-service';

export function useProjectData() {
  const { setProjects, setCurrentProject, setPosts, setComments } = useAppStore();

  const fetcher = useCallback(async () => {
    const projects = await fetchProjects();
    if (projects.length === 0) return { projects: [], posts: [], comments: [] };

    const project = projects[0];
    const [posts, comments] = await Promise.all([
      fetchPosts(project.id),
      fetchComments(project.id),
    ]);

    return { projects, posts, comments };
  }, []);

  const { data, error, isLoading, mutate } = useSWR('project-data', fetcher, {
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (data) {
      if (data.projects.length > 0) {
        setProjects(data.projects);
        setCurrentProject(data.projects[0]);
      }
      setPosts(data.posts);
      setComments(data.comments);
    }
  }, [data, setProjects, setCurrentProject, setPosts, setComments]);

  return {
    isLoading,
    error,
    refresh: mutate,
  };
}
