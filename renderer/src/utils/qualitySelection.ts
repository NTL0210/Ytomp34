import type { Quality } from '../types/electron';

type DownloadFormat = 'mp4' | 'mp3';

/**
 * The resolution tier is the short side. This keeps a 1080 × 1920 portrait
 * video in the 1080p tier instead of calling it 1920p.
 */
export function getQualityTier(quality: Quality): number | null {
  if (
    typeof quality.width === 'number' &&
    Number.isFinite(quality.width) &&
    quality.width > 0 &&
    typeof quality.height === 'number' &&
    Number.isFinite(quality.height) &&
    quality.height > 0
  ) {
    return Math.round(Math.min(quality.width, quality.height));
  }

  if (typeof quality.height === 'number' && Number.isFinite(quality.height) && quality.height > 0) {
    return Math.round(quality.height);
  }

  const candidates = [quality.resolution, quality.value];
  for (const candidate of candidates) {
    if (!candidate) continue;

    const dimensions = candidate.match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i);
    if (dimensions) {
      return Math.round(Math.min(Number(dimensions[1]), Number(dimensions[2])));
    }

    const height = candidate.match(/^(\d{2,5})p?$/i);
    if (height) {
      return Math.round(Number(height[1]));
    }
  }

  return null;
}

/**
 * Choose the default without assuming the main process or a source returned
 * the list in a useful order. Video defaults to the explicit "best" option,
 * then to the highest measured tier. Audio keeps the existing behavior of
 * preferring the highest named bitrate over the generic best option.
 */
export function getDefaultQualityValue(qualities: Quality[], format: DownloadFormat): string {
  if (qualities.length === 0) return '';

  if (format === 'mp3') {
    const specific = qualities
      .filter(quality => quality.value !== 'best')
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    return specific[0]?.value ?? qualities[0].value;
  }

  const best = qualities.find(quality => quality.value === 'best');
  if (best) return best.value;

  const highest = [...qualities].sort((a, b) => {
    const tierDifference = (getQualityTier(b) ?? 0) - (getQualityTier(a) ?? 0);
    if (tierDifference !== 0) return tierDifference;
    return (b.fps ?? 0) - (a.fps ?? 0);
  })[0];

  return highest?.value ?? '';
}
