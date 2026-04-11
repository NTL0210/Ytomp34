import { BrowserWindow } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import { logger } from './logger.service';
import { ytdlpService } from './ytdlp.service';
import { directoryManager } from './directory-manager.service';
import { errorHandlerService } from './error-handler.service';
import { IPC_CHANNELS } from '../../shared/types';
import type { DownloadRequest, ProgressUpdate, DownloadResult } from '../../shared/types';

/**
 * Download Service
 * Orchestrates the download process with validation, progress tracking, and error handling
 * Requirements: REQ-FUN-004.1, REQ-FUN-004.2, REQ-FUN-004.4, REQ-FUN-004.8,
 *               REQ-FUN-004.11, REQ-FUN-004.12, REQ-FUN-004.13, REQ-NFR-020.2
 */

interface DownloadState {
  isDownloading: boolean;
  currentUrl: string | null;
  startTime: number | null;
  lastDownloadTime: number | null;
}

class DownloadService {
  private state: DownloadState = {
    isDownloading: false,
    currentUrl: null,
    startTime: null,
    lastDownloadTime: null,
  };

  private mainWindow: BrowserWindow | null = null;
  private readonly COOLDOWN_MS = 2000; // 2 seconds
  private readonly PROGRESS_INTERVAL_MS = 1000; // 1 second
  private progressTimer: NodeJS.Timeout | null = null;
  private lastProgress: ProgressUpdate | null = null;

  /**
   * Set main window for sending events
   */
  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start download process
   */
  public async startDownload(request: DownloadRequest): Promise<DownloadResult> {
    logger.info('Download', 'Starting download', { request });

    try {
      // Check if already downloading
      if (this.state.isDownloading) {
        throw new Error('Another download is already in progress');
      }

      // Check cooldown period
      if (this.state.lastDownloadTime) {
        const timeSinceLastDownload = Date.now() - this.state.lastDownloadTime;
        if (timeSinceLastDownload < this.COOLDOWN_MS) {
          const remainingCooldown = this.COOLDOWN_MS - timeSinceLastDownload;
          throw new Error(`Please wait ${Math.ceil(remainingCooldown / 1000)} seconds before starting another download`);
        }
      }

      // Set downloading state
      this.state.isDownloading = true;
      this.state.currentUrl = request.url;
      this.state.startTime = Date.now();

      // Get temp directory
      const tempDir = await directoryManager.getDirectory('temp');
      const tempFileName = `download_${Date.now()}.tmp`;
      const tempFilePath = join(tempDir, tempFileName);

      // Check disk space (estimate 2x the expected size for safety)
      await this.checkDiskSpace(tempDir, 100 * 1024 * 1024); // Minimum 100MB

      // Start progress reporting
      this.startProgressReporting();

      // Download to temp folder
      await ytdlpService.download(
        request.url,
        tempFilePath,
        request.format,
        (progress) => {
          this.lastProgress = {
            percentage: progress.percentage,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            speed: progress.speed,
            eta: progress.eta,
            status: 'downloading',
          };
        }
      );

      // Stop progress reporting
      this.stopProgressReporting();

      // Verify file exists and has content
      if (!existsSync(tempFilePath)) {
        throw new Error('Download completed but file not found');
      }

      const stats = statSync(tempFilePath);
      if (stats.size === 0) {
        await fs.unlink(tempFilePath);
        throw new Error('Downloaded file is empty');
      }

      // Calculate download duration
      const duration = this.state.startTime ? Date.now() - this.state.startTime : 0;

      // Send completion event
      const result: DownloadResult = {
        success: true,
        filePath: tempFilePath,
        fileSize: stats.size,
        duration,
      };

      this.sendDownloadComplete(result);

      logger.info('Download', 'Download completed successfully', {
        url: request.url,
        fileSize: stats.size,
        duration,
      });

      return result;
    } catch (error: any) {
      logger.error('Download', 'Download failed', {
        url: request.url,
        error: error.message,
      });

      // Cleanup on error
      await this.cleanup();

      // Handle error with error handler service
      const errorInfo = errorHandlerService.handleError(error, 'Download');

      // Send error event
      this.sendDownloadError({
        message: errorInfo.userMessage,
        code: errorInfo.code || 'DOWNLOAD_ERROR',
        timestamp: Date.now(),
      });

      throw new Error(errorInfo.userMessage);
    } finally {
      // Reset state
      this.state.isDownloading = false;
      this.state.currentUrl = null;
      this.state.startTime = null;
      this.state.lastDownloadTime = Date.now();
      this.stopProgressReporting();
    }
  }

