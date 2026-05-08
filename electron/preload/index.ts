/**
 * Preload Script
 * Exposes safe IPC API to renderer process via contextBridge
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Inline IPC channel constants to avoid import issues in preload
const IPC_CHANNELS = {
  VIDEO_FETCH_INFO: 'video:fetch-info',
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_QUEUE_UPDATE: 'download:queue-update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_SELECT_FOLDER: 'settings:select-folder'
} as const;

// Type definitions (inline to avoid imports)
interface FetchVideoInfoRequest {
  url: string;
}

interface FetchVideoInfoResponse {
  success: boolean;
  video?: {
    title: string;
    duration: number;
    thumbnail: string;
    formats: Array<{ quality: string; format: string }>;
  };
  error?: { type: string; message: string };
}

interface StartDownloadRequest {
  url: string;
  videoTitle: string;
  format: 'mp4' | 'mp3';
  quality: string;
}

interface StartDownloadResponse {
  success: boolean;
  taskId?: string;
  error?: { type: string; message: string };
}

interface PauseDownloadRequest {
  taskId: string;
}

interface PauseDownloadResponse {
  success: boolean;
  error?: { type: string; message: string };
}

interface ResumeDownloadRequest {
  taskId: string;
}

interface ResumeDownloadResponse {
  success: boolean;
  error?: { type: string; message: string };
}

interface CancelDownloadRequest {
  taskId: string;
}

interface CancelDownloadResponse {
  success: boolean;
  error?: { type: string; message: string };
}

interface GetSettingsResponse {
  success: boolean;
  settings?: {
    downloadPath: string;
    theme: 'light' | 'dark' | 'system';
    concurrentLimit: number;
  };
  error?: { type: string; message: string };
}

interface UpdateSettingsRequest {
  downloadPath?: string;
  theme?: 'light' | 'dark' | 'system';
  concurrentLimit?: number;
}

interface UpdateSettingsResponse {
  success: boolean;
  error?: { type: string; message: string };
}

interface SelectFolderResponse {
  success: boolean;
  path?: string;
  error?: { type: string; message: string };
}

interface ProgressUpdateEvent {
  taskId: string;
  progress: number;
  speed: string;
  eta: string;
  status: string;
}

interface QueueStateEvent {
  tasks: Array<any>;
}


/**
 * Electron API exposed to renderer process
 */
const electronAPI = {
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

  /**
   * Remove all listeners for a specific channel
   */
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
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
