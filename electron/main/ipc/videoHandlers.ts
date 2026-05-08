/**
 * Video IPC Handlers
 * Handles video-related IPC communication
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.5, 14.5, 16.3, 16.5, 17.5
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { FetchVideoInfoUseCase } from '../application';
import { Logger } from '../infrastructure';
import {
  IPC_CHANNELS,
  FetchVideoInfoRequest,
  FetchVideoInfoResponse
} from './contracts';

export class VideoHandlers {
  constructor(
    private fetchVideoInfoUseCase: FetchVideoInfoUseCase,
    private logger: Logger
  ) {}

  /**
   * Register all video-related IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.VIDEO_FETCH_INFO,
      this.handleFetchVideoInfo.bind(this)
    );

    this.logger.info('Video IPC handlers registered');
  }

  /**
   * Handle video:fetch-info IPC call
   * Validates message structure and invokes FetchVideoInfoUseCase
   */
  private async handleFetchVideoInfo(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<FetchVideoInfoResponse> {
    try {
      // Validate request structure
      if (!this.isValidFetchVideoInfoRequest(request)) {
        this.logger.error('Invalid fetch video info request', undefined, { request });
        return {
          success: false,
          error: {
            type: 'invalid_url',
            message: 'Invalid request: missing or invalid URL'
          }
        };
      }

      this.logger.info('Fetching video info', { url: request.url });

      // Invoke use case
      const response = await this.fetchVideoInfoUseCase.execute(request);

      return response;
    } catch (error) {
      this.logger.error('Error handling fetch video info', error as Error);

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
   * Validate FetchVideoInfoRequest structure
   */
  private isValidFetchVideoInfoRequest(request: unknown): request is FetchVideoInfoRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'url' in request &&
      typeof (request as FetchVideoInfoRequest).url === 'string' &&
      (request as FetchVideoInfoRequest).url.length > 0
    );
  }
}
