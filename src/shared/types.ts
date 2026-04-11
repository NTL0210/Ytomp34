/**
 * Shared types for IPC communication between Main and Renderer processes
 * These types ensure type safety across the IPC boundary
 */

// ============================================================================
// IPC Channel Names
// ============================================================================

export const IPC_CHANNELS = {
  // URL Validation
  CHECK_URL: 'check-url',
  
  // Metadata
  FETCH_METADATA: 'fetch-metadata',
  
  // Download
  DOWNLOAD_VIDEO: 'download-video',
  CANCEL_DOWNLOAD: 'cancel-download',
  
  // Settings
  GET_SETTINGS: 'get-settings',
  UPDATE_SETTINGS: 'update-settings',
  
  // History
  GET_HISTORY: 'get-history',
  CLEAR_HISTORY: 'clear-history',
  
  // Events (Main -> Renderer)
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_ERROR: 'download-error',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  protocol: string;
  domain: string;
}

export interface VideoFormat {
  formatId: string;
  ext: string;
  resolution: string;
  filesize: number;
  vcodec: string;
  acodec: string;
  fps: number;
}

export interface VideoMetadata {
  title: string;
  thumbnail: string;
  duration: number;
  formats: VideoFormat[];
}

export interface DownloadRequest {
  url: string;
  format: string;
}

export interface ProgressUpdate {
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  status: string;
}

export interface DownloadResult {
  success: boolean;
  filePath: string;
  fileSize: number;
  duration: number;
  error?: string;
}

export interface ErrorInfo {
  message: string;
  code: string;
  details?: any;
  timestamp: number;
}

export interface Settings {
  language: 'en' | 'vi';
  theme: 'light' | 'dark' | 'system';
  defaultDownloadPath: string;
  maxDownloadSize: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  format: string;
  fileSize: number;
  filePath: string;
  downloadedAt: number;
}

// ============================================================================
// IPC Message Validation
// ============================================================================

export function isValidChannel(channel: string): channel is IPCChannel {
  return Object.values(IPC_CHANNELS).includes(channel as IPCChannel);
}

export function validateIPCMessage(channel: string, data: any): { valid: boolean; error?: string } {
  if (!isValidChannel(channel)) {
    return { valid: false, error: `Invalid IPC channel: ${channel}` };
  }

  // Channel-specific validation
  switch (channel) {
    case IPC_CHANNELS.CHECK_URL:
      if (typeof data !== 'string') {
        return { valid: false, error: 'CHECK_URL requires string URL' };
      }
      break;

    case IPC_CHANNELS.FETCH_METADATA:
      if (typeof data !== 'string') {
        return { valid: false, error: 'FETCH_METADATA requires string URL' };
      }
      break;

    case IPC_CHANNELS.DOWNLOAD_VIDEO:
      if (!data || typeof data.url !== 'string' || typeof data.format !== 'string') {
        return { valid: false, error: 'DOWNLOAD_VIDEO requires {url: string, format: string}' };
      }
      break;

    case IPC_CHANNELS.UPDATE_SETTINGS:
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'UPDATE_SETTINGS requires settings object' };
      }
      break;
  }

  return { valid: true };
}
