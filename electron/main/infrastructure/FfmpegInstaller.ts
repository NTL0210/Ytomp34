/**
 * FfmpegInstaller
 * Automatically downloads and installs ffmpeg if not present.
 *
 * The installer verifies that the downloaded binary actually runs, tries a
 * second download mirror when the primary fails, and can fall back to a system
 * ffmpeg on PATH.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import { spawn } from 'child_process';
import { app } from 'electron';
import { FileLogger } from './Logger';

const MAX_REDIRECTS = 6;
const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;

export interface FfmpegAvailability {
    available: boolean;
    /** Directory that should be passed to --ffmpeg-location. Undefined when ffmpeg is on PATH. */
    location?: string;
    version?: string;
    source?: 'bundled' | 'system' | 'downloaded';
    error?: string;
}

interface DownloadSource {
    url: string;
    /** Archive type. */
    type: 'zip' | 'tar.xz';
}

function getWindowsSources(): DownloadSource[] {
    return [
        { url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', type: 'zip' },
        {
            url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
            type: 'zip'
        }
    ];
}

function getLinuxSources(): DownloadSource[] {
    return [
        {
            url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
            type: 'tar.xz'
        },
        {
            url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
            type: 'tar.xz'
        }
    ];
}

export class FfmpegInstaller {
    private logger: FileLogger;
    private ffmpegPath: string;
    private ffprobePath: string;
    private binDir: string;
    private location: string | undefined;

    constructor(logger: FileLogger) {
        this.logger = logger;

        const appDataPath = app.getPath('userData');
        this.binDir = path.join(appDataPath, 'bin');

        const platform = os.platform();
        if (platform === 'win32') {
            this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');
            this.ffprobePath = path.join(this.binDir, 'ffprobe.exe');
        } else {
            this.ffmpegPath = path.join(this.binDir, 'ffmpeg');
            this.ffprobePath = path.join(this.binDir, 'ffprobe');
        }

        // Ensure bin directory exists
        if (!fs.existsSync(this.binDir)) {
            fs.mkdirSync(this.binDir, { recursive: true });
        }
    }

    /**
     * Check if the bundled ffmpeg files exist (does not prove they run).
     */
    isInstalled(): boolean {
        return fs.existsSync(this.ffmpegPath) && fs.existsSync(this.ffprobePath);
    }

    /**
     * Get ffmpeg directory path (for --ffmpeg-location)
     */
    getBinDirectory(): string {
        return this.binDir;
    }

    /**
     * Directory to pass to yt-dlp, or undefined when ffmpeg is on PATH.
     */
    getLocation(): string | undefined {
        return this.location;
    }

    /**
     * Run `ffmpeg -version` to make sure the binary is usable, not just present.
     */
    async isRunnable(binDir: string = this.binDir): Promise<boolean> {
        const executable = process.platform === 'win32'
            ? path.join(binDir, 'ffmpeg.exe')
            : path.join(binDir, 'ffmpeg');

        if (!fs.existsSync(executable)) {
            return false;
        }

        const result = await this.runCommand(executable, ['-version'], 15_000);
        return result.code === 0 && /ffmpeg version/i.test(result.stdout + result.stderr);
    }

    /**
     * Find a working ffmpeg and install one if necessary.
     */
    async ensureAvailable(): Promise<FfmpegAvailability> {
        if (this.isInstalled() && await this.isRunnable()) {
            this.location = this.binDir;
            return {
                available: true,
                location: this.binDir,
                source: 'bundled'
            };
        }

        const system = await this.detectSystemFfmpeg();
        if (system) {
            this.location = undefined;
            return {
                available: true,
                version: system,
                source: 'system'
            };
        }

        this.logger.info('ffmpeg is missing or broken, downloading a replacement...');
        const result = await this.install();

        if (result.success && await this.isRunnable()) {
            this.location = this.binDir;
            return {
                available: true,
                location: this.binDir,
                source: 'downloaded'
            };
        }

        this.location = undefined;
        return {
            available: false,
            error: result.error || 'ffmpeg could not be installed'
        };
    }

    /**
     * Download and install ffmpeg
     */
    async install(): Promise<{ success: boolean; error?: string }> {
        try {
            const platform = os.platform();

            if (platform === 'win32') {
                return await this.installWithSources(getWindowsSources());
            } else if (platform === 'darwin') {
                return await this.installMacOS();
            } else {
                return await this.installWithSources(getLinuxSources());
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to install ffmpeg', error as Error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Try each download source until one produces a runnable binary.
     */
    private async installWithSources(sources: DownloadSource[]): Promise<{ success: boolean; error?: string }> {
        let lastError = 'No ffmpeg download source is available';

        for (const source of sources) {
            try {
                this.logger.info('Downloading ffmpeg...', { url: source.url });
                await this.installFromSource(source);

                if (!await this.isRunnable()) {
                    throw new Error('Downloaded ffmpeg failed verification');
                }

                this.location = this.binDir;
                this.logger.info('ffmpeg installed successfully', { path: this.binDir });
                return { success: true };
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                this.logger.error('ffmpeg download source failed', error as Error, { url: source.url });
            }
        }

        return { success: false, error: lastError };
    }

    private async installFromSource(source: DownloadSource): Promise<void> {
        const suffix = `${process.pid}-${Date.now()}`;
        const temporaryDir = path.join(this.binDir, `ffmpeg-install-${suffix}`);
        const archiveName = source.type === 'zip' ? 'ffmpeg.zip' : 'ffmpeg.tar.xz';
        const archivePath = path.join(temporaryDir, archiveName);
        const extractDir = path.join(temporaryDir, 'extracted');

        try {
            fs.mkdirSync(extractDir, { recursive: true });
            await this.downloadFile(source.url, archivePath);

            if (source.type === 'zip') {
                await this.extractZip(archivePath, extractDir);
            } else {
                await this.extractTarXz(archivePath, extractDir);
            }

            const extractedFfmpeg = this.findFileRecursive(extractDir, this.binaryName('ffmpeg'));
            const extractedFfprobe = this.findFileRecursive(extractDir, this.binaryName('ffprobe'));

            if (!extractedFfmpeg || !extractedFfprobe) {
                throw new Error('The ffmpeg archive did not contain ffmpeg and ffprobe');
            }

            fs.copyFileSync(extractedFfmpeg, this.ffmpegPath);
            fs.copyFileSync(extractedFfprobe, this.ffprobePath);

            if (os.platform() !== 'win32') {
                fs.chmodSync(this.ffmpegPath, 0o755);
                fs.chmodSync(this.ffprobePath, 0o755);
            }
        } finally {
            try {
                fs.rmSync(temporaryDir, { recursive: true, force: true });
            } catch (error) {
                this.logger.error('Failed to clean up ffmpeg temporary files', error as Error, {
                    path: temporaryDir
                });
            }
        }
    }

    private binaryName(name: 'ffmpeg' | 'ffprobe'): string {
        return process.platform === 'win32' ? `${name}.exe` : name;
    }

    private extractZip(archivePath: string, destination: string): Promise<void> {
        if (os.platform() === 'win32') {
            return this.runCommand('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${destination}" -Force`
            ], 180_000).then(result => {
                if (result.code !== 0) {
                    throw new Error(`Failed to extract ffmpeg archive: ${result.stderr || `code ${result.code}`}`);
                }
            });
        }

        return this.runCommand('unzip', ['-o', archivePath, '-d', destination], 180_000)
            .then(result => {
                if (result.code !== 0) {
                    throw new Error(`Failed to extract ffmpeg archive: ${result.stderr || `code ${result.code}`}`);
                }
            });
    }

    private extractTarXz(archivePath: string, destination: string): Promise<void> {
        return this.runCommand('tar', ['-xJf', archivePath, '-C', destination], 180_000)
            .then(result => {
                if (result.code !== 0) {
                    throw new Error(`Failed to extract ffmpeg archive: ${result.stderr || `code ${result.code}`}`);
                }
            });
    }

    private findFileRecursive(root: string, fileName: string, depth = 5): string | null {
        if (depth < 0 || !fs.existsSync(root)) return null;

        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(root, entry.name);
            if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
                return fullPath;
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const found = this.findFileRecursive(path.join(root, entry.name), fileName, depth - 1);
            if (found) return found;
        }

        return null;
    }

    /**
     * macOS static builds are published as two separate zips.
     */
    private async installMacOS(): Promise<{ success: boolean; error?: string }> {
        const suffix = `${process.pid}-${Date.now()}`;
        const temporaryDir = path.join(this.binDir, `ffmpeg-install-${suffix}`);
        const ffmpegZip = path.join(temporaryDir, 'ffmpeg.zip');
        const ffprobeZip = path.join(temporaryDir, 'ffprobe.zip');
        const extractDir = path.join(temporaryDir, 'extracted');

        try {
            fs.mkdirSync(extractDir, { recursive: true });
            await this.downloadFile('https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip', ffmpegZip);
            await this.downloadFile('https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip', ffprobeZip);

            await this.extractZip(ffmpegZip, extractDir);
            await this.extractZip(ffprobeZip, extractDir);

            const extractedFfmpeg = this.findFileRecursive(extractDir, 'ffmpeg');
            const extractedFfprobe = this.findFileRecursive(extractDir, 'ffprobe');
            if (!extractedFfmpeg || !extractedFfprobe) {
                throw new Error('The ffmpeg archive did not contain ffmpeg and ffprobe');
            }

            fs.copyFileSync(extractedFfmpeg, this.ffmpegPath);
            fs.copyFileSync(extractedFfprobe, this.ffprobePath);
            fs.chmodSync(this.ffmpegPath, 0o755);
            fs.chmodSync(this.ffprobePath, 0o755);

            if (!await this.isRunnable()) {
                throw new Error('Downloaded ffmpeg failed verification');
            }

            this.location = this.binDir;
            this.logger.info('ffmpeg installed successfully', { path: this.binDir });
            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to install ffmpeg on macOS', error as Error);
            return { success: false, error: errorMessage };
        } finally {
            fs.rmSync(temporaryDir, { recursive: true, force: true });
        }
    }

    /**
     * Prefer a system ffmpeg when the bundled copy is unavailable.
     */
    private async detectSystemFfmpeg(): Promise<string | null> {
        const result = await this.runCommand('ffmpeg', ['-version'], 10_000);
        const output = result.stdout + result.stderr;
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/i);
        if (result.code === 0 && versionMatch) {
            return versionMatch[1];
        }
        return null;
    }

    private runCommand(
        command: string,
        args: string[],
        timeoutMs: number
    ): Promise<{ code: number | null; stdout: string; stderr: string }> {
        return new Promise(resolve => {
            let stdout = '';
            let stderr = '';
            let settled = false;

            const child = spawn(command, args, { windowsHide: true });

            const finish = (code: number | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve({ code, stdout, stderr });
            };

            const timeout = setTimeout(() => {
                child.kill('SIGKILL');
                finish(null);
            }, timeoutMs);

            child.stdout.on('data', data => {
                stdout += data.toString();
            });
            child.stderr.on('data', data => {
                stderr += data.toString();
            });
            child.on('error', error => {
                stderr += error.message;
                finish(null);
            });
            child.on('close', code => finish(code));
        });
    }

    /**
     * Download file from URL, following redirects and validating the payload.
     */
    private downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
        return new Promise((resolve, reject) => {
            if (redirectCount > MAX_REDIRECTS) {
                reject(new Error('Too many redirects while downloading ffmpeg'));
                return;
            }

            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                reject(new Error('Invalid ffmpeg download URL'));
                return;
            }

            const transport = parsed.protocol === 'https:' ? https : http;
            let settled = false;

            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                clearTimeout(overallTimeout);
                if (error) {
                    this.removeFileIfPresent(destination);
                    reject(error);
                } else {
                    resolve();
                }
            };

            const overallTimeout = setTimeout(() => {
                request.destroy();
                finish(new Error('ffmpeg download timed out'));
            }, 10 * 60_000);

            const request = transport.get(parsed, {
                headers: {
                    'User-Agent': 'Ytomp34',
                    'Accept': '*/*'
                }
            }, response => {
                const statusCode = response.statusCode ?? 0;

                if (statusCode >= 300 && statusCode < 400) {
                    const redirect = response.headers.location;
                    response.resume();
                    if (!redirect) {
                        finish(new Error('ffmpeg download redirect did not include a destination'));
                        return;
                    }
                    clearTimeout(overallTimeout);
                    settled = true;
                    this.downloadFile(new URL(redirect, parsed).toString(), destination, redirectCount + 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (statusCode !== 200) {
                    response.resume();
                    finish(new Error(`Failed to download ffmpeg: HTTP ${statusCode}`));
                    return;
                }

                const contentType = String(response.headers['content-type'] || '').toLowerCase();
                if (contentType.startsWith('text/html')) {
                    response.resume();
                    finish(new Error('ffmpeg download returned a web page instead of an archive'));
                    return;
                }

                const totalBytes = Number(response.headers['content-length'] || 0);
                let downloadedBytes = 0;
                const file = fs.createWriteStream(destination);

                response.on('data', chunk => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0 && downloadedBytes % (8 * 1024 * 1024) < chunk.length) {
                        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(0);
                        this.logger.info('ffmpeg download progress', { progress: `${percent}%` });
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(error => {
                        if (error) {
                            finish(error);
                            return;
                        }
                        if (totalBytes > 0 && downloadedBytes < totalBytes) {
                            finish(new Error(
                                `Incomplete ffmpeg download (${downloadedBytes} of ${totalBytes} bytes)`
                            ));
                            return;
                        }
                        finish();
                    });
                });

                file.on('error', finish);
                response.on('error', finish);
            });

            request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
                request.destroy();
                finish(new Error('ffmpeg download stalled'));
            });

            request.on('error', finish);
        });
    }

    private removeFileIfPresent(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            this.logger.error('Failed to remove temporary ffmpeg file', error as Error, {
                path: filePath
            });
        }
    }
}
