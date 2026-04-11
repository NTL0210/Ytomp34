import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, validateIPCMessage } from '../shared/types';
import type {
  ValidationResult,
  VideoMetadata,
  DownloadRequest,
  ProgressUpdate,
  DownloadResult,
  ErrorInfo,
  Settings,
  HistoryEntry,
} from '../shared/types';

/**
 * Secure IPC Bridge with context isolation
 * Exposes only whitelisted channels to the renderer process
 */

// Type-safe IPC API
export interface ElectronAPI {
  // URL Validation
  checkUrl: (url: string) => Promise<ValidationResult>;
  
  // Metadata
  fetchMetadata: (url: string) => Promise<VideoMetadata>;
  
  // Download
  downloadVideo: (request: DownloadRequest) => Promise<void>;
  cancelDownload: () => Promise<void>;
  
  // Settings
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  
  // History
  getHistory: () => Promise<HistoryEntry[]>;
  clearHistory: () => Promise<void>;
  
  // Event listeners
  onDownloadProgress: (callback: (progress: ProgressUpdate) => void) => () => void;
  onDownloadComplete: (callback: (result: DownloadResult) => void) => () => void;
  onDownloadError: (callback: (error: ErrorInfo) => void) => () => void;
}

// Expose protected methods via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // URL Validation
  checkUrl: (url: string): Promise<ValidationResult> => {
    const validation = validateIPCMessage(IPC_CHANNELS.CHECK_URL, url);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.error));
    }
    return ipcRenderer.invoke(IPC_CHANNELS.CHECK_URL, url);
  },

  // Metadata
  fetchMetadata: (url: string): Promise<VideoMetadata> => {
    const validation = validateIPCMessage(IPC_CHANNELS.FETCH_METADATA, url);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.error));
    }
    return ipcRenderer.invoke(IPC_CHANNELS.FETCH_METADATA, url);
  },

  // Download
  downloadVideo: (request: DownloadRequest): Promise<void> => {
    const validation = validateIPCMessage(IPC_CHANNELS.DOWNLOAD_VIDEO, request);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.error));
    }
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_VIDEO, request);
  },

  cancelDownload: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CANCEL_DOWNLOAD);
  },

  // Settings
  getSettings: (): Promise<Settings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },

  updateSettings: (settings: Partial<Settings>): Promise<void> => {
    const validation = validateIPCMessage(IPC_CHANNELS.UPDATE_SETTINGS, settings);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.error));
    }
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, settings);
  },

  // History
  getHistory: (): Promise<HistoryEntry[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY);
  },

  clearHistory: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY);
  },

  // Event listeners with cleanup
  onDownloadProgress: (callback: (progress: ProgressUpdate) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: ProgressUpdate) => {
      callback(progress);
    };
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener);
    };
  },

  onDownloadComplete: (callback: (result: DownloadResult) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, result: DownloadResult) => {
      callback(result);
    };
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_COMPLETE, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_COMPLETE, listener);
    };
  },

  onDownloadError: (callback: (error: ErrorInfo) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, error: ErrorInfo) => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_ERROR, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_ERROR, listener);
    };
  },
} satisfies ElectronAPI);
