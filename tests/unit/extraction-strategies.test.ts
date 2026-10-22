import {
    buildAudioDownloadPlan,
    buildExtractionStrategies,
    buildPlayerClientArgs,
    buildVideoFormatPlans,
    buildVideoFormatSelector,
    getDirectMediaExtension,
    parseVideoQualityHeight,
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
    it('prefers the highest-resolution separate streams without an MP4-only cap', () => {
        const selector = buildVideoFormatSelector('1080p', true);

        expect(selector).toContain('bestvideo[height<=1080]+bestaudio');
        expect(selector).toContain('bestvideo[width<=1080]+bestaudio');
        expect(selector).not.toContain('bestvideo[height<=1080][ext=mp4]');
    });

    it('does not cap the generic best selection to MP4 or 720p', () => {
        const selector = buildVideoFormatSelector('best', true);

        expect(selector).toBe('bestvideo+bestaudio/best');
        expect(selector).not.toContain('[ext=mp4]');
        expect(selector).not.toContain('height<=');
    });

    it('requests a pre-merged format when ffmpeg is unavailable', () => {
        const selector = buildVideoFormatSelector('720p', false);

        expect(selector).toBe(
            'best[height<=720]/best[width<=720]/best'
        );
        expect(selector).not.toContain('+');
    });

    it('builds an ordered fallback chain and explains each reduction', () => {
        const plans = buildVideoFormatPlans('1080p', true);

        expect(plans).toHaveLength(3);
        expect(plans[0].selector).toContain('bestvideo[height<=1080]');
        expect(plans[0].mergeOutputFormat).toBe('mp4/mkv');
        expect(plans[1].mergeOutputFormat).toBe('mp4');
        expect(plans[1].selector).toContain('[ext=mp4]');
        expect(plans[2].selector).not.toContain('+');
        expect(plans[2].selector).not.toContain('[ext=mp4]');
        expect(plans[2].requiresFfmpeg).toBe(false);
        expect(plans[1].reason).toMatch(/MP4-compatible/i);
        expect(plans[2].reason).toMatch(/pre-merged/i);
    });

    it('uses a single pre-merged plan when ffmpeg is missing', () => {
        const plans = buildVideoFormatPlans('1080p', false);

        expect(plans).toHaveLength(1);
        expect(plans[0].selector).toBe('best[height<=1080]/best[width<=1080]/best');
        expect(plans[0].requiresFfmpeg).toBe(false);
        expect(plans[0].mergeOutputFormat).toBeUndefined();
        expect(plans[0].reason).toMatch(/ffmpeg is unavailable/i);
    });

    it('parses only safe resolution tokens', () => {
        expect(parseVideoQualityHeight('1080p')).toBe(1080);
        expect(parseVideoQualityHeight('720')).toBe(720);
        expect(parseVideoQualityHeight('best')).toBeNull();
        expect(parseVideoQualityHeight('1080; rm -rf /')).toBeNull();
    });

    it('rejects injected quality values', () => {
        expect(buildVideoFormatSelector('1080; rm -rf /', true)).toBe(
            'bestvideo+bestaudio/best'
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
