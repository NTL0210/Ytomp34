/**
 * ExtractionStrategies
 *
 * Pure helpers that describe how yt-dlp should be invoked and how to recover
 * when YouTube rejects a request, cookies cannot be decrypted, or ffmpeg is
 * unavailable.
 *
 * Keeping this logic free of child processes and Electron makes it easy to
 * unit test and keeps the executor focused on process management.
 */

export interface ExtractionStrategy {
    /** Stable identifier used to remember the last strategy that worked. */
    id: string;
    /** Human readable description for logs. */
    description: string;
    /** Browser name passed to --cookies-from-browser (may include :profile). */
    cookiesFromBrowser?: string;
    /** YouTube player client override. */
    playerClient?: string;
}

export interface ExtractionStrategyOptions {
    isYouTube: boolean;
    cookiesFromBrowser?: string;
    fallbackBrowsers?: string[];
    preferredStrategyId?: string;
    disabledCookieBrowsers?: Iterable<string>;
}

const YOUTUBE_HOSTS = [
    'youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'youtube.googleapis.com'
];

export function isYouTubeUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return YOUTUBE_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
}

function normalizeBrowserName(browser: string): string {
    return browser.split(':')[0].trim().toLowerCase();
}

/**
 * Build the ordered list of extraction strategies.
 *
 * Cookie strategies come first because authenticated requests give the best
 * quality and access to restricted videos. If a browser cookie store cannot be
 * read (for example Chrome's DPAPI app-bound encryption), the executor disables
 * that browser and moves on. YouTube always gets a cookie-free `mweb` strategy
 * as a fallback; it is the most reliable client when YouTube bot checks the
 * default clients.
 */
export function buildExtractionStrategies(options: ExtractionStrategyOptions): ExtractionStrategy[] {
    const strategies: ExtractionStrategy[] = [];
    const disabled = new Set(
        Array.from(options.disabledCookieBrowsers ?? []).map(normalizeBrowserName)
    );

    const browsers: string[] = [];
    for (const browser of [options.cookiesFromBrowser, ...(options.fallbackBrowsers ?? [])]) {
        if (!browser) continue;
        const normalized = normalizeBrowserName(browser);
        if (disabled.has(normalized)) continue;
        if (browsers.some(existing => normalizeBrowserName(existing) === normalized)) continue;
        browsers.push(browser);
    }

    for (const browser of browsers) {
        strategies.push({
            id: `cookies:${normalizeBrowserName(browser)}`,
            description: `cookies from ${browser}`,
            cookiesFromBrowser: browser
        });
    }

    if (options.isYouTube) {
        strategies.push({
            id: 'no-cookies:web_embedded',
            description: 'no cookies, YouTube web_embedded client (full quality)',
            playerClient: 'web_embedded'
        });
        strategies.push({
            id: 'no-cookies:mweb',
            description: 'no cookies, YouTube mweb client (low bandwidth fallback)',
            playerClient: 'mweb'
        });
        strategies.push({
            id: 'no-cookies:web_safari',
            description: 'no cookies, YouTube web_safari client',
            playerClient: 'web_safari,mweb'
        });
    }

    strategies.push({
        id: 'no-cookies:default',
        description: 'no cookies, default clients'
    });

    if (options.preferredStrategyId) {
        const preferredIndex = strategies.findIndex(
            strategy => strategy.id === options.preferredStrategyId
        );
        if (preferredIndex > 0) {
            const [preferred] = strategies.splice(preferredIndex, 1);
            strategies.unshift(preferred);
        }
    }

    return strategies;
}

/** Arguments that select a specific YouTube player client. */
export function buildPlayerClientArgs(strategy: ExtractionStrategy): string[] {
    if (!strategy.playerClient) return [];
    return ['--extractor-args', `youtube:player_client=${strategy.playerClient}`];
}

const BOT_CHECK_PATTERN =
    /sign in to confirm|not a bot|confirm you.{0,4}re not a bot|checking your browser|unusual traffic|this content isn.{0,3}t available|login required|http error 403|403: forbidden/i;

const COOKIE_ACCESS_PATTERN =
    /failed to decrypt|dpapi|could not find .{0,40}cookies? database|could not read cookies|cookies? (?:database|file).{0,30}(?:locked|permission|not found)|unsupported browser|unable to (?:read|load|extract) cookies|no such file.{0,20}cookies/i;

const TOOL_MISSING_PATTERN =
    /enoent|not found|not recognized as an internal|is not recognized|cannot find the file|no such file or directory/i;

const FFMPEG_PATTERN =
    /ffmpeg|ffprobe|merging of multiple formats|postprocess(?:ing)?|conversion failed|you have requested merging|invalid data found when processing input|error opening output file/i;

export function isBotCheckError(error: Error | string): boolean {
    return BOT_CHECK_PATTERN.test(typeof error === 'string' ? error : error.message);
}

