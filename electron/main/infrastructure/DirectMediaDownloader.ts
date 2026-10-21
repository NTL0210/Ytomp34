/**
 * DirectMediaDownloader
 *
 * A small, dependency-free HTTP downloader used as a last-resort fallback when
 * yt-dlp cannot be started (missing/corrupted binary) and the URL points
 * directly at a media file. It supports redirects, resuming, idle timeouts and
 * cancellation.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { ProgressData } from './ProgressParser';

const MAX_REDIRECTS = 8;
const IDLE_TIMEOUT_MS = 60_000;

export interface DirectMediaDownloadOptions {
    onProgress: (progress: ProgressData) => void;
    signal?: AbortSignal;
}

export interface DirectMediaDownloadResult {
    filePath: string;
    bytesWritten: number;
}

function formatBytes(bytesPerSecond: number): string {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
    const units = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'];
    let value = bytesPerSecond;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatEta(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (value: number) => value.toString().padStart(2, '0');
    return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.message === 'Download cancelled');
}

/**
 * Download a direct media URL into outputPath.
 *
 * A `.part` file is used so interrupted downloads resume on the next attempt.
 * The partial file is promoted to outputPath only after a complete transfer.
 */
export function downloadDirectMedia(
    url: string,
    outputPath: string,
    options: DirectMediaDownloadOptions
): Promise<DirectMediaDownloadResult> {
    const partPath = `${outputPath}.part`;

    return new Promise((resolve, reject) => {
        let settled = false;
        let request: http.ClientRequest | null = null;
        let fileStream: fs.WriteStream | null = null;
        let bytesReceived = 0;
        let totalBytes = 0;
        let lastSampleTime = Date.now();
        let lastSampleBytes = 0;
        let smoothedSpeed = 0;

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;

            if (options.signal) {
                options.signal.removeEventListener('abort', abort);
            }

            if (error) {
                fileStream?.destroy();
                request?.destroy();
                reject(error);
            } else {
                resolve({ filePath: outputPath, bytesWritten: bytesReceived });
            }
        };

        const abort = () => {
            finish(Object.assign(new Error('Download cancelled'), { name: 'AbortError' }));
        };

        if (options.signal?.aborted) {
            finish(Object.assign(new Error('Download cancelled'), { name: 'AbortError' }));
            return;
        }
        options.signal?.addEventListener('abort', abort, { once: true });

        const startRequest = (currentUrl: string, redirectCount: number) => {
            if (redirectCount > MAX_REDIRECTS) {
                finish(new Error('Too many redirects while downloading the media file'));
                return;
            }

            let parsed: URL;
            try {
                parsed = new URL(currentUrl);
            } catch {
                finish(new Error('Invalid media URL'));
                return;
            }

            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                finish(new Error('Only HTTP and HTTPS media URLs are supported'));
                return;
            }

            const existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
            const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
            };
            if (existingBytes > 0) {
                headers.Range = `bytes=${existingBytes}-`;
            }

            const transport = parsed.protocol === 'https:' ? https : http;
            request = transport.get(parsed, { headers }, response => {
                const statusCode = response.statusCode ?? 0;

                if (statusCode >= 300 && statusCode < 400) {
                    const location = response.headers.location;
                    response.resume();
                    if (!location) {
                        finish(new Error('Download redirect did not include a destination'));
                        return;
                    }
                    startRequest(new URL(location, parsed).toString(), redirectCount + 1);
                    return;
                }

                if (statusCode !== 200 && statusCode !== 206) {
                    response.resume();
                    finish(new Error(`Media download failed: HTTP ${statusCode}`));
                    return;
                }

                const contentType = String(response.headers['content-type'] || '').toLowerCase();
                if (contentType.startsWith('text/html')) {
                    response.resume();
                    finish(new Error('The URL returned a web page instead of a media file'));
                    return;
                }

                const isResuming = statusCode === 206 && existingBytes > 0;
                bytesReceived = isResuming ? existingBytes : 0;

                const contentLength = Number(response.headers['content-length'] || 0);
                totalBytes = isResuming && contentLength > 0
                    ? existingBytes + contentLength
                    : contentLength;

                fileStream = fs.createWriteStream(partPath, { flags: isResuming ? 'a' : 'w' });

                fileStream.on('error', error => finish(error));

                response.on('data', (chunk: Buffer) => {
                    bytesReceived += chunk.length;

                    const now = Date.now();
                    const elapsed = (now - lastSampleTime) / 1000;
                    if (elapsed >= 0.5) {
                        const instantaneous = (bytesReceived - lastSampleBytes) / elapsed;
                        smoothedSpeed = smoothedSpeed > 0
                            ? smoothedSpeed * 0.7 + instantaneous * 0.3
                            : instantaneous;
                        lastSampleTime = now;
                        lastSampleBytes = bytesReceived;

                        const eta = totalBytes > 0 && smoothedSpeed > 0
                            ? (totalBytes - bytesReceived) / smoothedSpeed
                            : -1;

                        options.onProgress({
                            percentage: totalBytes > 0
                                ? Math.min(100, (bytesReceived / totalBytes) * 100)
                                : 0,
                            speed: formatBytes(smoothedSpeed),
                            eta: formatEta(eta)
                        });
                    }
                });

                response.on('aborted', () => finish(new Error('Media connection was closed unexpectedly')));
                response.on('error', error => finish(error));

                response.on('end', () => {
                    if (!fileStream) return;
                    fileStream.end(() => {
                        if (totalBytes > 0 && bytesReceived < totalBytes) {
                            finish(new Error(
                                `Incomplete media download (${bytesReceived} of ${totalBytes} bytes). It will resume on retry.`
                            ));
                            return;
                        }

                        try {
                            fs.renameSync(partPath, outputPath);
                        } catch (error) {
                            finish(error as Error);
                            return;
                        }

                        options.onProgress({
                            percentage: 100,
                            speed: 'Complete',
                            eta: '00:00'
                        });
                        finish();
                    });
                });

                response.pipe(fileStream);
            });

            request.setTimeout(IDLE_TIMEOUT_MS, () => {
                request?.destroy(new Error('Media download timed out'));
            });

            request.on('error', error => {
                if (isAbortError(error)) return;
                finish(error);
            });
        };

        try {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            startRequest(url, 0);
        } catch (error) {
            finish(error as Error);
        }
    });
}
