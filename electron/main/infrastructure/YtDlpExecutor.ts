import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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
    buildVideoFormatPlans,
    getDirectMediaExtension,
    isBotCheckError,
    isCookieAccessError,
    isDirectMediaUrl,
    isFfmpegError,
    isToolMissingError,
    isYouTubeUrl,
    parseVideoQualityHeight,
    replaceOutputExtension
} from './ExtractionStrategies';
import {
    DownloadOutputMetadata,
    buildResolutionReport,
    formatDimensions,
    getQualityTier,
    inspectMediaFile
} from './MediaInspector';

export { buildAudioFormatSelector };

export interface YtDlpFormat {
    format_id?: string;
    ext?: string;
    width?: number;
    height?: number;
    resolution?: string;
    fps?: number;
    vcodec?: string;
    acodec?: string;
    filesize?: number;
    filesize_approx?: number;
    tbr?: number;
    vbr?: number;
    abr?: number;
    format_note?: string;
    protocol?: string;
    has_drm?: boolean;
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

const OUTPUT_MEDIA_EXTENSIONS = /\.(mp4|webm|mkv|mov|m4a|mp3|opus|ogg|oga|aac|flac|wav)$/i;

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

interface VideoFormatCandidate {
    formatId: string;
    ext?: string;
    width?: number;
    height: number;
    tier: number;
    fps?: number;
    tbr: number;
    vcodec: string;
    hasAudio: boolean;
}

function positiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}

function getFormatDimensions(format: YtDlpFormat): { width?: number; height: number } | null {
    const width = positiveNumber(format.width);
    const height = positiveNumber(format.height);

    if (height) {
        return { width, height };
    }

    if (format.resolution) {
        const dimensions = format.resolution.trim().match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i);
        if (dimensions) {
            const parsedWidth = Number(dimensions[1]);
            const parsedHeight = Number(dimensions[2]);
            if (parsedWidth > 0 && parsedHeight > 0) {
                return { width: parsedWidth, height: parsedHeight };
            }
        }

        const heightOnly = format.resolution.trim().match(/^(\d{2,5})p$/i);
        if (heightOnly) {
            return { height: Number(heightOnly[1]) };
        }
    }

    return null;
}

function isDownloadableVideoFormat(format: YtDlpFormat): boolean {
    const formatId = format.format_id?.trim();
    if (!formatId || !format.vcodec || format.vcodec === 'none' || format.has_drm) {
        return false;
    }

    const ext = format.ext?.toLowerCase();
    if (ext === 'mhtml' || ext === 'none') return false;

    if (format.protocol?.toLowerCase().includes('mhtml')) return false;
    if (format.format_note && /storyboard|thumbnail/i.test(format.format_note)) return false;
    if (/^(sb|storyboard)/i.test(formatId)) return false;

    return getFormatDimensions(format) !== null;
}

function toVideoCandidate(format: YtDlpFormat): VideoFormatCandidate | null {
    if (!isDownloadableVideoFormat(format)) return null;

    const dimensions = getFormatDimensions(format);
    if (!dimensions) return null;

    const tier = getQualityTier(dimensions.width, dimensions.height) ?? dimensions.height;
    const formatId = format.format_id!.trim();

    return {
        formatId,
        ext: format.ext,
        width: dimensions.width,
        height: dimensions.height,
        tier,
        fps: positiveNumber(format.fps),
        tbr: positiveNumber(format.tbr) ?? positiveNumber(format.vbr) ?? 0,
        vcodec: format.vcodec!,
        hasAudio: Boolean(format.acodec && format.acodec !== 'none')
    };
}

function compareVideoCandidates(a: VideoFormatCandidate, b: VideoFormatCandidate): number {
    return (b.tier - a.tier)
        || ((b.fps ?? 0) - (a.fps ?? 0))
        || (b.tbr - a.tbr)
        || (Number(a.hasAudio) - Number(b.hasAudio))
        || a.formatId.localeCompare(b.formatId);
}

function videoQualityLabel(candidate: VideoFormatCandidate): string {
    const dimensions = formatDimensions(candidate.width, candidate.height);
    if (!dimensions) return `${candidate.tier}p`;

    const portrait = Boolean(
        candidate.width &&
        candidate.height &&
        candidate.width < candidate.height
    );
    const fps = candidate.fps ? ` · ${Math.round(candidate.fps)} fps` : '';

    return `${dimensions}${portrait ? ' (portrait)' : ''}${fps}`;
}

