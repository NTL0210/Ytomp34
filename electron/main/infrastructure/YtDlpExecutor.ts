import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { PlaylistInfo, Video } from '../domain/entities';
import { Format, Quality } from '../domain/value-objects';
import { ProgressData, ProgressParserImpl } from './ProgressParser';
import { downloadDirectMedia } from './DirectMediaDownloader';
import {
    ExtractionStrategy,
    buildAudioDownloadPlan,
    buildAudioFormatSelector,
    buildExtractionStrategies,
    buildPlayerClientArgs,
    buildVideoFormatSelector,
    getDirectMediaExtension,
    isBotCheckError,
    isCookieAccessError,
    isDirectMediaUrl,
    isFfmpegError,
    isToolMissingError,
    isYouTubeUrl,
    replaceOutputExtension
} from './ExtractionStrategies';

export { buildAudioFormatSelector };

export interface YtDlpFormat {
    format_id?: string;
    ext?: string;
    vcodec?: string;
    acodec?: string;
    height?: number;
    tbr?: number;
    abr?: number;
    format_note?: string;
}

interface YtDlpMetadata {
    id?: string;
    display_id?: string;
    webpage_url?: string;
    title?: string;
    duration?: number;
    thumbnail?: string;
    formats?: YtDlpFormat[];
}

interface YtDlpPlaylistEntryMetadata {
    id?: string;
    url?: string;
    webpage_url?: string;
    original_url?: string;
    title?: string;
    duration?: number;
    thumbnail?: string;
    extractor?: string;
    extractor_key?: string;
    ie_key?: string;
}

interface YtDlpPlaylistMetadata {
    id?: string;
    title?: string;
    playlist_count?: number;
    n_entries?: number;
    entries?: Array<YtDlpPlaylistEntryMetadata | null>;
}

// Increased limit for playlists; keep reasonable to avoid memory/performance issues
export const MAX_PLAYLIST_ITEMS = 500;

/**
 * Cookie configuration for YouTube anti-bot measures.
 *
 * Cookies are optional. Forcing browser cookies on every request breaks
 * downloads on machines where the browser cookie store cannot be decrypted
 * (Chrome/Edge DPAPI app-bound encryption), so the default is no cookies and
 * the executor degrades gracefully when a browser cannot be read.
 */
export interface CookieConfig {
    /** Path to cookies.txt file (Netscape format) */
    cookiesFile?: string;
    /** Browser to extract cookies from: 'chrome', 'firefox', 'edge', 'safari', 'opera', 'brave', 'vivaldi' */
    cookiesFromBrowser?: string;
    /** Browser profile name (optional) */
    browserProfile?: string;
    /** Fallback browsers to try if primary fails (e.g., DPAPI error on Windows) */
    fallbackBrowsers?: string[];
}

const DEFAULT_COOKIE_CONFIG: CookieConfig = {
    fallbackBrowsers: []
};

/**
 * Set cookie configuration for yt-dlp.
 * Call this before making YouTube requests.
 */
export function setCookieConfig(config: CookieConfig): void {
    DEFAULT_COOKIE_CONFIG.cookiesFile = config.cookiesFile;
    DEFAULT_COOKIE_CONFIG.cookiesFromBrowser = config.cookiesFromBrowser;
    DEFAULT_COOKIE_CONFIG.browserProfile = config.browserProfile;
    DEFAULT_COOKIE_CONFIG.fallbackBrowsers = config.fallbackBrowsers ?? [];
}

/**
 * DPAPI error indicator - failed to decrypt Chrome cookies on Windows
 */
const DPAPI_ERROR_PATTERN = /DPAPI|Failed to decrypt|chrome.*cookie/i;

function formatBrowserArgument(browser: string): string {
    if (browser.includes(':') || !DEFAULT_COOKIE_CONFIG.browserProfile) {
        return browser;
    }
    return `${browser}:${DEFAULT_COOKIE_CONFIG.browserProfile}`;
}

/**
 * Get cookie args for yt-dlp command.
 */
export function buildCookieArgs(): string[] {
    if (DEFAULT_COOKIE_CONFIG.cookiesFile) {
        return ['--cookies', DEFAULT_COOKIE_CONFIG.cookiesFile];
    }
    if (DEFAULT_COOKIE_CONFIG.cookiesFromBrowser) {
        return ['--cookies-from-browser', formatBrowserArgument(DEFAULT_COOKIE_CONFIG.cookiesFromBrowser)];
    }
    return [];
}

