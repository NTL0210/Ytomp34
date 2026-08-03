jest.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}));

import { parsePlaylistMetadata } from '../../electron/main/infrastructure/YtDlpExecutor';

describe('playlist metadata parser', () => {
  it('normalizes entries, removes duplicates, and builds YouTube entry URLs', () => {
    const playlist = parsePlaylistMetadata({
      id: 'playlist-id',
      title: 'Test playlist',
      playlist_count: 4,
      entries: [
        {
          id: 'one',
          webpage_url: 'https://example.com/video/one',
          title: 'One',
          duration: 10
        },
        {
          id: 'one-copy',
          webpage_url: 'https://example.com/video/one',
          title: 'Duplicate'
        },
        {
          id: 'youtube-id',
          url: 'youtube-id',
          title: 'YouTube video',
          ie_key: 'Youtube'
        },
        null
      ]
    }, 'https://example.com/playlist');

    expect(playlist.title).toBe('Test playlist');
    expect(playlist.entries).toHaveLength(2);
    expect(playlist.entries[1].url).toBe('https://www.youtube.com/watch?v=youtube-id');
    expect(playlist.totalEntries).toBe(4);
    expect(playlist.truncated).toBe(true);
  });

  it('enforces the requested preview limit', () => {
    const playlist = parsePlaylistMetadata({
      entries: [
        { id: 'one', url: 'https://example.com/one' },
        { id: 'two', url: 'https://example.com/two' }
      ]
    }, 'https://example.com/playlist', 1);

    expect(playlist.entries).toHaveLength(1);
    expect(playlist.truncated).toBe(true);
  });

  it('rejects a non-playlist response', () => {
    expect(() => parsePlaylistMetadata(
      { id: 'single-video', title: 'Not a playlist' },
      'https://example.com/video'
    )).toThrow('does not contain a playlist');
  });
});
