jest.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}));

import {
  buildAudioFormatSelector,
  buildNetworkIsolationArgs,
  isDnsResolutionError
} from '../../electron/main/infrastructure/YtDlpExecutor';

describe('yt-dlp audio options', () => {
  const bestAudio = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';

  it('uses the best audio fallback for the default quality', () => {
    expect(buildAudioFormatSelector('best')).toBe(bestAudio);
  });

  it('prefers the audio format selected by the user', () => {
    expect(buildAudioFormatSelector('251')).toBe(`251/${bestAudio}`);
  });

  it('rejects arbitrary format-selector expressions from IPC input', () => {
    expect(buildAudioFormatSelector('251/bestvideo')).toBe(bestAudio);
  });
});

describe('yt-dlp network isolation options', () => {
  it('ignores external config without forcing an IP family by default', () => {
    expect(buildNetworkIsolationArgs()).toEqual(['--ignore-config']);
  });

  it('adds IPv4 only for the DNS fallback path', () => {
    expect(buildNetworkIsolationArgs(true)).toEqual(['--ignore-config', '--force-ipv4']);
  });

  it.each([
    'curl: (6) Could not resolve host: example.com',
    'getaddrinfo failed',
    'request failed with ENOTFOUND'
  ])('recognizes DNS resolution failures: %s', message => {
    expect(isDnsResolutionError(message)).toBe(true);
  });

  it('does not classify an HTTP error as a DNS failure', () => {
    expect(isDnsResolutionError('HTTP Error 403: Forbidden')).toBe(false);
  });
});
