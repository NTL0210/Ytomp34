/**
 * Settings IPC Handlers
 * Handles settings-related IPC communication
 * Validates: Requirements 11.1, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import { UpdateSettingsUseCase } from '../application';
import { SettingsStore, Logger } from '../infrastructure';
import * as fs from 'fs';
import {
  IPC_CHANNELS,
  GetSettingsRequest,
  GetSettingsResponse,
  UpdateSettingsRequest,
  UpdateSettingsResponse,
  SelectFolderRequest,
  SelectFolderResponse
} from './contracts';

export class SettingsHandlers {
  constructor(
    private updateSettingsUseCase: UpdateSettingsUseCase,
    private settingsStore: SettingsStore,
    private logger: Logger
  ) {}

  /**
   * Register all settings-related IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SETTINGS_GET,
      this.handleGetSettings.bind(this)
    );

    ipcMain.handle(
      IPC_CHANNELS.SETTINGS_UPDATE,
      this.handleUpdateSettings.bind(this)
    );

    ipcMain.handle(
      IPC_CHANNELS.SETTINGS_SELECT_FOLDER,
      this.handleSelectFolder.bind(this)
    );

    this.logger.info('Settings IPC handlers registered');
  }

  /**
   * Handle settings:get IPC call
   */
  private async handleGetSettings(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<GetSettingsResponse> {
    try {
      this.logger.info('Getting settings');

      const settings = await this.settingsStore.load();

      return {
        success: true,
        data: settings
      };
    } catch (error) {
      this.logger.error('Error handling get settings', error as Error);

      return {
        success: false
      };
    }
  }

  /**
   * Handle settings:update IPC call
   */
  private async handleUpdateSettings(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<UpdateSettingsResponse> {
    try {
      // Validate request structure
      if (!this.isValidUpdateSettingsRequest(request)) {
        this.logger.error('Invalid update settings request', undefined, { request });
        return {
          success: false,
          error: 'Invalid request: invalid settings parameters'
        };
      }

      this.logger.info('Updating settings', { request });

      const response = await this.updateSettingsUseCase.execute(request);

      return response;
    } catch (error) {
      this.logger.error('Error handling update settings', error as Error);

      return {
        success: false,
        error: (error as Error).message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Handle settings:select-folder IPC call
   * Opens native folder dialog and verifies write permissions
   */
  private async handleSelectFolder(
    event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<SelectFolderResponse> {
    try {
      this.logger.info('Opening folder selection dialog');

      // Open native folder dialog
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Download Directory'
      });

      // Check if user cancelled
      if (result.canceled || result.filePaths.length === 0) {
        this.logger.info('Folder selection cancelled');
        return {
          success: true,
          cancelled: true
        };
      }

      const selectedPath = result.filePaths[0];

      // Verify write permissions
      try {
        fs.accessSync(selectedPath, fs.constants.W_OK);
        this.logger.info('Folder selected with write permissions', { path: selectedPath });

        return {
          success: true,
          path: selectedPath,
          cancelled: false
        };
      } catch (error) {
        this.logger.error('Selected folder is not writable', error as Error, { path: selectedPath });

        return {
          success: false,
          cancelled: false
        };
      }
    } catch (error) {
      this.logger.error('Error handling select folder', error as Error);

      return {
        success: false,
        cancelled: false
      };
    }
  }

  /**
   * Validate UpdateSettingsRequest structure
   */
  private isValidUpdateSettingsRequest(request: unknown): request is UpdateSettingsRequest {
    if (typeof request !== 'object' || request === null) {
      return false;
    }

    const req = request as UpdateSettingsRequest;

    // At least one field must be present
    if (!('theme' in req) && !('downloadDirectory' in req) && !('concurrentLimit' in req)) {
      return false;
    }

    // Validate theme if present
    if ('theme' in req && req.theme !== undefined) {
      if (req.theme !== 'light' && req.theme !== 'dark') {
        return false;
      }
    }

    // Validate downloadDirectory if present
    if ('downloadDirectory' in req && req.downloadDirectory !== undefined) {
      if (typeof req.downloadDirectory !== 'string') {
        return false;
      }
    }

    // Validate concurrentLimit if present
    if ('concurrentLimit' in req && req.concurrentLimit !== undefined) {
      if (typeof req.concurrentLimit !== 'number' || req.concurrentLimit < 1 || req.concurrentLimit > 10) {
        return false;
      }
    }

    return true;
  }
}
