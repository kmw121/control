import { create } from "zustand";

export interface Theme {
  themeCode: string;
  themeTitle: string;
  durationMinutes: number;
  durationSeconds: number;
  progress: number[];
  lightOffTime: number;
}

interface ThemeInfoState {
  themes: Theme[];
  getThemes: () => Theme[];
  setThemes: (themes: Theme[]) => void;
  addTheme: (theme: Theme) => void;
  updateTheme: (themeCode: string, updatedFields: Partial<Theme>) => void;
  removeTheme: (themeCode: string) => void;

  loadThemes: () => Promise<void>;
  saveThemes: () => Promise<void>;

  updateDuration: (themeCode: string, minutes: number, seconds: number) => void;
}

export const useThemeInfoStore = create<ThemeInfoState>((set, get) => ({
  themes: [],

  setThemes: (themes) => set({ themes }),

  addTheme: (theme) =>
    set((state) => ({
      themes: [...state.themes, theme],
    })),

  updateTheme: (themeCode, updatedFields) =>
    set((state) => ({
      themes: state.themes.map((theme) =>
        theme.themeCode === themeCode ? { ...theme, ...updatedFields } : theme
      ),
    })),

  removeTheme: (themeCode) =>
    set((state) => ({
      themes: state.themes.filter((theme) => theme.themeCode !== themeCode),
    })),

  loadThemes: async () => {
    try {
      const res = await fetch("/api/theme");
      const data = await res.json();
      set({ themes: data });
    } catch (err) {
      console.error("테마 불러오기 실패:", err);
    }
  },

  saveThemes: async () => {
    try {
      const { themes } = get();
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(themes),
      });
    } catch (err) {
      console.error("테마 저장 실패:", err);
    }
  },

  updateDuration: (themeCode, minutes, seconds) =>
    set((state) => ({
      themes: state.themes.map((theme) =>
        theme.themeCode === themeCode
          ? {
              ...theme,
              durationMinutes: minutes,
              durationSeconds: seconds,
            }
          : theme
      ),
    })),
  getThemes: () => {
    return get().themes;
  },
}));