/**
 * Check if error is DPAPI related (Chrome cookie decryption failure on Windows)
 */
export function isDpapiError(error: Error | string): boolean {
    const message = typeof error === 'string' ? error : error.message;
    return DPAPI_ERROR_PATTERN.test(message);
}

/**
 * Get fallback cookie args for a specific browser
 */
export function buildFallbackCookieArgs(browser: string): string[] {
    return ['--cookies-from-browser', formatBrowserArgument(browser)];
}

/**
 * Convert HTTP thumbnail URLs to HTTPS to avoid mixed content issues in Electron
 * YouTube thumbnails support HTTPS but yt-dlp sometimes returns HTTP URLs
 */
export function ensureHttpsThumbnail(url: string): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:') {
            parsed.protocol = 'https:';
            return parsed.toString();
        }
        return url;
    } catch {
        return url; // Return as-is if not a valid URL
    }
}

export function buildJavaScriptRuntimeArgs(runtimePath: string | null): string[] {
    if (!runtimePath) return [];

    return [
        '--js-runtimes',
        `deno:${runtimePath}`,
        '--remote-components',
        'ejs:github'
    ];
}

export function extractAvailableFormats(formats: YtDlpFormat[]): Format[] {
    const videoHeights = new Set<number>();
    const audioFormats: YtDlpFormat[] = [];

    for (const format of formats) {
        if (format.vcodec && format.vcodec !== 'none' && format.height) {
            videoHeights.add(format.height);
        }

        if (
            format.acodec &&
            format.acodec !== 'none' &&
            (!format.vcodec || format.vcodec === 'none')
        ) {
            audioFormats.push(format);
        }
    }

    const result: Format[] = [];
    const sortedHeights = Array.from(videoHeights).sort((a, b) => b - a);

    if (sortedHeights.length > 0) {
        const qualities: Quality[] = [
            { label: 'Best Quality', value: 'best', resolution: 'best' },
            ...sortedHeights.map(height => ({
                label: `${height}p`,
                value: `${height}p`,
                resolution: `${height}p`
            }))
        ];
        result.push({ type: 'mp4', qualities });
    }

    const audioQualities: Quality[] = audioFormats
        .filter(format => Boolean(format.abr))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))
        .slice(0, 5)
        .map(format => ({
            label: `${Math.round(format.abr ?? 0)}kbps`,
            value: format.format_id ?? 'best',
            bitrate: format.abr
        }));

    if (audioQualities.length > 0) {
        result.push({
            type: 'mp3',
            qualities: [
                { label: 'Best Quality', value: 'best' },
                ...audioQualities
            ]
        });
    }

    return result;
}

/** Keep app behavior independent from user-level yt-dlp configuration. */
export function buildNetworkIsolationArgs(forceIpv4 = false): string[] {
    return forceIpv4
        ? ['--ignore-config', '--force-ipv4']
        : ['--ignore-config'];
}

/** Identify DNS failures that are worth retrying over IPv4. */
export function isDnsResolutionError(error: Error | string): boolean {
    const message = typeof error === 'string' ? error : error.message;
    return /could not resolve host|temporary failure in name resolution|getaddrinfo failed|name or service not known|enotfound/i.test(message);
}

function getPlaylistEntryUrl(entry: YtDlpPlaylistEntryMetadata): string | null {
    const candidates = [entry.webpage_url, entry.original_url, entry.url];

    for (const candidate of candidates) {
        if (!candidate) continue;

        try {
            const parsed = new URL(candidate);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return candidate;
            }
        } catch {
            // Flat YouTube entries can contain only a video id; handle below.
        }
    }

    const extractor = `${entry.extractor || ''} ${entry.extractor_key || ''} ${entry.ie_key || ''}`;
    if (entry.id && /youtube/i.test(extractor)) {
        return `https://www.youtube.com/watch?v=${encodeURIComponent(entry.id)}`;
    }

    return null;
}

