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
