import * as fs from 'fs';
import { DownloadQueue } from '../domain/entities';
import { YtDlpExecutor, Logger, QueuePersistence } from '../infrastructure';

/**
 * Queue operation request/response contracts
 */
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

/**
 * ManageQueueUseCase
 * FIFO processing, enforces concurrent limit, pause/resume/cancel operations, persists queue every 5s
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5
 */
export class ManageQueueUseCase {
  private persistenceInterval?: NodeJS.Timeout;
  private executeDownloadUseCase?: any; // Will be set by dependency injection

  constructor(
    private queue: DownloadQueue,
    private ytDlpExecutor: YtDlpExecutor,
    private queuePersistence: QueuePersistence,
    private logger: Logger
  ) {
    // Start periodic queue persistence (every 5 seconds)
    this.startPeriodicPersistence();
  }

  /**
   * Set the ExecuteDownloadUseCase (called after construction to avoid circular dependency)
   */
  setExecuteDownloadUseCase(executeDownloadUseCase: any): void {
    this.executeDownloadUseCase = executeDownloadUseCase;
  }

  /**
   * Process queue - start pending tasks if concurrent limit allows
   */
  async processQueue(): Promise<void> {
    this.logger.debug('Queue processing triggered', {
      activeCount: this.queue.getActiveTasksCount(),
      maxConcurrent: this.queue.maxConcurrent
    });

    // Start pending tasks if we have capacity
    while (this.queue.canStartNewTask()) {
      const nextTask = this.queue.getNextPendingTask();
      if (!nextTask) {
        break; // No more pending tasks
      }

      if (this.executeDownloadUseCase) {
        this.logger.info('Starting download from queue', { taskId: nextTask.id });
        await this.executeDownloadUseCase.execute(nextTask);
      } else {
        this.logger.error('ExecuteDownloadUseCase not set', undefined, { taskId: nextTask.id });
        break;
      }
    }
  }

  /**
   * Pause a downloading task (wrapper for pause method)
   */
  async pauseDownload(request: PauseDownloadRequest): Promise<PauseDownloadResponse> {
    return this.pause(request);
  }

  /**
   * Resume a paused task (wrapper for resume method)
   */
  async resumeDownload(request: ResumeDownloadRequest): Promise<ResumeDownloadResponse> {
    return this.resume(request);
  }

  /**
   * Cancel a task (wrapper for cancel method)
   */
  async cancelDownload(request: CancelDownloadRequest): Promise<CancelDownloadResponse> {
    return this.cancel(request);
  }

  /**
   * Pause a downloading task
   */
  async pause(request: PauseDownloadRequest): Promise<PauseDownloadResponse> {
    try {
      const task = this.queue.tasks.find(t => t.id === request.taskId);

      if (!task) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      if (task.status !== 'downloading') {
        return {
          success: false,
          error: 'Task is not downloading'
        };
      }

      if (!task.processId) {
        return {
          success: false,
          error: 'No process ID available'
        };
      }

      // Send SIGSTOP signal to pause the process
      await this.ytDlpExecutor.pauseProcess(task.processId);

      // Update task status
      task.status = 'paused';
      task.updatedAt = new Date();

      this.logger.info('Download paused', { taskId: task.id, processId: task.processId });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to pause download', error as Error, { taskId: request.taskId });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Resume a paused task
   */
  async resume(request: ResumeDownloadRequest): Promise<ResumeDownloadResponse> {
    try {
      const task = this.queue.tasks.find(t => t.id === request.taskId);

      if (!task) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      if (task.status !== 'paused') {
        return {
          success: false,
          error: 'Task is not paused'
        };
      }

      if (!task.processId) {
        return {
          success: false,
          error: 'No process ID available'
        };
      }

      // Send SIGCONT signal to resume the process
      await this.ytDlpExecutor.resumeProcess(task.processId);

      // Update task status
      task.status = 'downloading';
      task.updatedAt = new Date();

      this.logger.info('Download resumed', { taskId: task.id, processId: task.processId });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to resume download', error as Error, { taskId: request.taskId });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Cancel a task and remove it from queue
   */
  async cancel(request: CancelDownloadRequest): Promise<CancelDownloadResponse> {
    try {
      const task = this.queue.tasks.find(t => t.id === request.taskId);

      if (!task) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      // If task is downloading, terminate the process
      if (task.status === 'downloading' && task.processId) {
        // Terminate process (SIGTERM then SIGKILL after 5s)
        await this.ytDlpExecutor.cancelProcess(task.processId);
        this.logger.info('Download process terminated', {
          taskId: task.id,
          processId: task.processId
        });
      }

      // Delete partial files if they exist
      try {
        if (fs.existsSync(task.filePath)) {
          fs.unlinkSync(task.filePath);
          this.logger.info('Deleted partial file', { filePath: task.filePath });
        }

        // Also check for .part files (yt-dlp creates these)
        const partFile = `${task.filePath}.part`;
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile);
          this.logger.info('Deleted partial file', { filePath: partFile });
        }
      } catch (error) {
        this.logger.error('Failed to delete partial files', error as Error, {
          filePath: task.filePath
        });
      }

      // Remove task from queue
      this.queue.removeTask(task.id);

      this.logger.info('Download cancelled and removed from queue', { taskId: task.id });

      // Start next pending task if limit allows
      if (this.queue.canStartNewTask()) {
        const nextTask = this.queue.getNextPendingTask();
        if (nextTask) {
          this.logger.info('Starting next task after cancellation', { taskId: nextTask.id });
          // Note: ExecuteDownloadUseCase will handle starting the next task
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to cancel download', error as Error, { taskId: request.taskId });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Start periodic queue persistence (every 5 seconds)
   */
  private startPeriodicPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.queuePersistence.save(this.queue);
        this.logger.debug('Queue persisted to disk');
      } catch (error) {
        this.logger.error('Failed to persist queue', error as Error);
      }
    }, 5000); // 5 seconds
  }

  /**
   * Stop periodic persistence (cleanup)
   */
  stopPeriodicPersistence(): void {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = undefined;
    }
  }
}
