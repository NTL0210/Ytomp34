import {
    buildAudioDownloadPlan,
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
} from '../../electron/main/infrastructure/ExtractionStrategies';

describe('YouTube extraction strategies', () => {
    it('detects YouTube URLs and ignores lookalike hosts', () => {
        expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
        expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true);
        expect(isYouTubeUrl('https://music.youtube.com/watch?v=abc')).toBe(true);
        expect(isYouTubeUrl('https://notyoutube.com/watch?v=abc')).toBe(false);
        expect(isYouTubeUrl('not a url')).toBe(false);
    });

    it('tries cookie-free clients before giving up', () => {
        const strategies = buildExtractionStrategies({ isYouTube: true });

        expect(strategies.map(strategy => strategy.id)).toEqual([
            'no-cookies:web_embedded',
            'no-cookies:mweb',
            'no-cookies:web_safari',
            'no-cookies:default'
        ]);
        expect(strategies[0].playerClient).toBe('web_embedded');
    });

    it('puts configured cookie browsers first and deduplicates them', () => {
        const strategies = buildExtractionStrategies({
            isYouTube: true,
            cookiesFromBrowser: 'chrome',
            fallbackBrowsers: ['Chrome', 'firefox']
        });

        expect(strategies.map(strategy => strategy.id)).toEqual([
            'cookies:chrome',
            'cookies:firefox',
            'no-cookies:web_embedded',
            'no-cookies:mweb',
            'no-cookies:web_safari',
            'no-cookies:default'
        ]);
        expect(strategies[0].playerClient).toBeUndefined();
    });

    it('skips browser cookie stores that already failed in this session', () => {
        const strategies = buildExtractionStrategies({
            isYouTube: true,
            cookiesFromBrowser: 'chrome',
            fallbackBrowsers: ['edge', 'firefox'],
            disabledCookieBrowsers: ['chrome', 'EDGE']
        });

        expect(strategies.map(strategy => strategy.id)).toEqual([
            'cookies:firefox',
            'no-cookies:web_embedded',
            'no-cookies:mweb',
            'no-cookies:web_safari',
            'no-cookies:default'
        ]);
    });

    it('moves the last successful strategy to the front', () => {
        const strategies = buildExtractionStrategies({
            isYouTube: true,
            preferredStrategyId: 'no-cookies:mweb'
        });

        expect(strategies[0].id).toBe('no-cookies:mweb');
    });

    it('does not apply YouTube client overrides to other sites', () => {
        const strategies = buildExtractionStrategies({
            isYouTube: false,
            cookiesFromBrowser: 'firefox'
        });

        expect(strategies.map(strategy => strategy.id)).toEqual([
            'cookies:firefox',
            'no-cookies:default'
        ]);
        expect(strategies.every(strategy => strategy.playerClient === undefined)).toBe(true);
    });

    it('builds player client arguments only when requested', () => {
        expect(buildPlayerClientArgs({
            id: 'mweb',
            description: 'mweb',
            playerClient: 'mweb'
        })).toEqual(['--extractor-args', 'youtube:player_client=mweb']);

        expect(buildPlayerClientArgs({ id: 'default', description: 'default' })).toEqual([]);
    });
});

describe('format selection', () => {
    it('merges separate streams when ffmpeg is available', () => {
        expect(buildVideoFormatSelector('1080p', true)).toContain('bestvideo[height<=1080]');
        expect(buildVideoFormatSelector('best', true)).toContain('+bestaudio');
    });

    it('requests a pre-merged format when ffmpeg is unavailable', () => {
        const selector = buildVideoFormatSelector('720p', false);

        expect(selector).toBe('best[height<=720][ext=mp4]/best[height<=720]/best');
        expect(selector).not.toContain('+');
    });

    it('rejects injected quality values', () => {
        expect(buildVideoFormatSelector('1080; rm -rf /', true)).toBe(
            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
        );
    });

    it('transcodes audio to mp3 only when ffmpeg is available', () => {
        const withFfmpeg = buildAudioDownloadPlan('140', true);
        expect(withFfmpeg.outputExtension).toBe('.mp3');
        expect(withFfmpeg.postProcessArgs).toContain('--extract-audio');
        expect(withFfmpeg.formatSelector).toContain('140/bestaudio');

        const withoutFfmpeg = buildAudioDownloadPlan('140', false);
        expect(withoutFfmpeg.outputExtension).toBe('.m4a');
        expect(withoutFfmpeg.postProcessArgs).toEqual([]);
        // The untouched stream must have the extension the file is named with,
        // so an arbitrary (possibly webm/opus) format id must not be used.
        expect(withoutFfmpeg.formatSelector).toBe(
            'bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio'
        );
    });

    it('replaces only the final extension', () => {
        expect(replaceOutputExtension('C:\\Music\\song.final.mp3', '.m4a'))
            .toBe('C:\\Music\\song.final.m4a');
    });
});

describe('failure classification', () => {
    it('recognizes unusable browser cookie stores', () => {
        expect(isCookieAccessError('ERROR: Failed to decrypt with DPAPI.')).toBe(true);
        expect(isCookieAccessError('could not find firefox cookies database')).toBe(true);
    });

    it('recognizes YouTube bot checks and HTTP 403', () => {
        expect(isBotCheckError('Sign in to confirm you are not a bot')).toBe(true);
        expect(isBotCheckError('ERROR: unable to download video data: HTTP Error 403: Forbidden')).toBe(true);
        expect(isBotCheckError('ERROR: Video unavailable')).toBe(false);
    });

    it('recognizes ffmpeg post-processing failures', () => {
        expect(isFfmpegError('ffmpeg exited with code 1')).toBe(true);
        expect(isFfmpegError('Merging of multiple formats failed')).toBe(true);
    });

    it('recognizes a missing executable', () => {
        expect(isToolMissingError('spawn yt-dlp ENOENT')).toBe(true);
        expect(isToolMissingError("'yt-dlp' is not recognized as an internal or external command")).toBe(true);
    });
});

describe('direct media URLs', () => {
    it('accepts URLs with a media extension', () => {
        expect(isDirectMediaUrl('https://cdn.example.com/video.mp4?token=1')).toBe(true);
        expect(getDirectMediaExtension('https://cdn.example.com/audio.MP3')).toBe('mp3');
    });

    it('rejects web pages and non-http URLs', () => {
        expect(isDirectMediaUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
        expect(isDirectMediaUrl('file:///C:/video.mp4')).toBe(false);
    });
});