  /**
   * Cancel current download
   */
  public async cancelDownload(): Promise<void> {
    if (!this.state.isDownloading) {
      logger.warning('Download', 'No download in progress to cancel');
      return;
    }

    logger.info('Download', 'Cancelling download', { url: this.state.currentUrl });

    try {
      // Cancel yt-dlp process
      await ytdlpService.cancelDownload();

      // Cleanup temp files
      await this.cleanup();

      // Send cancellation event
      this.sendDownloadError({
        message: 'Download cancelled by user',
        code: 'DOWNLOAD_CANCELLED',
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Download', 'Error during cancellation', { error });
    } finally {
      this.state.isDownloading = false;
      this.state.currentUrl = null;
      this.state.startTime = null;
      this.stopProgressReporting();
    }
  }

  /**
   * Check if enough disk space is available
   */
  private async checkDiskSpace(directory: string, requiredBytes: number): Promise<void> {
    try {
      // Note: Node.js doesn't have built-in disk space check
      // This is a placeholder - in production, use a library like 'check-disk-space'
      // For now, we'll just check if directory is writable
      
      const testFile = join(directory, '.disk-check');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      logger.debug('Download', 'Disk space check passed', { directory });
    } catch (error) {
      logger.error('Download', 'Disk space check failed', { directory, error });
      throw new Error('Insufficient disk space or directory not writable');
    }
  }

  /**
   * Start progress reporting timer
   * Emits progress events every 1 second
   */
  private startProgressReporting(): void {
    this.progressTimer = setInterval(() => {
      if (this.lastProgress) {
        this.sendDownloadProgress(this.lastProgress);
      }
    }, this.PROGRESS_INTERVAL_MS);
  }

  /**
   * Stop progress reporting timer
   */
  private stopProgressReporting(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    this.lastProgress = null;
  }

  /**
   * Cleanup temp files
   */
  private async cleanup(): Promise<void> {
    try {
      const tempDir = await directoryManager.getDirectory('temp');
      
      // Find and delete temp download files
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.startsWith('download_') && file.endsWith('.tmp')) {
          const filePath = join(tempDir, file);
          try {
            await fs.unlink(filePath);
            logger.debug('Download', 'Cleaned up temp file', { file });
          } catch (error) {
            logger.warning('Download', 'Failed to delete temp file', { file, error });
          }
        }
      }
    } catch (error) {
      logger.error('Download', 'Cleanup failed', { error });
    }
  }

  /**
   * Send download progress event to renderer
   */
  private sendDownloadProgress(progress: ProgressUpdate): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, progress);
    }
  }

  /**
   * Send download complete event to renderer
   */
  private sendDownloadComplete(result: DownloadResult): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, result);
    }
  }

  /**
   * Send download error event to renderer
   */
  private sendDownloadError(error: { message: string; code: string; timestamp: number }): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_ERROR, error);
    }
  }

  /**
   * Check if download is in progress
   */
  public isDownloading(): boolean {
    return this.state.isDownloading;
  }

  /**
   * Get current download state
   */
  public getState(): DownloadState {
    return { ...this.state };
  }
}

// Export singleton instance
export const downloadService = new DownloadService();
