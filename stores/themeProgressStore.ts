import { create } from "zustand";
import { Theme } from "./themeInfoStore";
import { getSocket } from "@/utils/socketClient";

export interface ChatEntry {
  id?: string;
  generation?: string;
  type: "server" | "client";
  data: string;
  createdAt: string;
}

export interface ThemeProgress {
  themeCode: string;
  endTime: number;
  progressIndex: number;
  hintCount: number;
  isRunning: number;
  chatData: ChatEntry[];
  newChat: boolean;
  generation: string;
  revision: number;
  startedAt: number | null;
  usedHintCodes: string[];
}

interface ThemeProgressState {
  themeProgress: ThemeProgress[];
  setThemeProgress: (progressList: ThemeProgress[]) => void;
  initProgressFromThemes: (themes: Theme[]) => void;
  startTimer: (themeCode: string, durationMs: number) => void;
  stopTimer: (themeCode: string) => void;
  resetTimer: (themeCode: string) => void;
  getProgress: () => ThemeProgress[];
  updateProgress: (
    themeCode: string,
    fields: Partial<Omit<ThemeProgress, "themeCode">>,
    isControl: boolean,
    command: string,
    progress?: number,
    remainingTime?: number
  ) => void;
  setNewChat: (themeCode: string, value: boolean) => void;
  loadProgressFromServer: () => Promise<void>;
  applySnapshot: (snapshot: any) => void;
}

export const useThemeProgressStore = create<ThemeProgressState>((set, get) => ({
  themeProgress: [],

  setThemeProgress: (progressList) => set({ themeProgress: progressList }),

  initProgressFromThemes: (themes) => {
    const defaultProgress: ThemeProgress[] = themes.map((theme) => ({
      themeCode: theme.themeCode,
      endTime: 0,
      progressIndex: 0,
      hintCount: 0,
      isRunning: 0,
      chatData: [],
      newChat: false,
      generation: "legacy",
      revision: 0,
      startedAt: null,
      usedHintCodes: [],
    }));
    set({ themeProgress: defaultProgress });
  },

  startTimer: (themeCode, durationMs) => {
    const now = Date.now();
    let calculTime = 0;
    const updated = get().themeProgress.map((item) => {
      if (item.themeCode !== themeCode) return item;
      const newEndTime =
        item.isRunning === 2 ? now + item.endTime : now + durationMs;
      calculTime = newEndTime;
      return {
        ...item,
        endTime: newEndTime,
        isRunning: 1,
      };
    });
    set({ themeProgress: updated });
    saveProgressToServer(updated);
    return calculTime - now;
  },

  stopTimer: (themeCode) => {
    const now = Date.now();
    const updated = get().themeProgress.map((item) =>
      item.themeCode === themeCode && item.isRunning === 1
        ? {
            ...item,
            endTime: item.endTime - now,
            isRunning: 2,
          }
        : item
    );
    set({ themeProgress: updated });
    saveProgressToServer(updated);
  },

  resetTimer: (themeCode) => {
    const updated = get().themeProgress.map((item) =>
      item.themeCode === themeCode
        ? {
            ...item,
            endTime: 0,
            isRunning: 0,
            hintCount: 0,
            progressIndex: 0,
            chatData: [],
            newChat: false,
          }
        : item
    );
    set({ themeProgress: updated });
    saveProgressToServer(updated);
  },

  updateProgress: (
    themeCode,
    fields,
    isControl,
    command,
    progress,
    remainingTime
  ) => {
    const updated = get().themeProgress.map((item) =>
      item.themeCode === themeCode ? { ...item, ...fields } : item
    );
    set({ themeProgress: updated });
    saveProgressToServer(updated);
    let progressObject = { progress: progress };
    let remainingTimeObject = { remainingTime: remainingTime };

    if (isControl) {
      try {
        const socket = getSocket();
        socket.emit("toApp", {
          themeCode,
          command: command,
          data: { ...fields, ...progressObject, ...remainingTimeObject },
        });
      } catch (e) {
        console.warn("Socket 통신 실패", e);
      }
    }
  },

  setNewChat: (themeCode, value) => {
    const updated = get().themeProgress.map((item) =>
      item.themeCode === themeCode ? { ...item, newChat: value } : item
    );
    set({ themeProgress: updated });
    saveProgressToServer(updated);
  },

  loadProgressFromServer: async () => {
    try {
      const res = await fetch("/api/progress");
      if (!res.ok) throw new Error("서버 응답 오류");
      const data = await res.json();

      const fixedData = data.map((item: any) => ({
        ...item,
        chatData: item.chatData || [],
        newChat: item.newChat ?? false,
        generation: item.generation ?? "legacy",
        revision: item.revision ?? 0,
        startedAt: item.startedAt ?? null,
        usedHintCodes: item.usedHintCodes ?? [],
      }));

      set({ themeProgress: fixedData });
    } catch (err) {
      console.error("진행 정보 불러오기 실패", err);
    }
  },

  getProgress: () => {
    return get().themeProgress;
  },

  applySnapshot: (snapshot) => {
    if (!snapshot?.themeCode) return;
    const current = get().themeProgress;
    const existing = current.find((item) => item.themeCode === snapshot.themeCode);
    const next: ThemeProgress = {
      themeCode: snapshot.themeCode,
      generation: snapshot.generation,
      revision: Number(snapshot.revision || 0),
      startedAt: snapshot.startedAt || null,
      endTime: Number(snapshot.endTime || 0),
      progressIndex: Number(snapshot.progressIndex || 0),
      hintCount: Number(snapshot.hintCount || 0),
      usedHintCodes: Array.isArray(snapshot.usedHintCodes) ? snapshot.usedHintCodes : [],
      isRunning: Number(snapshot.isRunning || 0),
      chatData: Array.isArray(snapshot.chatData) ? snapshot.chatData : [],
      newChat: existing?.newChat ?? false,
    };
    const updated = existing
      ? current.map((item) => (item.themeCode === next.themeCode ? next : item))
      : [...current, next];
    set({ themeProgress: updated });
    void saveProgressToServer(updated);
  },
}));

async function saveProgressToServer(progress: ThemeProgress[]) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
  } catch (err) {
    console.error("진행 정보 저장 실패", err);
  }
}
