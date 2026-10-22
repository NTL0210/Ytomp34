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
  /** Actual output path when a fallback changes the extension (e.g. m4a instead of mp3). */
  outputFilePath?: string;
  readonly selectedFormat: FormatType;    // Selected format (mp4 or mp3)
  readonly selectedQuality: string;       // Selected quality code
  retryCount: number;                     // Number of retry attempts (0-3)
  errorMessage?: string;                  // Error message if status is 'error'
  /** Actual dimensions reported by ffprobe after the download completed. */
  actualWidth?: number;
  actualHeight?: number;
  /** Human-readable actual dimensions, for example "1920 × 1080". */
  actualResolution?: string;
  /** Actual short-side tier, for example "1080p". */
  actualQuality?: string;
  actualVideoCodec?: string;
  actualAudioCodec?: string;
  actualContainer?: string;
  /** Whether ffprobe verified the file. Undefined when verification was not attempted. */
  verified?: boolean;
  hasAudio?: boolean;
  /** Truthful explanation of a fallback or a requested/actual quality mismatch. */
  qualityNote?: string;
  readonly createdAt: Date;               // Task creation timestamp
  updatedAt: Date;                        // Last update timestamp
  processId?: number;                     // yt-dlp process ID (for pause/resume/cancel)
}
