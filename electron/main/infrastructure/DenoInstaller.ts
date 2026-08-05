/**
 * Installs the JavaScript runtime required by yt-dlp for full YouTube support.
 */

import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { app } from 'electron';
import { FileLogger } from './Logger';

interface DenoReleaseAsset {
  fileName: string;
  executableName: string;
}

export function getDenoReleaseAsset(
  platform: NodeJS.Platform,
  arch: string
): DenoReleaseAsset | null {
  const architecture = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : null;
  if (!architecture) return null;

  if (platform === 'win32') {
    return {
      fileName: `deno-${architecture}-pc-windows-msvc.zip`,
      executableName: 'deno.exe'
    };
  }

  if (platform === 'darwin') {
    return {
      fileName: `deno-${architecture}-apple-darwin.zip`,
      executableName: 'deno'
    };
  }

  if (platform === 'linux') {
    return {
      fileName: `deno-${architecture}-unknown-linux-gnu.zip`,
      executableName: 'deno'
    };
  }

  return null;
}

export class DenoInstaller {
  private readonly binDir: string;
  private readonly denoPath: string;
  private readonly downloadUrl: string | null;

  constructor(private readonly logger: FileLogger) {
    this.binDir = path.join(app.getPath('userData'), 'bin');
    const asset = getDenoReleaseAsset(os.platform(), os.arch());
    this.denoPath = path.join(this.binDir, asset?.executableName || 'deno');
    this.downloadUrl = asset
      ? `https://github.com/denoland/deno/releases/latest/download/${asset.fileName}`
      : null;

    fs.mkdirSync(this.binDir, { recursive: true });
  }

  isInstalled(): boolean {
    return fs.existsSync(this.denoPath);
  }

  getExecutablePath(): string {
    return this.denoPath;
  }

  async install(): Promise<{ success: boolean; error?: string }> {
    if (!this.downloadUrl) {
      return { success: false, error: `Deno is not available for ${os.platform()} ${os.arch()}` };
    }

    const suffix = `${process.pid}-${Date.now()}`;
    const temporaryDir = path.join(this.binDir, `deno-install-${suffix}`);
    const archivePath = path.join(temporaryDir, 'deno.zip');
    const temporaryExecutable = path.join(
      temporaryDir,
      os.platform() === 'win32' ? 'deno.exe' : 'deno'
    );

    try {
      fs.mkdirSync(temporaryDir, { recursive: true });
      this.logger.info('Downloading Deno runtime for yt-dlp...', { url: this.downloadUrl });
      await this.downloadFile(this.downloadUrl, archivePath);
      await this.extractArchive(archivePath, temporaryDir);

      if (os.platform() !== 'win32') {
        fs.chmodSync(temporaryExecutable, 0o755);
      }

      const version = await this.verifyExecutable(temporaryExecutable);
      fs.copyFileSync(temporaryExecutable, this.denoPath);

      if (os.platform() !== 'win32') {
        fs.chmodSync(this.denoPath, 0o755);
      }

      this.logger.info('Deno runtime installed successfully', {
        path: this.denoPath,
        version
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install Deno runtime', error as Error);
      return { success: false, error: message };
    } finally {
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  }

  private downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects while downloading Deno'));
        return;
      }

      const request = https.get(url, response => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          const redirect = response.headers.location;
          response.resume();
          if (!redirect) {
            reject(new Error('Deno download redirect did not include a destination'));
            return;
          }

          this.downloadFile(new URL(redirect, url).toString(), destination, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download Deno: HTTP ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(destination);
        response.pipe(file);
        file.on('finish', () => file.close(error => error ? reject(error) : resolve()));
        file.on('error', reject);
        response.on('error', reject);
      });

      request.on('error', reject);
    });
  }

  private extractArchive(archivePath: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('tar', ['-xf', archivePath, '-C', destination]);
      let errorOutput = '';

      child.stderr.on('data', data => {
        errorOutput += data.toString();
      });
      child.on('error', error => reject(new Error(`Unable to extract Deno: ${error.message}`)));
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Unable to extract Deno archive: ${errorOutput.trim() || `code ${code}`}`));
      });
    });
  }

  private verifyExecutable(executablePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, ['--version']);
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(output.split('\n')[0].trim());
      };

      child.stdout.on('data', data => {
        output += data.toString();
      });
      child.stderr.on('data', data => {
        errorOutput += data.toString();
      });
      child.on('error', error => finish(new Error(`Downloaded Deno could not start: ${error.message}`)));
      child.on('close', code => {
        if (code !== 0 || !output.trim()) {
          finish(new Error(`Downloaded Deno failed verification: ${errorOutput.trim() || `code ${code}`}`));
          return;
        }
        finish();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Downloaded Deno verification timed out'));
      }, 10000);
    });
  }
}
