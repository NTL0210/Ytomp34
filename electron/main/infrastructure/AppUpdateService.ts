import { app, autoUpdater as squirrelAutoUpdater, net } from 'electron';
import type { AppUpdater, UpdateDownloadedEvent } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

const UPDATE_REPOSITORY = 'NTL0210/Ytomp34';
const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const RELEASE_URL_PREFIX = `https://github.com/${UPDATE_REPOSITORY}/releases/`;
const UPDATE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_RELEASE_NOTES_LENGTH = 2_000;

export type AppUpdateState =
  | 'idle'
  | 'development'
  | 'unsupported'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateStatus {
  state: AppUpdateState;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  releaseUrl?: string;
  error?: string;
}

interface GitHubRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  html_url: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseVersion(value: string): ParsedVersion | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateVersion = parseVersion(candidate);
  const currentVersion = parseVersion(current);

  if (!candidateVersion || !currentVersion) {
    return false;
  }

  const candidateParts = [candidateVersion.major, candidateVersion.minor, candidateVersion.patch];
  const currentParts = [currentVersion.major, currentVersion.minor, currentVersion.patch];

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index];
    }
  }

  return !candidateVersion.prerelease && Boolean(currentVersion.prerelease);
}

export class AppUpdateService {
  private status: AppUpdateStatus;
  private squirrelListenersRegistered = false;
  private nsisListenersRegistered = false;
  private nsisAutoUpdater: AppUpdater | null = null;

  constructor(
    private logger: Logger,
    private onStatusChange: (status: AppUpdateStatus) => void,
    private canInstallUpdate: () => boolean = () => true
  ) {
    this.status = {
      state: app.isPackaged ? 'idle' : 'development',
      currentVersion: app.getVersion()
    };
  }

  getStatus(): AppUpdateStatus {
    return { ...this.status };
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (!app.isPackaged) {
      return this.updateStatus({ state: 'development' });
    }

    if (process.platform !== 'win32') {
      return this.updateStatus({
        state: 'unsupported',
        error: 'Automatic updates are currently available for Windows builds only.'
      });
    }

    if (!this.isSquirrelInstalled() && !this.isNsisInstalled()) {
      return this.updateStatus({
        state: 'unsupported',
        error: 'Install Ytomp34 with Setup.exe to enable automatic updates.'
      });
    }

    this.updateStatus({ state: 'checking', error: undefined });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT_MS);

    try {
      const response = await net.fetch(RELEASES_API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Ytomp34/${app.getVersion()}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: controller.signal
      });

      if (response.status === 404) {
        return this.updateStatus({ state: 'up-to-date' });
      }

      if (!response.ok) {
        throw new Error(`Update server returned HTTP ${response.status}`);
      }

      const responseText = await response.text();
      if (responseText.length > MAX_RESPONSE_BYTES) {
        throw new Error('Update response was unexpectedly large');
      }

      const release = JSON.parse(responseText) as Partial<GitHubRelease>;
      if (!this.isValidRelease(release)) {
        throw new Error('Update server returned invalid release metadata');
      }

      if (release.draft || release.prerelease || !isNewerVersion(release.tag_name, app.getVersion())) {
        return this.updateStatus({
          state: 'up-to-date',
          latestVersion: release.tag_name.replace(/^v/, '')
        });
      }

      return this.updateStatus({
        state: 'available',
        latestVersion: release.tag_name.replace(/^v/, ''),
        releaseName: release.name?.trim() || undefined,
        releaseNotes: release.body?.trim().slice(0, MAX_RELEASE_NOTES_LENGTH) || undefined,
        publishedAt: release.published_at || undefined,
        releaseUrl: release.html_url,
        error: undefined
      });
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'Update check timed out. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Unable to check for updates.';

