import { PlaylistInfo } from '../domain/entities';
import { ErrorType } from '../domain/value-objects';
import { ErrorCategorizer, Logger, YtDlpExecutor } from '../infrastructure';

export interface FetchPlaylistInfoRequest {
  url: string;
}

export interface FetchPlaylistInfoResponse {
  success: boolean;
  data?: PlaylistInfo;
  error?: {
    type: ErrorType;
    message: string;
  };
}

/** Fetch a bounded, flat playlist preview without downloading media. */
export class FetchPlaylistInfoUseCase {
  constructor(
    private ytDlpExecutor: YtDlpExecutor,
    private logger: Logger,
    private errorCategorizer: ErrorCategorizer
  ) {}

  async execute(request: FetchPlaylistInfoRequest): Promise<FetchPlaylistInfoResponse> {
    if (!this.isValidUrl(request.url)) {
      return {
        success: false,
        error: { type: 'invalid_url', message: 'Invalid playlist URL' }
      };
    }

    try {
      const installation = await this.ytDlpExecutor.checkInstallation();
      if (!installation.installed) {
        return {
          success: false,
          error: {
            type: 'yt_dlp_missing',
            message: 'yt-dlp is not installed or not accessible.'
          }
        };
      }

      this.logger.info('Fetching playlist preview', { url: request.url });
      const playlist = await this.ytDlpExecutor.fetchPlaylist(request.url);
      this.logger.info('Playlist preview fetched', {
        playlistId: playlist.id,
        returnedEntries: playlist.entries.length,
        totalEntries: playlist.totalEntries
      });

      return { success: true, data: playlist };
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to fetch playlist preview', normalizedError, { url: request.url });
      return {
        success: false,
        error: {
          type: this.errorCategorizer.categorize(normalizedError),
          message: normalizedError.message
        }
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