function buildVideoQualityOptions(formats: YtDlpFormat[]): Quality[] {
    const candidates = formats
        .map(toVideoCandidate)
        .filter((candidate): candidate is VideoFormatCandidate => candidate !== null)
        .sort(compareVideoCandidates);

    // One choice per resolution tier. Showing every codec/container variant as
    // a separate identical-looking row is misleading; the representative is
    // the highest frame-rate/bitrate variant at that tier.
    const bestByTier = new Map<number, VideoFormatCandidate>();
    for (const candidate of candidates) {
        if (!bestByTier.has(candidate.tier)) {
            bestByTier.set(candidate.tier, candidate);
        }
    }

    const ordered = Array.from(bestByTier.values()).sort(compareVideoCandidates);

    return [
        { label: 'Best available', value: 'best', resolution: 'best' },
        ...ordered.map(candidate => ({
            label: videoQualityLabel(candidate),
            value: `${candidate.tier}p`,
            resolution: candidate.width && candidate.height
                ? `${Math.round(candidate.width)}x${Math.round(candidate.height)}`
                : `${candidate.tier}p`,
            width: candidate.width,
            height: candidate.height,
            fps: candidate.fps,
            formatId: candidate.formatId,
            ext: candidate.ext,
            vcodec: candidate.vcodec,
            isProgressive: candidate.hasAudio
        }))
    ];
}

