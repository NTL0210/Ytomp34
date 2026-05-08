import { Video } from '../domain/entities';
import { ErrorType } from '../domain/value-objects';
import { YtDlpExecutor, Logger, ErrorCategorizer } from '../infrastructure';

/**
 * FetchVideoInfo request/response contracts
 */
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

/**
 * FetchVideoInfoUseCase
 * Validates URL, checks yt-dlp installation, fetches metadata with timeout
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.6, 14.1, 14.2, 14.3, 14.4
 */
export class FetchVideoInfoUseCase {
  constructor(
    private ytDlpExecutor: YtDlpExecutor,
    private logger: Logger,
    private errorCategorizer: ErrorCategorizer
  ) {}

  async execute(request: FetchVideoInfoRequest): Promise<FetchVideoInfoResponse> {
    try {
      // Validate URL format
      if (!this.isValidUrl(request.url)) {
        return {
          success: false,
          error: {
            type: 'invalid_url',
            message: 'Invalid URL format'
          }
        };
      }

      this.logger.info('Starting video info fetch', { url: request.url });

      // Check yt-dlp installation with detailed logging
      const installationCheck = await this.ytDlpExecutor.checkInstallation();
      this.logger.info('yt-dlp installation check', installationCheck);
      
      if (!installationCheck.installed) {
        this.logger.error('yt-dlp not installed', undefined, installationCheck);
        return {
          success: false,
          error: {
            type: 'yt_dlp_missing',
            message: 'yt-dlp is not installed or not accessible. The app will try to download it automatically on startup.'
          }
        };
      }

      this.logger.info('yt-dlp is available, fetching metadata...', { version: installationCheck.version });

      // Fetch metadata with 60s timeout (increased from 10s)
      const video = await Promise.race([
        this.ytDlpExecutor.fetchMetadata(request.url),
        this.timeout(60000)
      ]);

      this.logger.info('Video metadata fetched successfully', { 
        videoId: video.id, 
        title: video.title,
        duration: video.duration,
        formatCount: video.availableFormats.length
      });

      return {
        success: true,
        data: video
      };
    } catch (error) {
      this.logger.error('Failed to fetch video info', error as Error, { url: request.url });

      const errorType = this.errorCategorizer.categorize(error as Error);
      const errorMessage = (error as Error).message;

      // Provide more helpful error messages
      let userMessage = errorMessage;
      if (errorMessage.includes('Timeout')) {
        userMessage = 'Video information fetch timed out. This may happen with very long videos or slow internet. Please try again.';
      } else if (errorMessage.includes('yt-dlp not found')) {
        userMessage = 'yt-dlp is not properly installed. Please restart the app to allow automatic installation.';
      } else if (errorMessage.includes('Video unavailable')) {
        userMessage = 'This video is unavailable, private, or has been removed.';
      } else if (errorMessage.includes('Unsupported URL')) {
        userMessage = 'This URL is not supported. Please use a valid YouTube, Vimeo, or other supported platform URL.';
      }

      return {
        success: false,
        error: {
          type: errorType,
          message: userMessage
        }
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: Metadata fetch exceeded ${ms/1000} seconds`)), ms)
    );
  }
}
