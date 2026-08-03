import { ipcMain } from 'electron';
import { AppUpdateService } from '../infrastructure/AppUpdateService';
import { AppUpdateResponse, IPC_CHANNELS } from './contracts';

export class UpdateHandlers {
  constructor(private updateService: AppUpdateService) {}

  register(): void {
    ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, () => this.handleGetStatus());
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => this.handleCheck());
    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, () => this.handleDownload());
    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => this.handleInstall());
  }

  private handleGetStatus(): AppUpdateResponse {
    return { success: true, data: this.updateService.getStatus() };
  }

  private async handleCheck(): Promise<AppUpdateResponse> {
    const status = await this.updateService.checkForUpdates();
    return { success: status.state !== 'error', data: status };
  }

  private async handleDownload(): Promise<AppUpdateResponse> {
    const status = await this.updateService.downloadUpdate();
    return { success: status.state !== 'error', data: status };
  }

  private handleInstall(): AppUpdateResponse {
    const status = this.updateService.installUpdate();
    return { success: status.state !== 'error' && !status.error, data: status };
  }
}
