/**
 * Compact summary of the media whose metadata was successfully retrieved.
 */

import React, { useEffect, useState } from 'react';
import { Clock3, Film } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [hours, minutes, secs]
    .map(value => value.toString().padStart(2, '0'))
    .join(':');
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const VideoInfo: React.FC = () => {
  const { currentVideo } = useAppStore();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [currentVideo?.thumbnailUrl]);

  if (!currentVideo) return null;

  const title = currentVideo.title || 'Untitled media';
  const hostname = getHostname(currentVideo.url);
  const formats = currentVideo.availableFormats
    .filter(format => format.qualities.length > 0)
    .map(format => format.type.toUpperCase());
  const hasThumbnail = Boolean(currentVideo.thumbnailUrl) && !thumbnailFailed;

  return (
    <div className="flex flex-col gap-3.5 p-4 sm:flex-row">
      <div className="relative w-full shrink-0 overflow-hidden rounded-md border border-border bg-surface-2 sm:w-[140px]">
        <div className="aspect-video">
          {hasThumbnail ? (
            <img
              src={currentVideo.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-faint">
              <Film className="h-6 w-6" aria-hidden="true" />
            </div>
          )}
        </div>

        {currentVideo.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {formatDuration(currentVideo.duration)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2
          className="line-clamp-2 text-[14px] font-semibold leading-5 text-ink"
          title={title}
        >
          {title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {hostname && (
            <span className="max-w-full truncate" title={currentVideo.url}>
              {hostname}
            </span>
          )}
          {currentVideo.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {formatDuration(currentVideo.duration)}
            </span>
          )}
          <span>
            {formats.length > 0 ? `${formats.join(' · ')} available` : 'No formats detected'}
          </span>
        </div>
      </div>
    </div>
  );
};