export function isCookieAccessError(error: Error | string): boolean {
    return COOKIE_ACCESS_PATTERN.test(typeof error === 'string' ? error : error.message);
}

export function isToolMissingError(error: Error | string): boolean {
    return TOOL_MISSING_PATTERN.test(typeof error === 'string' ? error : error.message);
}

export function isFfmpegError(error: Error | string): boolean {
    return FFMPEG_PATTERN.test(typeof error === 'string' ? error : error.message);
}

const MEDIA_EXTENSIONS = [
    'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv',
    'mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'
];

const MEDIA_EXTENSION_PATTERN = new RegExp(
    `\\.(${MEDIA_EXTENSIONS.join('|')})(?:$|[?#])`,
    'i'
);

/** Returns the lower-case media extension of a direct URL, or null. */
export function getDirectMediaExtension(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        const match = parsed.pathname.match(MEDIA_EXTENSION_PATTERN);
        return match ? match[1].toLowerCase() : null;
    } catch {
        return null;
    }
}

/**
 * Direct media URLs can be downloaded without yt-dlp. This is intentionally
 * conservative: only URLs with a recognized media extension qualify.
 */
export function isDirectMediaUrl(url: string): boolean {
    return getDirectMediaExtension(url) !== null;
}

function parseHeight(quality: string): number | null {
    const match = quality.trim().match(/^(\d{2,4})p?$/i);
    if (!match) return null;
    const height = Number(match[1]);
    if (!Number.isFinite(height) || height < 144 || height > 8640) return null;
    return height;
}

/**
 * Build a safe video format selector.
 *
 * When ffmpeg is available separate video/audio streams are merged. When it is
 * not, a pre-merged format is requested so playback still works without any
 * post-processing step.
 */
export function buildVideoFormatSelector(quality: string, ffmpegAvailable: boolean): string {
    const heightLimit = parseHeight(quality);

    if (!ffmpegAvailable) {
        return heightLimit
            ? `best[height<=${heightLimit}][ext=mp4]/best[height<=${heightLimit}]/best`
            : 'best[ext=mp4]/best';
    }

    return heightLimit
        ? `bestvideo[height<=${heightLimit}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${heightLimit}]+bestaudio/best[height<=${heightLimit}]`
        : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
}

export interface AudioDownloadPlan {
    /** Format selector passed to -f. */
    formatSelector: string;
    /** Arguments that belong to yt-dlp's post-processing step. */
    postProcessArgs: string[];
    /** Extension the final file will have. */
    outputExtension: '.mp3' | '.m4a';
}

/**
 * Build the audio download plan.
 *
 * Without ffmpeg it is impossible to transcode to MP3. Instead of failing the
 * download, keep the original m4a audio stream and report the real extension to
 * the caller so the UI opens the correct file.
 */
export function buildAudioDownloadPlan(quality: string, ffmpegAvailable: boolean): AudioDownloadPlan {
    if (!ffmpegAvailable) {
        // Without ffmpeg the downloaded stream keeps its original container, so
        // the file must keep the extension it actually has. Always request m4a
        // rather than an arbitrary selected audio id (which may be webm/opus)
        // so the reported .m4a path matches the bytes on disk.
        return {
            formatSelector: BEST_AUDIO_M4A_SELECTOR,
            postProcessArgs: [],
            outputExtension: '.m4a'
        };
    }

    const formatSelector = buildAudioFormatSelector(quality);

    return {
        formatSelector,
        postProcessArgs: ['--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'],
        outputExtension: '.mp3'
    };
}

const BEST_AUDIO_SELECTOR = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';
/** Selector used when the stream cannot be transcoded; prefers a container that matches .m4a. */
const BEST_AUDIO_M4A_SELECTOR = 'bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio';

/**
 * Build a conservative audio selector from a format id returned by yt-dlp.
 * Falling back to bestaudio keeps downloads working when a saved format id is
 * no longer available by the time the download starts.
 */
export function buildAudioFormatSelector(quality: string): string {
    const selectedFormatId = quality.trim();

    if (!selectedFormatId || selectedFormatId === 'best') {
        return BEST_AUDIO_SELECTOR;
    }

    // yt-dlp format ids are simple identifiers. Do not allow renderer input to
    // inject arbitrary format-selector expressions.
    if (!/^[A-Za-z0-9._-]+$/.test(selectedFormatId)) {
        return BEST_AUDIO_SELECTOR;
    }

    return `${selectedFormatId}/${BEST_AUDIO_SELECTOR}`;
}

/** Replace a fixed output extension without touching the rest of the path. */
export function replaceOutputExtension(outputPath: string, extension: string): string {
    return outputPath.replace(/\.[A-Za-z0-9]+$/, '') + extension;
}
