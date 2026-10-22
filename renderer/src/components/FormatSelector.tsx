/**
 * Format and quality selection for the media currently loaded.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileVideo,
  Loader2,
  Music,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';
import { getDefaultQualityValue } from '../utils/qualitySelection';

type DownloadFormat = 'mp4' | 'mp3';

export const FormatSelector: React.FC = () => {
  const { currentVideo, isLoading } = useAppStore();
  const { startDownload } = useIPC();

  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat>('mp4');
  const [selectedQuality, setSelectedQuality] = useState<string>('');

  const formats = currentVideo?.availableFormats ?? [];
  const availableQualities = formats.find(format => format.type === selectedFormat)?.qualities ?? [];
  const hasMp4 = formats.some(format => format.type === 'mp4' && format.qualities.length > 0);
  const hasMp3 = formats.some(format => format.type === 'mp3' && format.qualities.length > 0);

  // If a source only exposes one output type, select the type that can work.
  useEffect(() => {
    if (!currentVideo) return;

    const usableFormats = currentVideo.availableFormats.filter(format => format.qualities.length > 0);
    if (usableFormats.length === 0) return;

    if (!usableFormats.some(format => format.type === selectedFormat)) {
      setSelectedFormat(usableFormats[0].type);
    }
  }, [currentVideo, selectedFormat]);

  // Reset to the best available quality whenever the source or format changes.
  useEffect(() => {
    const qualities = currentVideo?.availableFormats.find(
      format => format.type === selectedFormat
    )?.qualities ?? [];

    if (qualities.length === 0) {
      setSelectedQuality('');
      return;
    }

    setSelectedQuality(getDefaultQualityValue(qualities, selectedFormat));
  }, [selectedFormat, currentVideo]);

  const handleDownload = async () => {
    if (!currentVideo || !selectedQuality) return;

    await startDownload(
      currentVideo.url,
      currentVideo.title,
      selectedFormat,
      selectedQuality
    );
  };

  if (!currentVideo) return null;

  const hasAnyFormats = formats.some(format => format.qualities.length > 0);
  const canDownload = Boolean(selectedQuality) && !isLoading && hasAnyFormats;

  return (
    <div className="border-t border-border p-4">
      <h3 className="text-[12px] font-semibold text-ink">Download options</h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <fieldset disabled={!hasAnyFormats}>
          <legend className="section-label">Format</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedFormat('mp4')}
              aria-pressed={selectedFormat === 'mp4'}
              disabled={!hasMp4}
              title={hasMp4 ? 'Download as MP4 video' : 'No MP4 video format is available'}
              className={`flex h-9 items-center justify-center gap-2 rounded-md border text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 ${
                selectedFormat === 'mp4'
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-muted hover:border-border-strong hover:text-ink'
              }`}
            >
              <FileVideo className="h-3.5 w-3.5" aria-hidden="true" />
              Video
              <span className="text-[10px] font-medium opacity-70">MP4</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFormat('mp3')}
              aria-pressed={selectedFormat === 'mp3'}
              disabled={!hasMp3}
              title={hasMp3 ? 'Download as MP3 audio' : 'No MP3 audio format is available'}
              className={`flex h-9 items-center justify-center gap-2 rounded-md border text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 ${
                selectedFormat === 'mp3'
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-muted hover:border-border-strong hover:text-ink'
              }`}
            >
              <Music className="h-3.5 w-3.5" aria-hidden="true" />
              Audio
              <span className="text-[10px] font-medium opacity-70">MP3</span>
            </button>
          </div>
        </fieldset>

        <div>
          <label htmlFor="download-quality" className="section-label">
            Quality
          </label>
          <div className="relative mt-1.5">
            <select
              id="download-quality"
              value={selectedQuality}
              onChange={event => setSelectedQuality(event.target.value)}
              className="select-field h-9"
              disabled={availableQualities.length === 0}
            >
              {availableQualities.length === 0 ? (
                <option value="">No qualities available</option>
              ) : (
                availableQualities.map(quality => (
                  <option key={quality.value} value={quality.value}>
                    {quality.label}
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {hasAnyFormats ? (
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!canDownload}
          className="btn btn-primary mt-3 h-10 w-full"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isLoading ? 'Working' : `Download ${selectedFormat.toUpperCase()}`}
        </button>
      ) : (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[11px] leading-5 text-warning"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>No downloadable video or audio formats were found for this link.</span>
        </div>
      )}
    </div>
  );
};
