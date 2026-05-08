import { DownloadStatus, FormatType } from '../value-objects';

/**
 * DownloadTask entity
 * Represents a single download operation with state, progress, and metadata
 */
export interface DownloadTask {
  readonly id: string;                    // Unique task identifier
  readonly url: string;                   // Video URL
  readonly videoTitle: string;            // Video title (for display)
  status: DownloadStatus;                 // Current status (mutable)
  progress: number;                       // Progress percentage (0-100)
  speed: string;                          // Download speed (e.g., "1.5MiB/s")
  eta: string;                            // Estimated time remaining (e.g., "00:05:23")
  readonly filePath: string;              // Target file path
  readonly selectedFormat: FormatType;    // Selected format (mp4 or mp3)
  readonly selectedQuality: string;       // Selected quality code
  retryCount: number;                     // Number of retry attempts (0-3)
  errorMessage?: string;                  // Error message if status is 'error'
  readonly createdAt: Date;               // Task creation timestamp
  updatedAt: Date;                        // Last update timestamp
  processId?: number;                     // yt-dlp process ID (for pause/resume/cancel)
}
