import {
  getDefaultQualityValue,
  getQualityTier
} from '../../renderer/src/utils/qualitySelection';

describe('renderer quality selection', () => {
  it('does not trust qualities[0] when the list is unsorted', () => {
    const qualities = [
      { label: '1280 × 720', value: '720p', width: 1280, height: 720 },
      { label: '1920 × 1080', value: '1080p', width: 1920, height: 1080 },
      { label: '640 × 360', value: '360p', width: 640, height: 360 }
    ];

    expect(getDefaultQualityValue(qualities, 'mp4')).toBe('1080p');
  });

  it('prefers the explicit best video choice', () => {
    expect(getDefaultQualityValue([
      { label: '1920 × 1080', value: '1080p', width: 1920, height: 1080 },
      { label: 'Best available', value: 'best' }
    ], 'mp4')).toBe('best');
  });

  it('uses the highest audio bitrate for MP3', () => {
    expect(getDefaultQualityValue([
      { label: 'Best available', value: 'best' },
      { label: '128kbps', value: '140', bitrate: 128 },
      { label: '320kbps', value: '251', bitrate: 320 }
    ], 'mp3')).toBe('251');
  });

  it('uses the short side for portrait video tiers', () => {
    expect(getQualityTier({
      label: '1080 × 1920 (portrait)',
      value: '1080p',
      width: 1080,
      height: 1920
    })).toBe(1080);

    expect(getQualityTier({
      label: '1280 × 720',
      value: '720p',
      resolution: '1280x720'
    })).toBe(720);
  });
});