      this.logger.error('Failed to check for application updates', error as Error);
      return this.updateStatus({ state: 'error', error: message });
    } finally {
      clearTimeout(timeout);
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!app.isPackaged || process.platform !== 'win32') {
      return this.updateStatus({
        state: app.isPackaged ? 'unsupported' : 'development',
        error: app.isPackaged ? 'Automatic updates are currently available for Windows builds only.' : undefined
      });
    }

    if (this.status.state !== 'available') {
      return this.updateStatus({
        state: 'error',
        error: 'Check for an available update before downloading.'
      });
    }

    try {
      this.updateStatus({ state: 'downloading', error: undefined });

      if (this.isSquirrelInstalled()) {
        this.registerSquirrelUpdaterListeners();
        const feedUrl = `https://update.electronjs.org/${UPDATE_REPOSITORY}/${process.platform}-${process.arch}/${app.getVersion()}`;
        squirrelAutoUpdater.setFeedURL({ url: feedUrl });
        await squirrelAutoUpdater.checkForUpdates();
      } else {
        const updater = await this.getNsisAutoUpdater();
        this.registerNsisUpdaterListeners(updater);
        updater.autoDownload = true;
        await updater.checkForUpdates();
      }

      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to download the update.';
      this.logger.error('Failed to start application update download', error as Error);
      return this.updateStatus({ state: 'error', error: message });
    }
  }

  installUpdate(): AppUpdateStatus {
    if (this.status.state !== 'downloaded') {
      return this.updateStatus({
        state: 'error',
        error: 'The update must finish downloading before it can be installed.'
      });
    }

    if (!this.canInstallUpdate()) {
      return this.updateStatus({
        state: 'downloaded',
        error: 'Finish or cancel active downloads before restarting to install the update.'
      });
    }

    const useSquirrel = this.isSquirrelInstalled();
    const nsisUpdater = useSquirrel ? null : this.nsisAutoUpdater;
    if (!useSquirrel && !nsisUpdater) {
      return this.updateStatus({
        state: 'error',
        error: 'The NSIS update service is not ready. Download the update again.'
      });
    }

    this.logger.info('Installing downloaded application update');
    this.updateStatus({ state: 'downloaded', error: undefined });
    setImmediate(() => {
      if (useSquirrel) {
        squirrelAutoUpdater.quitAndInstall();
      } else {
        nsisUpdater!.quitAndInstall(false, true);
      }
    });
    return this.getStatus();
  }

  private registerSquirrelUpdaterListeners(): void {
    if (this.squirrelListenersRegistered) {
      return;
    }

    this.squirrelListenersRegistered = true;

    squirrelAutoUpdater.on('update-available', () => {
      this.updateStatus({ state: 'downloading', error: undefined });
    });

    squirrelAutoUpdater.on('update-not-available', () => {
      this.updateStatus({
        state: 'error',
        error: 'The release does not contain a compatible Windows update package yet.'
      });
    });

    squirrelAutoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
      this.updateStatus({
        state: 'downloaded',
        releaseName: releaseName || this.status.releaseName,
        releaseNotes: typeof releaseNotes === 'string'
          ? releaseNotes.slice(0, MAX_RELEASE_NOTES_LENGTH)
          : this.status.releaseNotes,
        error: undefined
      });
    });

    squirrelAutoUpdater.on('error', (error) => {
      this.logger.error('Application auto-updater error', error);
      this.updateStatus({ state: 'error', error: error.message });
    });
  }

  private registerNsisUpdaterListeners(updater: AppUpdater): void {
    if (this.nsisListenersRegistered) {
      return;
    }

    this.nsisListenersRegistered = true;

    updater.on('update-available', () => {
      this.updateStatus({ state: 'downloading', error: undefined });
    });

    updater.on('update-not-available', () => {
      this.updateStatus({
        state: 'error',
        error: 'The release does not contain a compatible Windows update package yet.'
      });
    });

    updater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
      this.updateStatus({
        state: 'downloaded',
        releaseName: info.releaseName || this.status.releaseName,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes.slice(0, MAX_RELEASE_NOTES_LENGTH)
          : this.status.releaseNotes,
        error: undefined
      });
    });

    updater.on('error', (error: Error) => {
      this.logger.error('NSIS application auto-updater error', error);
      this.updateStatus({ state: 'error', error: error.message });
    });
  }

  private isValidRelease(release: Partial<GitHubRelease>): release is GitHubRelease {
    return typeof release.tag_name === 'string'
      && parseVersion(release.tag_name) !== null
      && typeof release.html_url === 'string'
      && release.html_url.startsWith(RELEASE_URL_PREFIX);
  }

  private isSquirrelInstalled(): boolean {
    const updateExecutable = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    return fs.existsSync(updateExecutable);
  }

  private isNsisInstalled(): boolean {
    return fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
  }

  private async getNsisAutoUpdater(): Promise<AppUpdater> {
    if (!this.nsisAutoUpdater) {
      // Load lazily so a transition release can still support existing
      // Squirrel installations while new installs use NSIS.
      const updaterModule = await import('electron-updater');
      this.nsisAutoUpdater = updaterModule.autoUpdater;
    }

    return this.nsisAutoUpdater;
  }

  private updateStatus(changes: Partial<AppUpdateStatus>): AppUpdateStatus {
    this.status = {
      ...this.status,
      ...changes,
      currentVersion: app.getVersion()
    };
    const snapshot = this.getStatus();
    this.onStatusChange(snapshot);
    return snapshot;
  }
}
