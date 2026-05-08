/**
 * Zustand Store for Application State
 * Manages currentVideo, downloadQueue, settings, isLoading, and error state
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import { create } from 'zustand';

// Import types from electron preload
interface Video {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly duration: number;
  readonly thumbnailUrl: string;
  readonly availableFormats: Format[];
}

interface Format {
  readonly type: 'mp4' | 'mp3';
  readonly qualities: Quality[];
}

interface Quality {
  readonly label: string;
  readonly value: string;
  readonly bitrate?: number;
  readonly resolution?: string;
}

interface DownloadTask {
  readonly id: string;
  readonly url: string;
  readonly videoTitle: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  readonly filePath: string;
  readonly selectedFormat: 'mp4' | 'mp3';
  readonly selectedQuality: string;
  retryCount: number;
  errorMessage?: string;
  readonly createdAt: Date;
  updatedAt: Date;
  processId?: number;
}

interface Settings {
  theme: 'light' | 'dark';
  downloadDirectory: string;
  concurrentLimit: number;
}

interface ErrorInfo {
  type: string;
  message: string;
}

interface AppState {
  // State
  currentVideo: Video | null;
  downloadQueue: DownloadTask[];
  settings: Settings;
  isLoading: boolean;
  error: ErrorInfo | null;

  // Video actions
  setCurrentVideo: (video: Video | null) => void;

  // Download queue actions
  setDownloadQueue: (tasks: DownloadTask[]) => void;
  updateTask: (taskId: string, updates: Partial<DownloadTask>) => void;
  removeTask: (taskId: string) => void;
  addTask: (task: DownloadTask) => void;

  // Settings actions
  setSettings: (settings: Settings) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;

  // UI state actions
  setLoading: (loading: boolean) => void;
  setError: (error: ErrorInfo | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentVideo: null,
  downloadQueue: [],
  settings: {
    theme: 'light',
    downloadDirectory: '',
    concurrentLimit: 3,
  },
  isLoading: false,
  error: null,

  // Video actions
  setCurrentVideo: (video) => set({ currentVideo: video }),

  // Download queue actions
  setDownloadQueue: (tasks) => set({ downloadQueue: tasks }),
  
  updateTask: (taskId, updates) =>
    set((state) => ({
      downloadQueue: state.downloadQueue.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      ),
    })),
  
  removeTask: (taskId) =>
    set((state) => ({
      downloadQueue: state.downloadQueue.filter((task) => task.id !== taskId),
    })),
  
  addTask: (task) =>
    set((state) => ({
      downloadQueue: [...state.downloadQueue, task],
    })),

  // Settings actions
  setSettings: (settings) => set({ settings }),
  
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),

  // UI state actions
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));
