import { create } from "zustand";

interface CodeGraphState {
  focusFunctionId: string | null;
  depth: number;
  searchQuery: string;
  navigationHistory: string[];
  groupByFile: boolean;
  selectedProjectCwd: string | null;

  setFocusFunctionId: (id: string | null) => void;
  setDepth: (depth: number) => void;
  setSearchQuery: (query: string) => void;
  pushNavigation: (functionId: string) => void;
  popNavigation: () => string | null;
  setGroupByFile: (value: boolean) => void;
  setSelectedProjectCwd: (cwd: string | null) => void;
}

export const useCodeGraphStore = create<CodeGraphState>()((set, get) => ({
  focusFunctionId: null,
  depth: 2,
  searchQuery: "",
  navigationHistory: [],
  groupByFile: true,
  selectedProjectCwd: null,

  setFocusFunctionId: (id) => set({ focusFunctionId: id }),

  setDepth: (depth) => set({ depth: Math.max(0, Math.min(5, depth)) }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  pushNavigation: (functionId) =>
    set((state) => {
      const current = state.focusFunctionId;
      if (current === functionId) return state;
      return {
        navigationHistory: current
          ? [...state.navigationHistory, current]
          : state.navigationHistory,
        focusFunctionId: functionId,
      };
    }),

  popNavigation: () => {
    const state = get();
    if (state.navigationHistory.length === 0) return null;
    const previous = state.navigationHistory[state.navigationHistory.length - 1]!;
    set({
      navigationHistory: state.navigationHistory.slice(0, -1),
      focusFunctionId: previous,
    });
    return previous;
  },

  setGroupByFile: (value) => set({ groupByFile: value }),

  setSelectedProjectCwd: (cwd) =>
    set({
      selectedProjectCwd: cwd,
      focusFunctionId: null,
      navigationHistory: [],
      searchQuery: "",
    }),
}));
