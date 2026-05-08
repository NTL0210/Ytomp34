/**
 * Download IPC Handlers
 * Handles download-related IPC communication
 * Validates: Requirements 4.1, 4.2, 5.1, 6.4, 6.5, 8.5, 9.1
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import {
  CreateDownloadTaskUseCase,
  ExecuteDownloadUseCase,
  ManageQueueUseCase
} from '../application';
import { DownloadQueue } from '../domain/entities';
import { Logger } from '../infrastructure';
import { ProgressData } from '../infrastructure/ProgressParser';
import {
  IPC_CHANNELS,
  StartDownloadRequest,
  StartDownloadResponse,
  PauseDownloadRequest,
  PauseDownloadResponse,
  ResumeDownloadRequest,
  ResumeDownloadResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  ProgressUpdateEvent,
  QueueStateEvent
} from './contracts';

export class DownloadHandlers {
  private progressUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    private createDownloadTaskUseCase: CreateDownloadTaskUseCase,
    private executeDownloadUseCase: ExecuteDownloadUseCase,
    private manageQueueUseCase: ManageQueueUseCase,
    private queue: DownloadQueue,
    private logger: Logger,
    private getMainWindow: () => BrowserWindow | null
  ) {}

  /**
   * Register all download-related IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.DOWNLOAD_START,
      this.handleStartDownload.bind(this)
    );

    ipcMain.handle(
      IPC_CHANNELS.DOWNLOAD_PAUSE,
      this.handlePauseDownload.bind(this)
    );

    ipcMain.handle(
      IPC_CHANNELS.DOWNLOAD_RESUME,
      this.handleResumeDownload.bind(this)
    );

    ipcMain.handle(
      IPC_CHANNELS.DOWNLOAD_CANCEL,
      this.handleCancelDownload.bind(this)
    );

    // Start progress update interval (at least once per second)
    this.startProgressUpdateInterval();

    this.logger.info('Download IPC handlers registered');
  }

  /**
   * Handle download:start IPC call
   */
  private async handleStartDownload(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<StartDownloadResponse> {
    try {
      // Validate request structure
      if (!this.isValidStartDownloadRequest(request)) {
        this.logger.error('Invalid start download request', undefined, { request });
        return {
          success: false,
          error: {
            type: 'invalid_params',
            message: 'Invalid request: missing or invalid parameters'
          }
        };
      }

      this.logger.info('Starting download', {
        url: request.url,
        format: request.format,
        quality: request.quality
      });

      // Create download task
      const createResponse = await this.createDownloadTaskUseCase.execute(request);

      if (!createResponse.success || !createResponse.taskId) {
        return createResponse;
      }

      // Send initial queue update
      this.sendQueueUpdate();

      // Start executing downloads from queue
      await this.manageQueueUseCase.processQueue();

      return createResponse;
    } catch (error) {
      this.logger.error('Error handling start download', error as Error);

      return {
        success: false,
        error: {
          type: 'unknown',
          message: (error as Error).message || 'Unknown error occurred'
        }
      };
    }
  }

  /**
   * Handle download:pause IPC call
   */
  private async handlePauseDownload(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<PauseDownloadResponse> {
    try {
      // Validate request structure
      if (!this.isValidPauseDownloadRequest(request)) {
        this.logger.error('Invalid pause download request', undefined, { request });
        return {
          success: false,
          error: 'Invalid request: missing or invalid taskId'
        };
      }

      this.logger.info('Pausing download', { taskId: request.taskId });

      const response = await this.manageQueueUseCase.pauseDownload(request);

      // Send queue update
      this.sendQueueUpdate();

      return response;
    } catch (error) {
      this.logger.error('Error handling pause download', error as Error);

      return {
        success: false,
        error: (error as Error).message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Handle download:resume IPC call
   */
  private async handleResumeDownload(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<ResumeDownloadResponse> {
    try {
      // Validate request structure
      if (!this.isValidResumeDownloadRequest(request)) {
        this.logger.error('Invalid resume download request', undefined, { request });
        return {
          success: false,
          error: 'Invalid request: missing or invalid taskId'
        };
      }

      this.logger.info('Resuming download', { taskId: request.taskId });

      const response = await this.manageQueueUseCase.resumeDownload(request);

      // Send queue update
      this.sendQueueUpdate();

      return response;
    } catch (error) {
      this.logger.error('Error handling resume download', error as Error);

      return {
        success: false,
        error: (error as Error).message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Handle download:cancel IPC call
   */
  private async handleCancelDownload(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<CancelDownloadResponse> {
    try {
      // Validate request structure
      if (!this.isValidCancelDownloadRequest(request)) {
        this.logger.error('Invalid cancel download request', undefined, { request });
        return {
          success: false,
          error: 'Invalid request: missing or invalid taskId'
        };
      }

      this.logger.info('Cancelling download', { taskId: request.taskId });

      const response = await this.manageQueueUseCase.cancelDownload(request);

      // Send queue update
      this.sendQueueUpdate();

      // Process queue to start next task if available
      await this.manageQueueUseCase.processQueue();

      return response;
    } catch (error) {
      this.logger.error('Error handling cancel download', error as Error);

      return {
        success: false,
        error: (error as Error).message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Send progress update event to renderer
   */
  sendProgressUpdate(taskId: string, progress: ProgressData, status: string): void {
    const mainWindow = this.getMainWindow();
    if (!mainWindow) return;

    const event: ProgressUpdateEvent = {
      taskId,
      progress: progress.percentage,
      speed: progress.speed,
      eta: progress.eta,
      status: status as any
    };

    mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, event);
  }

  /**
   * Send queue state update event to renderer
   */
  sendQueueUpdate(): void {
    const mainWindow = this.getMainWindow();
    if (!mainWindow) return;

    const event: QueueStateEvent = {
      tasks: this.queue.tasks
    };

    mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_QUEUE_UPDATE, event);
  }

  /**
   * Start interval to send progress updates at least once per second
   */
  private startProgressUpdateInterval(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
    }

    this.progressUpdateInterval = setInterval(() => {
      this.sendQueueUpdate();
    }, 1000);
  }

  /**
   * Stop progress update interval
   */
  stopProgressUpdateInterval(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  /**
   * Validate StartDownloadRequest structure
   */
  private isValidStartDownloadRequest(request: unknown): request is StartDownloadRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'url' in request &&
      'videoTitle' in request &&
      'format' in request &&
      'quality' in request &&
      typeof (request as StartDownloadRequest).url === 'string' &&
      typeof (request as StartDownloadRequest).videoTitle === 'string' &&
      ((request as StartDownloadRequest).format === 'mp4' || (request as StartDownloadRequest).format === 'mp3') &&
      typeof (request as StartDownloadRequest).quality === 'string'
    );
  }

  /**
   * Validate PauseDownloadRequest structure
   */
  private isValidPauseDownloadRequest(request: unknown): request is PauseDownloadRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'taskId' in request &&
      typeof (request as PauseDownloadRequest).taskId === 'string'
    );
  }

  /**
   * Validate ResumeDownloadRequest structure
   */
  private isValidResumeDownloadRequest(request: unknown): request is ResumeDownloadRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'taskId' in request &&
      typeof (request as ResumeDownloadRequest).taskId === 'string'
    );
  }

  /**
   * Validate CancelDownloadRequest structure
   */
  private isValidCancelDownloadRequest(request: unknown): request is CancelDownloadRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'taskId' in request &&
      typeof (request as CancelDownloadRequest).taskId === 'string'
    );
  }
}
