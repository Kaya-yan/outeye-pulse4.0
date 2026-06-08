import { create } from 'zustand';

interface ChartState {
  // Hovered/selected data point across all charts
  hoveredCommentId: string | null;
  selectedNarrativeType: string | null;
  selectedRiskLevel: string | null;
  selectedPlatform: string | null;

  // Actions
  setHoveredCommentId: (id: string | null) => void;
  setSelectedNarrativeType: (type: string | null) => void;
  setSelectedRiskLevel: (level: string | null) => void;
  setSelectedPlatform: (platform: string | null) => void;
  clearSelections: () => void;
}

export const useChartStore = create<ChartState>((set) => ({
  hoveredCommentId: null,
  selectedNarrativeType: null,
  selectedRiskLevel: null,
  selectedPlatform: null,

  setHoveredCommentId: (id) => set({ hoveredCommentId: id }),
  setSelectedNarrativeType: (type) => set({ selectedNarrativeType: type }),
  setSelectedRiskLevel: (level) => set({ selectedRiskLevel: level }),
  setSelectedPlatform: (platform) => set({ selectedPlatform: platform }),
  clearSelections: () => set({
    hoveredCommentId: null,
    selectedNarrativeType: null,
    selectedRiskLevel: null,
    selectedPlatform: null,
  }),
}));
