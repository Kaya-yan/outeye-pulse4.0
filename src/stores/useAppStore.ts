import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, FilterState, Post, Comment, AnalysisLog } from '@/types';

interface AppState {
  // Current project
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Projects list
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;

  // Posts
  posts: Post[];
  setPosts: (posts: Post[]) => void;

  // Comments
  comments: Comment[];
  setComments: (comments: Comment[]) => void;

  // Analysis
  analysisLog: AnalysisLog | null;
  setAnalysisLog: (log: AnalysisLog | null) => void;

  // Analysis progress (global, persists across pages)
  activeAnalysisLogId: string | null;
  setActiveAnalysisLogId: (id: string | null) => void;
  analysisProgress: { processed: number; total: number; status: string } | null;
  setAnalysisProgress: (p: { processed: number; total: number; status: string } | null) => void;

  // Filters
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;

  // UI State
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  presentationMode: boolean;
  togglePresentationMode: () => void;
  introSeen: boolean;
  setIntroSeen: (seen: boolean) => void;
  terminologyMode: 'academic' | 'plain';
  setTerminologyMode: (mode: 'academic' | 'plain') => void;

  // Selected items
  selectedPostId: string | null;
  setSelectedPostId: (id: string | null) => void;
  selectedCommentId: string | null;
  setSelectedCommentId: (id: string | null) => void;
}

const defaultFilters: FilterState = {
  platform: 'all',
  timeRange: '30d',
  contentType: 'all',
  narrativeTypes: [],
  sentiment: 'all',
  riskLevel: 'all',
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Current project
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),

      // Projects
      projects: [],
      setProjects: (projects) => set({ projects }),
      addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),

      // Posts
      posts: [],
      setPosts: (posts) => set({ posts }),

      // Comments
      comments: [],
      setComments: (comments) => set({ comments }),

      // Analysis
      analysisLog: null,
      setAnalysisLog: (log) => set({ analysisLog: log }),

      // Analysis progress
      activeAnalysisLogId: null,
      setActiveAnalysisLogId: (id) => set({ activeAnalysisLogId: id }),
      analysisProgress: null,
      setAnalysisProgress: (p) => set({ analysisProgress: p }),

      // Filters
      filters: defaultFilters,
      setFilters: (filters) =>
        set((state) => ({ filters: { ...state.filters, ...filters } })),
      resetFilters: () => set({ filters: defaultFilters }),

      // UI State
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      presentationMode: false,
      togglePresentationMode: () => set((state) => ({ presentationMode: !state.presentationMode })),
      introSeen: false,
      setIntroSeen: (seen) => set({ introSeen: seen }),
      terminologyMode: 'academic' as const,
      setTerminologyMode: (mode) => set({ terminologyMode: mode }),

      // Selected items
      selectedPostId: null,
      setSelectedPostId: (id) => set({ selectedPostId: id }),
      selectedCommentId: null,
      setSelectedCommentId: (id) => set({ selectedCommentId: id }),
    }),
    {
      name: 'outeye-app-store',
      partialize: (state) => ({
        presentationMode: state.presentationMode,
        sidebarCollapsed: state.sidebarCollapsed,
        terminologyMode: state.terminologyMode,
      }),
      migrate: (persisted: unknown) => {
        // Clean up old introSeen from localStorage
        const state = persisted as Record<string, unknown>;
        delete state.introSeen;
        return persisted;
      },
      version: 2,
    }
  )
);