export function extractAvailableFormats(formats: YtDlpFormat[]): Format[] {
    const audioFormats = formats.filter(format =>
        Boolean(
            format.format_id &&
            format.acodec &&
            format.acodec !== 'none' &&
            !format.has_drm &&
            (!format.vcodec || format.vcodec === 'none')
        )
    );

    const result: Format[] = [];
    const videoQualities = buildVideoQualityOptions(formats);

    if (videoQualities.length > 1) {
        result.push({ type: 'mp4', qualities: videoQualities });
    }

    const seenAudioIds = new Set<string>();
    const audioQualities: Quality[] = audioFormats
        .filter(format => positiveNumber(format.abr) !== undefined)
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))
        .filter(format => {
            const id = format.format_id!;
            if (seenAudioIds.has(id)) return false;
            seenAudioIds.add(id);
            return true;
        })
        .slice(0, 5)
        .map(format => ({
            label: `${Math.round(format.abr ?? 0)}kbps`,
            value: format.format_id!,
            bitrate: format.abr,
            formatId: format.format_id,
            ext: format.ext,
            acodec: format.acodec
        }));

    if (audioFormats.length > 0) {
        result.push({
            type: 'mp3',
            qualities: [
                { label: 'Best available', value: 'best' },
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
        onComplete: (metadata?: DownloadOutputMetadata) => void,
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
        onComplete: (metadata?: DownloadOutputMetadata) => void,
        onProcessId?: (pid: number) => void,
        onOutputPath?: (outputPath: string) => void
    ): Promise<number> {
        const strategies = this.buildStrategies(url);
        let ffmpegAvailable = this.ffmpegAvailable;
        const videoPlans = format === 'mp4'
            ? buildVideoFormatPlans(quality, ffmpegAvailable)
            : [];
        let videoPlanIndex = 0;
        // If ffmpeg is unavailable from the start, the only plan is a
        // pre-merged format. Record that limitation up front so completion can
        // report it even when the file itself is valid.
        let fallbackReason: string | undefined = format === 'mp4' && videoPlans.length === 1
            ? videoPlans[0].reason
            : undefined;
        let strategyIndex = 0;
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
                    .then(async () => {
                        this.directDownloads.delete(directId);
                        try {
                            const metadata = await this.finalizeOutput({
                                format,
                                quality,
                                candidates: [directOutputPath],
                                fallbackPath: directOutputPath,
                                fallbackReason,
                                onOutputPath
                            });

                            if (!metadata) {
                                onError('The direct download completed but the output file could not be found.');
                                return;
                            }

                            if (format === 'mp4' && metadata.verified && !metadata.hasVideo) {
                                onError('The downloaded file does not contain a video stream. Try a different quality or URL.');
                                return;
                            }

                            onComplete(metadata);
                        } catch (error) {
                            onError(this.describeDownloadError(error instanceof Error ? error.message : String(error)));
                        }
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
                const videoPlan = format === 'mp4'
                    ? videoPlans[Math.min(videoPlanIndex, videoPlans.length - 1)]
                    : null;
                const audioPlan = format === 'mp3'
                    ? buildAudioDownloadPlan(quality, ffmpegAvailable)
                    : null;

                const effectiveOutputPath = audioPlan && audioPlan.outputExtension !== '.mp3'
                    ? replaceOutputExtension(outputPath, audioPlan.outputExtension)
                    : outputPath;

                // Video downloads use yt-dlp's actual extension. This matters
                // for the pre-merged fallback: writing WebM bytes into a file
                // named .mp4 would mislabel the result.
                const outputArgument = format === 'mp4'
                    ? replaceOutputExtension(outputPath, '.%(ext)s')
                    : effectiveOutputPath;

                if (audioPlan && effectiveOutputPath !== outputPath) {
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
                    this.debug('Audio download plan:', {
                        selector: audioPlan.formatSelector,
                        outputExtension: audioPlan.outputExtension,
                        fallbackReason
                    });
                } else if (videoPlan) {
                    args.push('-f', videoPlan.selector);
                    if (videoPlan.mergeOutputFormat) {
                        args.push('--merge-output-format', videoPlan.mergeOutputFormat);
                    }
                    this.debug('Video download plan:', {
                        requestedQuality: quality,
                        selector: videoPlan.selector,
                        mergeOutputFormat: videoPlan.mergeOutputFormat,
                        planIndex: videoPlanIndex,
                        fallbackReason
                    });
                } else {
                    // Defensive fallback for an unexpected format value.
                    args.push('-f', 'bestvideo+bestaudio/best');
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
                    outputArgument,
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
                let destinationPath: string | null = null;
                let mergedOutputPath: string | null = null;
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

                    // Never disable ffmpeg globally for one bad source. Video
                    // retries walk through higher-quality -> MP4-compatible ->
                    // pre-merged plans; audio retries keep the original stream.
                    if (isFfmpegError(rawMessage)) {
                        if (format === 'mp4' && videoPlanIndex < videoPlans.length - 1) {
                            videoPlanIndex += 1;
                            fallbackReason = videoPlans[videoPlanIndex].reason;
                            this.debug('Video post-processing failed; using fallback plan:', {
                                planIndex: videoPlanIndex,
                                selector: videoPlans[videoPlanIndex].selector,
                                reason: fallbackReason
                            });
                            launch();
                            return;
                        }

                        if (format === 'mp3' && ffmpegAvailable) {
                            ffmpegAvailable = false;
                            fallbackReason = 'ffmpeg could not create MP3 audio, so the original audio stream was saved as M4A';
                            this.debug('Audio post-processing failed; retrying without transcoding');
                            launch();
                            return;
                        }
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
                    const lines = data.toString().split(/\r?\n/);

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        const progress = progressParser.parse(line);
                        if (progress) {
                            onProgress(progress);
                            lastProgressTime = Date.now();
                        }

                        const merged = line.match(/\[Merger\] Merging formats into\s+"?(.+?)"?\s*$/i);
                        if (merged) {
                            mergedOutputPath = this.cleanOutputPath(merged[1]);
                        }

                        const destination = line.match(/\[download\] Destination:\s+(.+)$/i);
                        if (destination) {
                            destinationPath = this.cleanOutputPath(destination[1]);
                            lastProgressTime = Date.now();
                        }

                        const alreadyDownloaded = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/i);
                        if (alreadyDownloaded) {
                            destinationPath = this.cleanOutputPath(alreadyDownloaded[1]);
                            lastProgressTime = Date.now();
                        }

                        if (line.includes('[Merger]') || line.includes('has already been downloaded')) {
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

                child.on('close', async code => {
                    settleAttempt();

                    if (token !== attemptToken || settled) return;

                    if (pid > 0 && this.cancelledPids.delete(pid)) {
                        return;
                    }

                    if (code === 0) {
                        settled = true;

                        try {
                            const metadata = await this.finalizeOutput({
                                format,
                                quality,
                                candidates: format === 'mp4'
                                    ? [mergedOutputPath, destinationPath]
                                    : [effectiveOutputPath],
                                fallbackPath: format === 'mp4' ? outputPath : effectiveOutputPath,
                                fallbackReason,
                                onOutputPath
                            });

                            if (!metadata) {
                                onError('The download completed but the output file could not be found. Check the download folder permissions and try again.');
                                return;
                            }

                            if (format === 'mp4' && metadata.verified && !metadata.hasVideo) {
                                onError('The downloaded file does not contain a video stream. Try a different quality or URL.');
                                return;
                            }

                            onComplete(metadata);
                        } catch (error) {
                            onError(this.describeDownloadError(error instanceof Error ? error.message : String(error)));
                        }
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
            return 'Audio/video processing failed - ffmpeg could not merge or convert the media at the requested quality. Reinstall ffmpeg from Settings, or choose a lower quality that is available as a pre-merged format.';
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

    private async finalizeOutput(options: {
        format: string;
        quality: string;
        candidates: Array<string | null | undefined>;
        fallbackPath?: string;
        fallbackReason?: string;
        onOutputPath?: (outputPath: string) => void;
    }): Promise<DownloadOutputMetadata | null> {
        const outputPath = this.resolveOutputPath(options.candidates, options.fallbackPath);
        if (!outputPath) return null;

        options.onOutputPath?.(outputPath);

        const inspection = await inspectMediaFile(outputPath, this.ffmpegLocation);
        const requestedHeight = options.format === 'mp4'
            ? parseVideoQualityHeight(options.quality)
            : null;
        const resolutionWarning = options.format === 'mp4'
            ? buildResolutionReport({
                requestedQuality: options.quality,
                requestedHeight,
                actualWidth: inspection.width,
                actualHeight: inspection.height,
                verified: inspection.verified,
                hasAudio: inspection.verified ? inspection.hasAudio : undefined
            })
            : inspection.verified
                ? (inspection.hasAudio ? undefined : 'The downloaded file has no audio stream.')
                : 'The final audio stream could not be verified.';

        const fallbackNote = options.fallbackReason
            ? (options.fallbackReason.endsWith('.') ? options.fallbackReason : `${options.fallbackReason}.`)
            : undefined;
        const outputExtension = path.extname(outputPath).toLowerCase();
        const containerNote = options.format === 'mp4' && (outputExtension === '.mkv' || outputExtension === '.webm')
            ? `Saved as ${outputExtension === '.webm' ? 'WebM' : 'MKV'} to preserve the selected video and audio streams without re-encoding.`
            : undefined;
        const warning = [resolutionWarning, fallbackNote, containerNote]
            .filter((note): note is string => Boolean(note))
            .join(' ') || undefined;

        const tier = getQualityTier(inspection.width, inspection.height);
        const metadata: DownloadOutputMetadata = {
            outputPath,
            width: inspection.width,
            height: inspection.height,
            resolution: formatDimensions(inspection.width, inspection.height),
            qualityTier: tier !== null ? `${tier}p` : undefined,
            videoCodec: inspection.videoCodec,
            audioCodec: inspection.audioCodec,
            container: inspection.container,
            hasVideo: inspection.hasVideo,
            hasAudio: inspection.hasAudio,
            verified: inspection.verified,
            warning,
            fallbackReason: options.fallbackReason
        };

        this.debug('Completed output:', {
            outputPath: metadata.outputPath,
            width: metadata.width,
            height: metadata.height,
            qualityTier: metadata.qualityTier,
            videoCodec: metadata.videoCodec,
            audioCodec: metadata.audioCodec,
            container: metadata.container,
            verified: metadata.verified,
            warning: metadata.warning
        });

        return metadata;
    }

    private resolveOutputPath(
        candidates: Array<string | null | undefined>,
        fallbackPath?: string
    ): string | null {
        const seen = new Set<string>();

        // Parsed Destination/Merger paths are authoritative. Skip temporary
        // stream files so a leftover .f137.mp4 cannot be mistaken for the final
        // merged output.
        for (const candidate of candidates) {
            if (!candidate || candidate.includes('%(ext)s') || seen.has(candidate)) continue;
            seen.add(candidate);
            if (this.isTemporaryOutput(candidate)) continue;

            try {
                if (fs.statSync(candidate).isFile()) return candidate;
            } catch {
                // Try the next candidate.
            }
        }

        // The actual extension may differ from the requested one (.mkv for
        // AV1/Opus, .webm for a pre-merged fallback, .m4a for audio). Search by
        // the task's base name and choose the most recent media file.
        const searchPaths = [...candidates, fallbackPath];
        const scanned = new Set<string>();

        for (const candidate of searchPaths) {
            if (!candidate || candidate.includes('%(ext)s') || this.isTemporaryOutput(candidate)) {
                continue;
            }

            const extension = path.extname(candidate);
            const basePath = extension ? candidate.slice(0, -extension.length) : candidate;
            const directory = path.dirname(candidate);
            const key = `${directory}\0${basePath}`;
            if (scanned.has(key)) continue;
            scanned.add(key);

            const prefix = `${path.basename(basePath)}.`;

            try {
                const files = fs.readdirSync(directory)
                    .filter(name => name.startsWith(prefix)
                        && OUTPUT_MEDIA_EXTENSIONS.test(name)
                        && !/\.(part|ytdl|temp)$/i.test(name))
                    .map(name => path.join(directory, name))
                    .filter(file => {
                        try {
                            return fs.statSync(file).isFile();
                        } catch {
                            return false;
                        }
                    })
                    .sort((a, b) => {
                        try {
                            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
                        } catch {
                            return 0;
                        }
                    });

                if (files.length > 0) return files[0];
            } catch {
                // Directory may be temporarily unavailable; try the next candidate.
            }
        }

        if (fallbackPath && !fallbackPath.includes('%(ext)s')) {
            try {
                if (fs.statSync(fallbackPath).isFile()) return fallbackPath;
            } catch {
                // The file may have been moved or removed.
            }
        }

        return null;
    }

    private isTemporaryOutput(outputPath: string): boolean {
        return /\.(part|ytdl|temp)$/i.test(outputPath)
            || /\.f\d+\./i.test(path.basename(outputPath));
    }

    private cleanOutputPath(value: string): string {
        return value.trim().replace(/^"|"$/g, '');
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
