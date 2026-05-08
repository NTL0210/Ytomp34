import { app } from 'electron';
import { Settings, DownloadQueue } from '../domain/entities';
import { Theme } from '../domain/value-objects';
import { SettingsStore, Logger } from '../infrastructure';

/**
 * UpdateSettings request/response contracts
 */
export interface UpdateSettingsRequest {
  theme?: Theme;
  downloadDirectory?: string;
  concurrentLimit?: number;
}

export interface UpdateSettingsResponse {
  success: boolean;
  data?: Settings;
  error?: string;
}

/**
 * UpdateSettingsUseCase
 * Validates settings, updates store, applies theme immediately, handles invalid directory
 * Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 13.2, 13.3, 21.3, 21.5
 */
export class UpdateSettingsUseCase {
  constructor(
    private settingsStore: SettingsStore,
    private queue: DownloadQueue,
    private logger: Logger
  ) {}

  async execute(request: UpdateSettingsRequest): Promise<UpdateSettingsResponse> {
    try {
      // Load current settings
      const currentSettings = await this.settingsStore.load();

      // Create updated settings object
      const updatedSettings: Settings = {
        theme: request.theme !== undefined ? request.theme : currentSettings.theme,
        downloadDirectory:
          request.downloadDirectory !== undefined
            ? request.downloadDirectory
            : currentSettings.downloadDirectory,
        concurrentLimit:
          request.concurrentLimit !== undefined
            ? request.concurrentLimit
            : currentSettings.concurrentLimit
      };

      // Validate settings
      const validation = this.settingsStore.validate(updatedSettings);

      if (!validation.valid) {
        // Handle invalid download directory - fallback to system Downloads
        if (
          request.downloadDirectory !== undefined &&
          validation.errors.some(e => e.includes('directory'))
        ) {
          this.logger.error('Invalid download directory, falling back to system Downloads', undefined, {
            requestedDirectory: request.downloadDirectory,
            errors: validation.errors
          });

          // Fallback to system Downloads directory
          updatedSettings.downloadDirectory = app.getPath('downloads');

          // Re-validate with fallback
          const revalidation = this.settingsStore.validate(updatedSettings);
          if (!revalidation.valid) {
            return {
              success: false,
              error: `Settings validation failed: ${revalidation.errors.join(', ')}`
            };
          }

          // Save with fallback and return warning
          await this.settingsStore.save(updatedSettings);

          this.logger.info('Settings updated with fallback directory', {
            theme: updatedSettings.theme,
            downloadDirectory: updatedSettings.downloadDirectory,
            concurrentLimit: updatedSettings.concurrentLimit
          });

          return {
            success: true,
            data: updatedSettings,
            error: 'Warning: Invalid directory specified, using system Downloads folder'
          };
        }

        // Other validation errors
        return {
          success: false,
          error: `Settings validation failed: ${validation.errors.join(', ')}`
        };
      }

      // Save valid settings
      await this.settingsStore.save(updatedSettings);

      // Update queue's maxConcurrent if concurrentLimit changed
      if (request.concurrentLimit !== undefined && request.concurrentLimit !== currentSettings.concurrentLimit) {
        this.queue.maxConcurrent = updatedSettings.concurrentLimit;
        this.logger.info('Queue concurrent limit updated', {
          oldLimit: currentSettings.concurrentLimit,
          newLimit: updatedSettings.concurrentLimit
        });
      }

      this.logger.info('Settings updated', {
        theme: updatedSettings.theme,
        downloadDirectory: updatedSettings.downloadDirectory,
        concurrentLimit: updatedSettings.concurrentLimit
      });

      // Note: Theme changes are applied immediately by the renderer process
      // Concurrent limit changes: running downloads continue, new downloads respect new limit

      return {
        success: true,
        data: updatedSettings
      };
    } catch (error) {
      this.logger.error('Failed to update settings', error as Error);

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}
