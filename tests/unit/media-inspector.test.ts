import {
  buildResolutionReport,
  formatDimensions,
  getQualityTier,
  parseFfprobeOutput
} from '../../electron/main/infrastructure/MediaInspector';

describe('ffprobe output parsing', () => {
  it('extracts actual dimensions, codecs, container, and audio presence', () => {
    const result = parseFfprobeOutput(JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          disposition: { attached_pic: 0 }
        },
        {
          codec_type: 'audio',
          codec_name: 'aac'
        }
      ],
      format: {
        format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '42.5'
      }
    }), 'C:\\Downloads\\video.mp4');

    expect(result).toMatchObject({
      filePath: 'C:\\Downloads\\video.mp4',
      verified: true,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      hasVideo: true,
      hasAudio: true,
      durationSeconds: 42.5
    });
    expect(result.container).toContain('mp4');
  });

  it('ignores cover art and reports a missing audio stream', () => {
    const result = parseFfprobeOutput(JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'vp9',
          width: 1080,
          height: 1920,
          disposition: { attached_pic: 1 }
        }
      ]
    }), 'portrait.webm');

    expect(result.hasVideo).toBe(false);
    expect(result.hasAudio).toBe(false);
    expect(result.verified).toBe(true);
  });

  it('marks unparseable output as unverified rather than guessing', () => {
    expect(parseFfprobeOutput('not json', 'broken.mp4')).toMatchObject({
      verified: false,
      hasVideo: false,
      hasAudio: false
    });
    expect(parseFfprobeOutput('null', 'broken.mp4')).toMatchObject({
      verified: false,
      hasVideo: false,
      hasAudio: false
    });
  });
});

describe('truthful resolution reporting', () => {
  it('reports a lower actual resolution and the fallback reason', () => {
    const note = buildResolutionReport({
      requestedQuality: '1080p',
      requestedHeight: 1080,
      actualWidth: 1280,
      actualHeight: 720,
      verified: true,
      hasAudio: true,
      fallbackReason: 'MP4-compatible streams were used'
    });

    expect(note).toContain('Requested 1080p');
    expect(note).toContain('downloaded 720p');
    expect(note).toContain('1280 × 720');
    expect(note).toContain('MP4-compatible streams were used');
  });

  it('does not claim success when the file could not be verified', () => {
    const note = buildResolutionReport({
      requestedQuality: '1080p',
      requestedHeight: 1080,
      verified: false,
      hasAudio: undefined
    });

    expect(note).toBe('The final resolution could not be verified.');
  });

  it('does not claim verified dimensions when ffprobe has no width or height', () => {
    const note = buildResolutionReport({
      requestedQuality: '1080p',
      requestedHeight: 1080,
      verified: true
    });

    expect(note).toBe('The final resolution could not be verified.');
  });

  it('warns when the output has no audio stream', () => {
    const note = buildResolutionReport({
      requestedQuality: 'best',
      requestedHeight: null,
      actualWidth: 1920,
      actualHeight: 1080,
      verified: true,
      hasAudio: false
    });

    expect(note).toBe('The downloaded file has no audio stream.');
  });

  it('uses the short side for portrait metadata', () => {
    expect(getQualityTier(1080, 1920)).toBe(1080);
    expect(getQualityTier(1920, 1080)).toBe(1080);
    expect(formatDimensions(1080, 1920)).toBe('1080 × 1920');
  });
});
