import {
  buildJavaScriptRuntimeArgs,
  extractAvailableFormats
} from '../../electron/main/infrastructure/YtDlpExecutor';
import { getDenoReleaseAsset } from '../../electron/main/infrastructure/DenoInstaller';

describe('YouTube format availability', () => {
  it('keeps 1080p and 720p video-only streams selectable for MP4 merging', () => {
    const formats = extractAvailableFormats([
      { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', height: 360 },
      { format_id: '136', vcodec: 'avc1', acodec: 'none', height: 720 },
      { format_id: '137', vcodec: 'avc1', acodec: 'none', height: 1080 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a', abr: 129 }
    ]);

    expect(formats.find(format => format.type === 'mp4')?.qualities.map(q => q.value))
      .toEqual(['best', '1080p', '720p', '360p']);
  });

  it('sorts unsorted formats from highest to lowest and keeps 1440p/2160p', () => {
    const formats = extractAvailableFormats([
      { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', width: 640, height: 360 },
      { format_id: '137', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080 },
      { format_id: '313', vcodec: 'vp9', acodec: 'none', width: 3840, height: 2160 },
      { format_id: '136', vcodec: 'avc1', acodec: 'none', width: 1280, height: 720 },
      { format_id: '308', vcodec: 'vp9', acodec: 'none', width: 2560, height: 1440 }
    ]);

    expect(formats.find(format => format.type === 'mp4')?.qualities.map(q => q.value))
      .toEqual(['best', '2160p', '1440p', '1080p', '720p', '360p']);
  });

  it('keeps a high-resolution video-only stream instead of preferring a low progressive MP4', () => {
    const formats = extractAvailableFormats([
      { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', width: 640, height: 360 },
      { format_id: '137', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a', abr: 129 }
    ]);
    const video = formats.find(format => format.type === 'mp4');

    expect(video?.qualities.map(q => q.value)).toEqual(['best', '1080p', '360p']);
    expect(video?.qualities.find(q => q.value === '1080p')).toMatchObject({
      label: '1920 × 1080',
      width: 1920,
      height: 1080,
      formatId: '137',
      isProgressive: false
    });
    expect(video?.qualities.some(q => q.value === '140')).toBe(false);
  });

  it('collapses duplicate resolutions and selects the best frame-rate variant', () => {
    const formats = extractAvailableFormats([
      { format_id: '137', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080, fps: 30, tbr: 4000 },
      { format_id: '248', vcodec: 'vp9', acodec: 'none', width: 1920, height: 1080, fps: 60, tbr: 5000 }
    ]);
    const qualities = formats.find(format => format.type === 'mp4')?.qualities ?? [];

    expect(qualities.filter(q => q.value === '1080p')).toHaveLength(1);
    expect(qualities.find(q => q.value === '1080p')).toMatchObject({
      label: '1920 × 1080 · 60 fps',
      formatId: '248',
      vcodec: 'vp9',
      fps: 60
    });
  });

  it('labels a portrait video by its short side and actual dimensions', () => {
    const formats = extractAvailableFormats([
      { format_id: 'portrait-1080', vcodec: 'vp9', acodec: 'none', width: 1080, height: 1920, fps: 30 }
    ]);
    const quality = formats.find(format => format.type === 'mp4')?.qualities
      .find(q => q.value !== 'best');

    expect(quality?.value).toBe('1080p');
    expect(quality?.label).toContain('1080 × 1920');
    expect(quality?.label).toContain('portrait');
    expect(quality?.label).not.toContain('1920p');
  });

  it('does not fabricate a 1080p choice when the source only offers 720p', () => {
    const formats = extractAvailableFormats([
      { format_id: '136', vcodec: 'avc1', acodec: 'none', width: 1280, height: 720 }
    ]);
    const values = formats.find(format => format.type === 'mp4')?.qualities.map(q => q.value) ?? [];

    expect(values).toEqual(['best', '720p']);
    expect(values).not.toContain('1080p');
  });

  it('ignores storyboards, thumbnails, and DRM formats', () => {
    const formats = extractAvailableFormats([
      { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', width: 160, height: 90 },
      { format_id: 'storyboard', vcodec: 'none', acodec: 'none', width: 160, height: 90, format_note: 'storyboard' },
      { format_id: 'drm', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080, has_drm: true },
      { format_id: '136', vcodec: 'avc1', acodec: 'none', width: 1280, height: 720 }
    ]);

    expect(formats.find(format => format.type === 'mp4')?.qualities.map(q => q.value))
      .toEqual(['best', '720p']);
  });

  it('parses dimensions from the resolution field when width and height are absent', () => {
    const formats = extractAvailableFormats([
      { format_id: 'res', vcodec: 'avc1', acodec: 'none', resolution: '1280x720' }
    ]);
    const quality = formats.find(format => format.type === 'mp4')?.qualities
      .find(q => q.value === '720p');

    expect(quality).toMatchObject({
      width: 1280,
      height: 720,
      label: '1280 × 720'
    });
  });

  it('keeps audio qualities separate and does not apply video filtering to MP3', () => {
    const formats = extractAvailableFormats([
      { format_id: '140', vcodec: 'none', acodec: 'mp4a', abr: 129 },
      { format_id: '251', vcodec: 'none', acodec: 'opus', abr: 160 },
      { format_id: '137', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080 }
    ]);
    const audio = formats.find(format => format.type === 'mp3');

    expect(audio?.qualities.map(q => q.value)).toEqual(['best', '251', '140']);
    expect(audio?.qualities.some(q => q.value === '137')).toBe(false);
  });

  it('passes the bundled Deno runtime and EJS component source to yt-dlp', () => {
    expect(buildJavaScriptRuntimeArgs('C:\\Ytomp34\\bin\\deno.exe')).toEqual([
      '--js-runtimes',
      'deno:C:\\Ytomp34\\bin\\deno.exe',
      '--remote-components',
      'ejs:github'
    ]);
  });

  it('selects the x64 Windows Deno release asset', () => {
    expect(getDenoReleaseAsset('win32', 'x64')).toEqual({
      fileName: 'deno-x86_64-pc-windows-msvc.zip',
      executableName: 'deno.exe'
    });
  });
});