export function parsePlaylistMetadata(
    rawMetadata: unknown,
    sourceUrl: string,
    limit = MAX_PLAYLIST_ITEMS
): PlaylistInfo {
    if (typeof rawMetadata !== 'object' || rawMetadata === null) {
        throw new Error('yt-dlp returned invalid playlist metadata');
    }

    const metadata = rawMetadata as YtDlpPlaylistMetadata;
    if (!Array.isArray(metadata.entries)) {
        throw new Error('The URL does not contain a playlist');
    }

    const parsedEntries = metadata.entries.flatMap(entry => {
        if (!entry) return [];
        const url = getPlaylistEntryUrl(entry);
        if (!url) return [];

        return [{
            id: entry.id || url,
            url,
            title: entry.title || 'Untitled video',
            duration: typeof entry.duration === 'number' ? entry.duration : 0,
            thumbnailUrl: ensureHttpsThumbnail(entry.thumbnail || '')
        }];
    });
    const seenUrls = new Set<string>();
    const uniqueEntries = parsedEntries.filter(entry => {
        if (seenUrls.has(entry.url)) return false;
        seenUrls.add(entry.url);
        return true;
    });
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), MAX_PLAYLIST_ITEMS));
    const entries = uniqueEntries.slice(0, safeLimit);
    const reportedTotal = metadata.playlist_count || metadata.n_entries || metadata.entries.length;
    const totalEntries = Math.max(reportedTotal, uniqueEntries.length);

    if (entries.length === 0) {
        throw new Error('The playlist does not contain any downloadable videos');
    }

    return {
        id: metadata.id || sourceUrl,
        title: metadata.title || 'Untitled playlist',
        entries,
        totalEntries,
        truncated: totalEntries > entries.length || uniqueEntries.length > entries.length,
        truncatedWarning: totalEntries > MAX_PLAYLIST_ITEMS
            ? `Playlist truncated to ${MAX_PLAYLIST_ITEMS} items. Total videos: ${totalEntries}.`
            : undefined
    };
}

interface CaptureResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

/**
 * YtDlpExecutor interface
 * Provides interaction with yt-dlp command-line tool
 */
export interface YtDlpExecutor {
    /**
     * Check if yt-dlp is installed and accessible
     */
    checkInstallation(): Promise<{ installed: boolean; version?: string }>;

    /**
     * Fetch video metadata using --dump-json
     */
    fetchMetadata(url: string): Promise<Video>;

    /**
     * Fetch a flat playlist preview without downloading media.
     */
    fetchPlaylist(url: string): Promise<PlaylistInfo>;

    /**
     * Start download process
     * Returns process ID for control operations
     */
    startDownload(
        url: string,
        format: string,
        quality: string,
        outputPath: string,
        onProgress: (progress: ProgressData) => void,
        onError: (error: string) => void,
        onComplete: () => void,
        onProcessId?: (pid: number) => void,
        onOutputPath?: (outputPath: string) => void
    ): Promise<number>;

    /**
     * Pause download process (SIGSTOP)
     */
    pauseProcess(pid: number): Promise<void>;

    /**
     * Resume download process (SIGCONT)
     */
    resumeProcess(pid: number): Promise<void>;

    /**
     * Cancel download process (SIGTERM then SIGKILL)
     */
    cancelProcess(pid: number): Promise<void>;
}

/**
 * YtDlpExecutor implementation
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 5.1-5.7, 8.1, 8.3, 9.1, 9.2, 22.1, 22.2
 */
export class YtDlpExecutorImpl implements YtDlpExecutor {
    private processes: Map<number, ChildProcess> = new Map();
    private directDownloads: Map<number, AbortController> = new Map();
    private cancelledPids: Set<number> = new Set();
    private nextDirectDownloadId = -1;
    private forceIpv4Hosts = new Set<string>();
    private ytDlpCommand: string = 'yt-dlp'; // Default to system yt-dlp
    private commandPrefixArgs: string[] = [];
    private ffmpegLocation: string | null = null; // ffmpeg directory path
    private ffmpegAvailable = false;
    private javaScriptRuntimePath: string | null = null;
    private preferredStrategyId: string | null = null;
    private disabledCookieBrowsers = new Set<string>();
    private repairHandler: (() => Promise<boolean>) | null = null;
    private repairPromise: Promise<boolean> | null = null;
    private lastRepairAttempt = 0;

    private debug(...args: unknown[]): void {
        if (!app.isPackaged) {
            console.log(...args);
        }
    }

    /**
     * Set custom yt-dlp executable path
     */
    setExecutablePath(path: string): void {
        this.ytDlpCommand = path;
        this.commandPrefixArgs = [];
    }

    /**
     * Set an executable plus prefix arguments (e.g. `python -m yt_dlp`).
     */
    setCommand(command: string, prefixArgs: string[] = []): void {
        this.ytDlpCommand = command;
        this.commandPrefixArgs = [...prefixArgs];
    }

    /**
     * Set ffmpeg location directory. Passing null means ffmpeg is available on
     * PATH and no explicit --ffmpeg-location argument is needed.
     */
    setFfmpegLocation(path: string | null): void {
        this.ffmpegLocation = path;
        this.ffmpegAvailable = true;
    }

