/**
 * IPC Contracts and Types
 * Defines all request/response interfaces for IPC communication
 * between main and renderer processes
 */

import { Video, DownloadTask, Settings } from '../domain/entities';
import { ErrorType, DownloadStatus } from '../domain/value-objects';

// ============================================================================
// Video Information Contracts
// ============================================================================

export interface FetchVideoInfoRequest {
  url: string;
}

export interface FetchVideoInfoResponse {
  success: boolean;
  data?: Video;
  error?: {
    type: ErrorType;
    message: string;
  };
}

// ============================================================================
// Download Management Contracts
// ============================================================================

export interface StartDownloadRequest {
  url: string;
  videoTitle: string;
  format: 'mp4' | 'mp3';
  quality: string;
}

export interface StartDownloadResponse {
  success: boolean;
  taskId?: string;
  error?: {
    type: 'invalid_params' | 'queue_full' | 'unknown';
    message: string;
  };
}

export interface PauseDownloadRequest {
  taskId: string;
}

export interface PauseDownloadResponse {
  success: boolean;
  error?: string;
}

export interface ResumeDownloadRequest {
  taskId: string;
}

export interface ResumeDownloadResponse {
  success: boolean;
  error?: string;
}

export interface CancelDownloadRequest {
  taskId: string;
}

export interface CancelDownloadResponse {
  success: boolean;
  error?: string;
}

// ============================================================================
// IPC Events (Main → Renderer)
// ============================================================================

export interface ProgressUpdateEvent {
  taskId: string;
  progress: number;
  speed: string;
  eta: string;
  status: DownloadStatus;
}

export interface QueueStateEvent {
  tasks: DownloadTask[];
}

// ============================================================================
// Settings Contracts
// ============================================================================

export interface GetSettingsRequest {}

export interface GetSettingsResponse {
  success: boolean;
  data?: Settings;
}

export interface UpdateSettingsRequest {
  theme?: 'light' | 'dark';
  downloadDirectory?: string;
  concurrentLimit?: number;
}

export interface UpdateSettingsResponse {
  success: boolean;
  data?: Settings;
  error?: string;
}

export interface SelectFolderRequest {}

export interface SelectFolderResponse {
  success: boolean;
  path?: string;
  cancelled: boolean;
}

// ============================================================================
// IPC Channel Names
// ============================================================================

export const IPC_CHANNELS = {
  // Video channels
  VIDEO_FETCH_INFO: 'video:fetch-info',
  
  // Download channels
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_QUEUE_UPDATE: 'download:queue-update',
  
  // Settings channels
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_SELECT_FOLDER: 'settings:select-folder'
} as const;
