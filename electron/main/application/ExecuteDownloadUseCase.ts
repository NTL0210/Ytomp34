import { DownloadTask, DownloadQueue } from '../domain/entities';
import { DownloadStatus } from '../domain/value-objects';
import { YtDlpExecutor, Logger, ProgressParser, ProgressData } from '../infrastructure';

/**
 * Callback types for progress and status updates
 */
export type ProgressCallback = (taskId: string, progress: ProgressData) => void;
export type StatusCallback = (taskId: string, status: DownloadStatus) => void;

/**
 * ExecuteDownloadUseCase
 * Starts download, handles progress callbacks, implements retry logic (3 times), starts next task on completion
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.4, 10.1, 10.2, 10.3, 10.4, 23.1, 23.2, 23.3, 23.4, 23.5
 */
export class ExecuteDownloadUseCase {
  constructor(
    private ytDlpExecutor: YtDlpExecutor,
    private queue: DownloadQueue,
    private progressParser: ProgressParser,
    private logger: Logger,
    private onProgressUpdate: ProgressCallback,
    private onStatusChange: StatusCallback
  ) {}

  async execute(task: DownloadTask): Promise<void> {
    try {
      // Update status to downloading
      task.status = 'downloading';
      task.updatedAt = new Date();
      this.onStatusChange(task.id, 'downloading');

      this.logger.info('Starting download', {
        taskId: task.id,
        url: task.url,
        format: task.selectedFormat,
        quality: task.selectedQuality
      });

      // Start download with callbacks
      const pid = await this.ytDlpExecutor.startDownload(
        task.url,
        task.selectedFormat,
        task.selectedQuality,
        task.filePath,
        // Progress callback
        (progress: ProgressData) => {
          task.progress = progress.percentage;
          task.speed = progress.speed;
          task.eta = progress.eta;
          task.updatedAt = new Date();
          this.onProgressUpdate(task.id, progress);
        },
        // Error callback
        (error: string) => {
          this.handleDownloadError(task, error);
        },
        // Complete callback
        () => {
          this.handleDownloadComplete(task);
        }
      );

      // Store process ID for pause/resume/cancel operations
      task.processId = pid;

      this.logger.info('Download process started', { taskId: task.id, pid });
    } catch (error) {
      this.logger.error('Failed to execute download', error as Error, { taskId: task.id });
      this.handleDownloadError(task, (error as Error).message);
    }
  }

  private handleDownloadComplete(task: DownloadTask): void {
    task.status = 'completed';
    task.progress = 100;
    task.updatedAt = new Date();
    this.onStatusChange(task.id, 'completed');

    this.logger.info('Download completed', { taskId: task.id, filePath: task.filePath });

    // Start next task in queue
    this.startNextTask();
  }

  private handleDownloadError(task: DownloadTask, error: string): void {
    task.errorMessage = error;
    task.updatedAt = new Date();

    this.logger.error('Download error occurred', undefined, {
      taskId: task.id,
      error,
      retryCount: task.retryCount
    });

    // Check if should retry (max 3 attempts)
    if (task.retryCount < 3) {
      task.retryCount++;
      task.status = 'pending';
      this.onStatusChange(task.id, 'pending');

      this.logger.info('Retrying download', {
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: 3
      });

      // Add delay for network errors (5 seconds)
      if (this.isNetworkError(error)) {
        setTimeout(() => this.startNextTask(), 5000);
      } else {
        this.startNextTask();
      }
    } else {
      // Max retries reached, mark as error
      task.status = 'error';
      this.onStatusChange(task.id, 'error');

      this.logger.error('Download failed after max retries', undefined, {
        taskId: task.id,
        retryCount: task.retryCount
      });

      // Start next task
      this.startNextTask();
    }
  }

  private isNetworkError(error: string): boolean {
    const errorLower = error.toLowerCase();
    return (
      errorLower.includes('network') ||
      errorLower.includes('connection') ||
      errorLower.includes('timeout') ||
      errorLower.includes('enotfound') ||
      errorLower.includes('etimedout')
    );
  }

  private startNextTask(): void {
    // Check if we can start a new task
    if (this.queue.canStartNewTask()) {
      const nextTask = this.queue.getNextPendingTask();
      if (nextTask) {
        this.logger.info('Starting next task from queue', { taskId: nextTask.id });
        this.execute(nextTask);
      }
    }
  }
}