    /**
     * Explicitly mark ffmpeg as available or unavailable. When unavailable the
     * executor requests pre-merged video formats and keeps audio untranscoded.
     */
    setFfmpegAvailable(available: boolean): void {
        this.ffmpegAvailable = available;
    }

    setJavaScriptRuntimePath(path: string): void {
        this.javaScriptRuntimePath = path;
    }

    /**
     * Register a callback that attempts to reinstall/repair yt-dlp after a
     * missing-binary failure. Returns true when a working binary is available.
     */
    setRepairHandler(handler: () => Promise<boolean>): void {
        this.repairHandler = handler;
    }

    async checkInstallation(): Promise<{ installed: boolean; version?: string }> {
        const result = await this.runCapture([...this.commandPrefixArgs, '--version'], 10_000);

        if (result.code === 0 && result.stdout.trim()) {
            return { installed: true, version: result.stdout.trim() };
        }

        this.debug('yt-dlp not working:', {
            command: this.ytDlpCommand,
            code: result.code,
            error: result.stderr
        });
        return { installed: false };
    }

    /**
     * Fetch video metadata with strategy fallback.
     */
    async fetchMetadata(url: string): Promise<Video> {
        const strategies = this.buildStrategies(url);
        let forceIpv4 = this.shouldForceIpv4(url);
        let lastError: Error | null = null;
        let repaired = false;

        for (let index = 0; index < strategies.length; index += 1) {
            const strategy = strategies[index];
            const attempts = index === 0 ? 2 : 1;

            for (let attempt = 1; attempt <= attempts; attempt += 1) {
                try {
                    this.debug(`Metadata fetch (${strategy.description}, attempt ${attempt}) for:`, url);
                    const video = await this.fetchMetadataAttempt(url, strategy, attempt, forceIpv4);

                    this.preferredStrategyId = strategy.id;
                    if (forceIpv4) {
                        this.rememberIpv4Host(url);
                    }
                    return video;
                } catch (error) {
                    lastError = error as Error;
                    const message = lastError.message;
                    this.debug(`Metadata strategy ${strategy.id} failed:`, message);

                    if (strategy.cookiesFromBrowser && isCookieAccessError(message)) {
                        this.disableCookieBrowser(strategy.cookiesFromBrowser);
                        break;
                    }

                    if (isDnsResolutionError(message)) {
                        forceIpv4 = true;
                    }

                    if (isToolMissingError(message) && !repaired) {
                        repaired = true;
                        if (await this.tryRepair()) {
                            attempt -= 1;
                            continue;
                        }
                    }

                    if (attempt < attempts) {
                        await this.delay(1_500);
                    }
                }
            }

            if (index < strategies.length - 1) {
                await this.delay(isBotCheckError(lastError?.message || '') ? 1_500 : 400);
            }
        }

        throw new Error(this.buildFinalError(lastError, url));
    }

    private async fetchMetadataAttempt(
        url: string,
        strategy: ExtractionStrategy,
        attempt: number,
        forceIpv4: boolean
    ): Promise<Video> {
        const args = [
            ...buildNetworkIsolationArgs(forceIpv4),
            ...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath),
            ...this.buildCookieArgsForStrategy(strategy),
            ...buildPlayerClientArgs(strategy),
            '--dump-json',
            '--no-warnings',
            '--ignore-errors',
            '--socket-timeout',
            '30',
            '--extractor-retries',
            '2',
            '--fragment-retries',
            '2',
            '--skip-unavailable-fragments'
        ];

        if (!strategy.playerClient) {
            args.push('--user-agent', this.userAgentForAttempt(attempt));
        }
        args.push('--add-header', 'Accept-Language:en-US,en;q=0.9');

        if (this.ffmpegAvailable && this.ffmpegLocation) {
            args.push('--ffmpeg-location', this.ffmpegLocation);
        }

        args.push(url);

        const timeout = 45_000 + (attempt - 1) * 15_000;
        this.debug(`Full command (${strategy.id}):`, this.ytDlpCommand, args.join(' '));

        const result = await this.runCapture([...this.commandPrefixArgs, ...args], timeout);

        if (result.timedOut) {
            throw new Error(
                `Metadata fetch timeout (${Math.round(timeout / 1000)}s) - video may be too large or network is slow.`
            );
        }

