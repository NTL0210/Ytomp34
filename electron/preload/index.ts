/**
 * Preload Script
 * Exposes safe IPC API to renderer process via contextBridge
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  AppUpdateResponse,
  AppUpdateStatus,
  CancelDownloadRequest,
  CancelDownloadResponse,
  ClearCompletedResponse,
  FetchPlaylistInfoRequest,
  FetchPlaylistInfoResponse,
  FetchVideoInfoRequest,
  FetchVideoInfoResponse,
  GetSettingsResponse,
  PauseDownloadRequest,
  PauseDownloadResponse,
  ProgressUpdateEvent,
  QueueStateEvent,
  ResumeDownloadRequest,
  ResumeDownloadResponse,
  SelectFolderResponse,
  StartDownloadRequest,
  StartDownloadResponse,
  TaskActionRequest,
  TaskActionResponse,
  UpdateSettingsRequest,
  UpdateSettingsResponse
} from '../main/ipc/contracts';

// Inline IPC channel constants to avoid import issues in preload
const IPC_CHANNELS = {
  VIDEO_FETCH_INFO: 'video:fetch-info',
  VIDEO_FETCH_PLAYLIST: 'video:fetch-playlist',
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_RETRY: 'download:retry',
  DOWNLOAD_OPEN_FILE: 'download:open-file',
  DOWNLOAD_SHOW_IN_FOLDER: 'download:show-in-folder',
  DOWNLOAD_REMOVE_HISTORY: 'download:remove-history',
  DOWNLOAD_CLEAR_COMPLETED: 'download:clear-completed',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_QUEUE_UPDATE: 'download:queue-update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_SELECT_FOLDER: 'settings:select-folder',
  UPDATE_GET_STATUS: 'update:get-status',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status'
} as const;

/**
 * Electron API exposed to renderer process
 */
const electronAPI = {
  platform: process.platform,

  // ============================================================================
  // Video Operations
  // ============================================================================

  /**
   * Fetch video metadata from URL
   */
  fetchVideoInfo: (url: string): Promise<FetchVideoInfoResponse> => {
    const request: FetchVideoInfoRequest = { url };
    return ipcRenderer.invoke(IPC_CHANNELS.VIDEO_FETCH_INFO, request);
  },

  /** Fetch a flat playlist preview without downloading media. */
  fetchPlaylistInfo: (url: string): Promise<FetchPlaylistInfoResponse> => {
    const request: FetchPlaylistInfoRequest = { url };
    return ipcRenderer.invoke(IPC_CHANNELS.VIDEO_FETCH_PLAYLIST, request);
  },

  // ============================================================================
  // Download Operations
  // ============================================================================

  /**
   * Start a new download
   */
  startDownload: (
    url: string,
    videoTitle: string,
    format: 'mp4' | 'mp3',
    quality: string
  ): Promise<StartDownloadResponse> => {
    const request: StartDownloadRequest = { url, videoTitle, format, quality };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, request);
  },

  /**
   * Pause a download
   */
  pauseDownload: (taskId: string): Promise<PauseDownloadResponse> => {
    const request: PauseDownloadRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_PAUSE, request);
  },

  /**
   * Resume a paused download
   */
  resumeDownload: (taskId: string): Promise<ResumeDownloadResponse> => {
    const request: ResumeDownloadRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_RESUME, request);
  },

  /**
   * Cancel a download
   */
  cancelDownload: (taskId: string): Promise<CancelDownloadResponse> => {
    const request: CancelDownloadRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, request);
  },

  retryDownload: (taskId: string): Promise<TaskActionResponse> => {
    const request: TaskActionRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_RETRY, request);
  },

  openDownloadedFile: (taskId: string): Promise<TaskActionResponse> => {
    const request: TaskActionRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_OPEN_FILE, request);
  },

  showDownloadedFile: (taskId: string): Promise<TaskActionResponse> => {
    const request: TaskActionRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_SHOW_IN_FOLDER, request);
  },

  removeHistoryItem: (taskId: string): Promise<TaskActionResponse> => {
    const request: TaskActionRequest = { taskId };
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_REMOVE_HISTORY, request);
  },

  clearCompleted: (): Promise<ClearCompletedResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CLEAR_COMPLETED, {});
  },

  // ============================================================================
  // Settings Operations
  // ============================================================================

  /**
   * Get current settings
   */
  getSettings: (): Promise<GetSettingsResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, {});
  },

  /**
   * Update settings
   */
  updateSettings: (settings: UpdateSettingsRequest): Promise<UpdateSettingsResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings);
  },

  /**
   * Open folder selection dialog
   */
  selectFolder: (): Promise<SelectFolderResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SELECT_FOLDER, {});
  },

  // ============================================================================
  // Application Update Operations
  // ============================================================================

  getUpdateStatus: (): Promise<AppUpdateResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATUS, {});
  },

  checkForAppUpdate: (): Promise<AppUpdateResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK, {});
  },

  downloadAppUpdate: (): Promise<AppUpdateResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD, {});
  },

  installAppUpdate: (): Promise<AppUpdateResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL, {});
  },

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * Listen for download progress updates
   */
  onProgressUpdate: (callback: (data: ProgressUpdateEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: ProgressUpdateEvent) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);
    };
  },

  /**
   * Listen for queue state updates
   */
  onQueueUpdate: (callback: (data: QueueStateEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: QueueStateEvent) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_QUEUE_UPDATE, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_QUEUE_UPDATE, listener);
    };
  },

  onUpdateStatus: (callback: (status: AppUpdateStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: AppUpdateStatus) => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener);
    };
  }
};

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declaration for window.electronAPI
export type ElectronAPI = typeof electronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
