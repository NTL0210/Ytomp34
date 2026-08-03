/**
 * TypeScript declarations for window.electronAPI
 * Ensures type safety for IPC communication
 */

import type { AppUpdateResponse, AppUpdateStatus } from './app-update';

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

interface FetchVideoInfoResponse {
  success: boolean;
  data?: Video;
  error?: {
    type: 'invalid_url' | 'yt_dlp_missing' | 'network_error' | 'unknown';
    message: string;
  };
}

interface PlaylistEntry {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly duration: number;
  readonly thumbnailUrl: string;
}

interface PlaylistInfo {
  readonly id: string;
  readonly title: string;
  readonly entries: PlaylistEntry[];
  readonly totalEntries: number;
  readonly truncated: boolean;
}

interface FetchPlaylistInfoResponse {
  success: boolean;
  data?: PlaylistInfo;
  error?: {
    type: 'invalid_url' | 'yt_dlp_missing' | 'network_error' | 'unknown';
    message: string;
  };
}

interface StartDownloadResponse {
  success: boolean;
  taskId?: string;
  error?: {
    type: 'invalid_params' | 'queue_full' | 'unknown';
    message: string;
  };
}

interface PauseDownloadResponse {
  success: boolean;
  error?: string;
}

interface ResumeDownloadResponse {
  success: boolean;
  error?: string;
}

interface CancelDownloadResponse {
  success: boolean;
  error?: string;
}

interface TaskActionResponse {
  success: boolean;
  error?: string;
}

interface ClearCompletedResponse extends TaskActionResponse {
  removedCount: number;
}

interface GetSettingsResponse {
  success: boolean;
  data?: Settings;
}

interface UpdateSettingsResponse {
  success: boolean;
  data?: Settings;
  error?: string;
}

interface SelectFolderResponse {
  success: boolean;
  path?: string;
  cancelled: boolean;
}

interface ProgressUpdateEvent {
  taskId: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
}

interface QueueStateEvent {
  tasks: DownloadTask[];
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  fetchVideoInfo: (url: string) => Promise<FetchVideoInfoResponse>;
  fetchPlaylistInfo: (url: string) => Promise<FetchPlaylistInfoResponse>;
  startDownload: (
    url: string,
    videoTitle: string,
    format: 'mp4' | 'mp3',
    quality: string
  ) => Promise<StartDownloadResponse>;
  pauseDownload: (taskId: string) => Promise<PauseDownloadResponse>;
  resumeDownload: (taskId: string) => Promise<ResumeDownloadResponse>;
  cancelDownload: (taskId: string) => Promise<CancelDownloadResponse>;
  retryDownload: (taskId: string) => Promise<TaskActionResponse>;
  openDownloadedFile: (taskId: string) => Promise<TaskActionResponse>;
  showDownloadedFile: (taskId: string) => Promise<TaskActionResponse>;
  removeHistoryItem: (taskId: string) => Promise<TaskActionResponse>;
  clearCompleted: () => Promise<ClearCompletedResponse>;
  getSettings: () => Promise<GetSettingsResponse>;
  updateSettings: (settings: {
    theme?: 'light' | 'dark';
    downloadDirectory?: string;
    concurrentLimit?: number;
  }) => Promise<UpdateSettingsResponse>;
  selectFolder: () => Promise<SelectFolderResponse>;
  getUpdateStatus: () => Promise<AppUpdateResponse>;
  checkForAppUpdate: () => Promise<AppUpdateResponse>;
  downloadAppUpdate: () => Promise<AppUpdateResponse>;
  installAppUpdate: () => Promise<AppUpdateResponse>;
  onProgressUpdate: (callback: (data: ProgressUpdateEvent) => void) => () => void;
  onQueueUpdate: (callback: (data: QueueStateEvent) => void) => () => void;
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