        if (result.code !== 0 || !result.stdout.trim()) {
            throw new Error(this.describeFailure(result.stderr || result.stdout, result.code));
        }

        const videoData = this.parseMetadataJson(result.stdout);
        if (!videoData) {
            throw new Error('yt-dlp returned invalid metadata');
        }

        return {
            id: videoData.id || videoData.display_id || 'unknown',
            url: videoData.webpage_url || url,
            title: videoData.title || 'Unknown Title',
            duration: videoData.duration || 0,
            thumbnailUrl: ensureHttpsThumbnail(videoData.thumbnail || ''),
            availableFormats: this.extractFormats(videoData.formats || [])
        };
    }

    private parseMetadataJson(output: string): YtDlpMetadata | null {
        const lines = output.trim().split('\n');
        for (const line of lines) {
            if (!line.trim().startsWith('{')) continue;
            try {
                const parsed: unknown = JSON.parse(line.trim());
                if (typeof parsed === 'object' && parsed !== null) {
                    return parsed as YtDlpMetadata;
                }
            } catch {
                // Try the next line / whole payload.
            }
        }

        try {
            const parsed: unknown = JSON.parse(output.trim());
            return typeof parsed === 'object' && parsed !== null
                ? parsed as YtDlpMetadata
                : null;
        } catch {
            return null;
        }
    }

    async startDownload(
        url: string,
        format: string,
        quality: string,
        outputPath: string,
        onProgress: (progress: ProgressData) => void,
        onError: (error: string) => void,
        onComplete: () => void,
        onProcessId?: (pid: number) => void,
        onOutputPath?: (outputPath: string) => void
    ): Promise<number> {
        const strategies = this.buildStrategies(url);
        let ffmpegAvailable = this.ffmpegAvailable;
        let strategyIndex = 0;
        let ffmpegRetried = false;
        let repaired = false;
        let directTried = false;
        let settled = false;
        let firstPid: number | null = null;
        let attemptToken = 0;

        return new Promise<number>(resolve => {
            const startDirectFallback = () => {
                if (settled) return;
                settled = true;

                const extension = getDirectMediaExtension(url);
                const directOutputPath = extension
                    ? replaceOutputExtension(outputPath, `.${extension}`)
                    : outputPath;

                if (directOutputPath !== outputPath) {
                    onOutputPath?.(directOutputPath);
                }

                const controller = new AbortController();
                const directId = this.nextDirectDownloadId--;
                this.directDownloads.set(directId, controller);
                onProcessId?.(directId);

                this.debug('Falling back to built-in direct media downloader:', url);

                downloadDirectMedia(url, directOutputPath, {
                    onProgress,
                    signal: controller.signal
                })
                    .then(() => {
                        this.directDownloads.delete(directId);
                        onComplete();
                    })
                    .catch(error => {
                        this.directDownloads.delete(directId);
                        if (controller.signal.aborted) return;
                        onError(this.describeDownloadError(error instanceof Error ? error.message : String(error)));
                    });
            };

            const launch = () => {
                if (settled) return;

                const strategy = strategies[Math.min(strategyIndex, strategies.length - 1)];
                const attempt = ++attemptToken;
                const audioPlan = format === 'mp3'
                    ? buildAudioDownloadPlan(quality, ffmpegAvailable)
                    : null;

                const effectiveOutputPath = audioPlan && audioPlan.outputExtension !== '.mp3'
                    ? replaceOutputExtension(outputPath, audioPlan.outputExtension)
                    : outputPath;

                if (effectiveOutputPath !== outputPath) {
                    onOutputPath?.(effectiveOutputPath);
                }

                const args = [
                    ...buildNetworkIsolationArgs(this.shouldForceIpv4(url)),
                    ...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath),
                    ...this.buildCookieArgsForStrategy(strategy),
                    ...buildPlayerClientArgs(strategy)
                ];

                if (format === 'mp3' && audioPlan) {
                    args.push('-f', audioPlan.formatSelector, ...audioPlan.postProcessArgs);
                } else {
                    args.push('-f', buildVideoFormatSelector(quality, ffmpegAvailable));
                    args.push('--merge-output-format', 'mp4');
                }

                if (ffmpegAvailable && this.ffmpegLocation) {
                    args.push('--ffmpeg-location', this.ffmpegLocation);
                }

                args.push(
                    '--newline',
                    '--no-warnings',
                    '--ignore-errors',
                    '--socket-timeout',
                    '30',
                    '--retries',
                    '3',
                    '--no-playlist',
                    '-o',
                    effectiveOutputPath,
                    url
                );

                this.debug(`Download command (${strategy.id}):`, this.ytDlpCommand, args.join(' '));

                const child = spawn(this.ytDlpCommand, [...this.commandPrefixArgs, ...args], {
                    windowsHide: true
                });
                const pid = child.pid ?? -1;

                if (pid > 0) {
                    this.processes.set(pid, child);
                }

                if (firstPid === null) {
                    firstPid = pid;
                    resolve(pid);
                } else if (pid > 0) {
                    onProcessId?.(pid);
                }

                let errorOutput = '';
                let lastProgressTime = Date.now();
                let attemptFinished = false;
                const progressParser = new ProgressParserImpl();
                const token = attempt;

                const stallCheckInterval = setInterval(() => {
                    if (Date.now() - lastProgressTime > 120_000) {
                        this.debug('Download appears stalled, killing process');
                        clearInterval(stallCheckInterval);
                        child.kill('SIGKILL');
                    }
                }, 30_000);

                const settleAttempt = () => {
                    attemptFinished = true;
                    clearInterval(stallCheckInterval);
                    if (pid > 0) {
                        this.processes.delete(pid);
                    }
                };

                const handleFailure = (rawMessage: string) => {
                    if (attemptFinished || settled || token !== attemptToken) return;
                    settleAttempt();

                    if (pid > 0 && this.cancelledPids.delete(pid)) {
                        return;
                    }

                    this.debug('Download attempt failed:', rawMessage);

                    if (strategy.cookiesFromBrowser && isCookieAccessError(rawMessage)) {
                        this.disableCookieBrowser(strategy.cookiesFromBrowser);
                    }

                    // ffmpeg failed even though it was available: retry with a
                    // pre-merged format so the download still completes.
                    if (isFfmpegError(rawMessage) && ffmpegAvailable && !ffmpegRetried) {
                        ffmpegRetried = true;
                        ffmpegAvailable = false;
                        this.ffmpegAvailable = false;
                        this.debug('ffmpeg failure detected, retrying without merging/transcoding');
                        launch();
                        return;
                    }

                    if (isToolMissingError(rawMessage) && !repaired) {
                        repaired = true;
                        void this.tryRepair().then(recovered => {
                            if (recovered && !settled) {
                                launch();
                            } else if (!settled) {
                                if (isDirectMediaUrl(url) && !directTried) {
                                    directTried = true;
                                    startDirectFallback();
                                } else {
                                    settled = true;
                                    onError(this.describeDownloadError(rawMessage));
                                }
                            }
                        });
                        return;
                    }

                    if (
                        (isBotCheckError(rawMessage) || isCookieAccessError(rawMessage)) &&
                        strategyIndex < strategies.length - 1
                    ) {
                        strategyIndex += 1;
                        this.debug(`Retrying download with strategy: ${strategies[strategyIndex].id}`);
                        launch();
                        return;
                    }

                    if (isDirectMediaUrl(url) && !directTried) {
                        directTried = true;
                        startDirectFallback();
                        return;
                    }

                    settled = true;
                    onError(this.describeDownloadError(rawMessage));
                };

                child.stdout.on('data', data => {
                    const lines = data.toString().split('\n');

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        const progress = progressParser.parse(line);
                        if (progress) {
                            onProgress(progress);
                            lastProgressTime = Date.now();
                        }

                        if (line.includes('[download]') && line.includes('Destination:')) {
                            onProgress({
                                percentage: 100,
                                speed: 'Complete',
                                eta: '00:00'
                            });
                            lastProgressTime = Date.now();
                        }
                    }
                });

                child.stderr.on('data', data => {
                    const line = data.toString();
                    errorOutput += line;
                    if (line.includes('ERROR:') || line.includes('WARNING:')) {
                        this.debug('yt-dlp error/warning:', line);
                    }
                });

                child.on('close', code => {
                    settleAttempt();

                    if (token !== attemptToken || settled) return;

                    if (pid > 0 && this.cancelledPids.delete(pid)) {
                        return;
                    }

                    if (code === 0) {
                        settled = true;
                        onComplete();
                        return;
                    }

                    handleFailure(errorOutput || `yt-dlp exited with code ${code}`);
                });

                child.on('error', error => {
                    handleFailure(`Process error: ${error.message}`);
                });
            };

            launch();
        });
    }

    async pauseProcess(pid: number): Promise<void> {
        if (process.platform === 'win32') {
            throw new Error('WINDOWS_PAUSE_UNSUPPORTED: Pausing downloads is not supported on Windows');
        }

        if (this.directDownloads.has(pid)) {
            throw new Error('PAUSE_UNSUPPORTED: Direct downloads cannot be paused');
        }

        const childProcess = this.processes.get(pid);
        if (childProcess) {
            childProcess.kill('SIGSTOP');
        }
    }

    async fetchPlaylist(url: string): Promise<PlaylistInfo> {
        const strategies = this.buildStrategies(url);
        let lastError: Error | null = null;
        let repaired = false;

        for (let index = 0; index < strategies.length; index += 1) {
            const strategy = strategies[index];
            const args = [
                ...buildNetworkIsolationArgs(this.shouldForceIpv4(url)),
                ...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath),
                ...this.buildCookieArgsForStrategy(strategy),
                ...buildPlayerClientArgs(strategy),
                '--dump-single-json',
                '--flat-playlist',
                '--yes-playlist',
                '--playlist-end',
                MAX_PLAYLIST_ITEMS.toString(),
                '--no-warnings',
                '--ignore-errors',
                '--socket-timeout',
                '30',
                '--extractor-retries',
                '3',
                url
            ];

            const result = await this.runCapture([...this.commandPrefixArgs, ...args], 90_000);

            if (result.timedOut) {
                lastError = new Error('Playlist information fetch timed out');
                continue;
            }

            if (result.code === 0 && result.stdout.trim()) {
                try {
                    const metadata: unknown = JSON.parse(result.stdout.trim());
                    this.preferredStrategyId = strategy.id;
                    return parsePlaylistMetadata(metadata, url);
                } catch (error) {
                    lastError = error instanceof Error
                        ? error
                        : new Error('Failed to parse playlist information');
                    continue;
                }
            }

            const failure = this.describeFailure(result.stderr || result.stdout, result.code);
            lastError = new Error(failure);

            if (strategy.cookiesFromBrowser && isCookieAccessError(failure)) {
                this.disableCookieBrowser(strategy.cookiesFromBrowser);
            }

            if (isToolMissingError(failure) && !repaired) {
                repaired = true;
                if (await this.tryRepair()) {
                    index -= 1;
                    continue;
                }
            }
        }

        throw lastError || new Error('Failed to fetch playlist information');
    }

    async resumeProcess(pid: number): Promise<void> {
        if (process.platform === 'win32') {
            throw new Error('WINDOWS_RESUME_UNSUPPORTED: Resuming paused downloads is not supported on Windows');
        }

        if (this.directDownloads.has(pid)) {
            throw new Error('RESUME_UNSUPPORTED: Direct downloads cannot be resumed');
        }

        const childProcess = this.processes.get(pid);
        if (childProcess) {
            childProcess.kill('SIGCONT');
        }
    }

    async cancelProcess(pid: number): Promise<void> {
        this.cancelledPids.add(pid);

        const directDownload = this.directDownloads.get(pid);
        if (directDownload) {
            directDownload.abort();
            this.directDownloads.delete(pid);
            return;
        }

        const process = this.processes.get(pid);
        if (!process) return;

        // Try SIGTERM first
        process.kill('SIGTERM');

        // Wait 5 seconds, then force kill with SIGKILL
        setTimeout(() => {
            if (this.processes.has(pid)) {
                process.kill('SIGKILL');
                this.processes.delete(pid);
            }
        }, 5_000);
    }

    private buildStrategies(url: string): ExtractionStrategy[] {
        return buildExtractionStrategies({
            isYouTube: isYouTubeUrl(url),
            cookiesFromBrowser: DEFAULT_COOKIE_CONFIG.cookiesFromBrowser,
            fallbackBrowsers: DEFAULT_COOKIE_CONFIG.fallbackBrowsers,
            preferredStrategyId: this.preferredStrategyId ?? undefined,
            disabledCookieBrowsers: this.disabledCookieBrowsers
        });
    }

    private buildCookieArgsForStrategy(strategy: ExtractionStrategy): string[] {
        if (DEFAULT_COOKIE_CONFIG.cookiesFile) {
            return ['--cookies', DEFAULT_COOKIE_CONFIG.cookiesFile];
        }

        if (!strategy.cookiesFromBrowser) {
            return [];
        }

        return buildFallbackCookieArgs(strategy.cookiesFromBrowser);
    }

    private disableCookieBrowser(browser: string): void {
        const normalized = browser.split(':')[0].trim().toLowerCase();
        if (!normalized) return;
        this.disabledCookieBrowsers.add(normalized);
        this.debug('Disabling unusable browser cookie store for this session:', browser);
    }

    private userAgentForAttempt(attempt: number): string {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ];
        return userAgents[Math.min(attempt - 1, userAgents.length - 1)];
    }

    private describeFailure(output: string, code: number | null): string {
        const errorLine = output
            .split('\n')
            .map(line => line.trim())
            .find(line => line.includes('ERROR:'));
        const detail = errorLine
            ? errorLine.replace(/^ERROR:\s*/, '')
            : output.trim().split('\n')[0] || `yt-dlp exited with code ${code}`;

        if (isCookieAccessError(output)) {
            return `Browser cookies could not be read (${detail}). Retrying without browser cookies. If YouTube keeps asking for sign-in, export cookies.txt and configure it in settings.`;
        }

        if (isBotCheckError(output)) {
            return `YouTube blocked this request (${detail}). The app tried alternate extraction clients and cookie-free access. If it keeps happening, export cookies.txt from a signed-in browser and configure it, or try again later.`;
        }

        if (isToolMissingError(output)) {
            return `yt-dlp could not be started (${detail}).`;
        }

        if (/Unsupported URL/i.test(output)) {
            return 'Unsupported video URL or platform';
        }

        if (/Video unavailable|has been removed|Private video/i.test(output)) {
            return 'Video is unavailable, private, or has been removed';
        }

        if (/age-restricted/i.test(output)) {
            return 'This video is age-restricted and cannot be downloaded without cookies';
        }

        if (isDnsResolutionError(output)) {
            return detail || 'DNS resolution failed while contacting the video website';
        }

        if (/network|connection|timed? ?out/i.test(output)) {
            return `Network error while contacting the video website: ${detail}`;
        }

        return `yt-dlp failed (code ${code ?? 'unknown'}): ${detail}`;
    }

    private describeDownloadError(message: string): string {
        if (isFfmpegError(message)) {
            return 'Audio/video processing failed - ffmpeg could not merge or convert the media. The download was retried without post-processing; if it still fails, reinstall ffmpeg from Settings.';
        }
        if (/permission denied|EACCES|EPERM/i.test(message)) {
            return 'Permission denied - check download folder permissions';
        }
        if (/no space left|ENOSPC/i.test(message)) {
            return 'Not enough disk space to complete the download';
        }
        if (message.includes('ERROR:')) {
            return message.split('\n').find(line => line.includes('ERROR:')) || message;
        }
        return message;
    }

    private buildFinalError(lastError: Error | null, url: string): string {
        const base = lastError?.message || 'Failed to fetch video information';

        if (isYouTubeUrl(url) && isBotCheckError(base)) {
            return `${base}\n\nTip: YouTube is limiting automated access from this network. Signing in to YouTube in a browser and exporting cookies.txt (Netscape format) to the app usually fixes this.`;
        }

        return base;
    }

    private shouldForceIpv4(url: string): boolean {
        try {
            return this.forceIpv4Hosts.has(new URL(url).hostname.toLowerCase());
        } catch {
            return false;
        }
    }

    private rememberIpv4Host(url: string): void {
        try {
            this.forceIpv4Hosts.add(new URL(url).hostname.toLowerCase());
        } catch {
            // URL validation happens before metadata extraction.
        }
    }

    private extractFormats(formats: YtDlpFormat[]): Format[] {
        const result = extractAvailableFormats(formats);

        this.debug('Extracted formats:', {
            sourceFormatCount: formats.length,
            result
        });

        return result;
    }

    private async tryRepair(): Promise<boolean> {
        if (!this.repairHandler) return false;

        const now = Date.now();
        if (now - this.lastRepairAttempt < 60_000) {
            return false;
        }
        this.lastRepairAttempt = now;

        if (!this.repairPromise) {
            this.repairPromise = this.repairHandler()
                .catch(error => {
                    this.debug('yt-dlp repair failed:', error);
                    return false;
                })
                .finally(() => {
                    this.repairPromise = null;
                });
        }

        return this.repairPromise;
    }

    private runCapture(args: string[], timeoutMs: number): Promise<CaptureResult> {
        return new Promise(resolve => {
            let stdout = '';
            let stderr = '';
            let settled = false;
            let timedOut = false;

            const child = spawn(this.ytDlpCommand, args, { windowsHide: true });

            const finish = (code: number | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve({ code, stdout, stderr, timedOut });
            };

            const timeout = setTimeout(() => {
                timedOut = true;
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

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
