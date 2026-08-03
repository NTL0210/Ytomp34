jest.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}));

import { buildAudioFormatSelector } from '../../electron/main/infrastructure/YtDlpExecutor';

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
