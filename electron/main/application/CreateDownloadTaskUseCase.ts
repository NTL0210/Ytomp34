import * as path from 'path';
import { DownloadTask, DownloadQueue } from '../domain/entities';
import { FormatType } from '../domain/value-objects';
import { FileSanitizer, SettingsStore, Logger } from '../infrastructure';

/**
 * StartDownload request/response contracts
 */
export interface StartDownloadRequest {
  url: string;
  videoTitle: string;
  format: FormatType;
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

/**
 * CreateDownloadTaskUseCase
 * Loads settings, sanitizes filename, creates task with unique ID, adds to queue
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class CreateDownloadTaskUseCase {
  constructor(
    private queue: DownloadQueue,
    private fileSanitizer: FileSanitizer,
    private settingsStore: SettingsStore,
    private logger: Logger
  ) {}

  async execute(request: StartDownloadRequest): Promise<StartDownloadResponse> {
    try {
      // Load settings to get download directory
      const settings = await this.settingsStore.load();

      // Sanitize video title
      const sanitizedTitle = this.fileSanitizer.sanitize(request.videoTitle);

      // Determine file extension based on format
      const extension = request.format === 'mp4' ? '.mp4' : '.mp3';

      // Ensure unique filename
      const uniqueFilename = this.fileSanitizer.ensureUnique(
        settings.downloadDirectory,
        sanitizedTitle,
        extension
      );

      // Create download task with unique ID
      const task: DownloadTask = {
        id: this.generateId(),
        url: request.url,
        videoTitle: request.videoTitle,
        status: 'pending',
        progress: 0,
        speed: '0 B/s',
        eta: '--:--:--',
        filePath: path.join(settings.downloadDirectory, uniqueFilename),
        selectedFormat: request.format,
        selectedQuality: request.quality,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add task to queue
      this.queue.addTask(task);

      this.logger.info('Download task created', {
        taskId: task.id,
        videoTitle: request.videoTitle,
        format: request.format,
        quality: request.quality
      });

      return {
        success: true,
        taskId: task.id
      };
    } catch (error) {
      this.logger.error('Failed to create download task', error as Error);

      return {
        success: false,
        error: {
          type: 'unknown',
          message: (error as Error).message
        }
      };
    }
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
