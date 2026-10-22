import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ListPlus,
  ListVideo,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  BATCH_METADATA_CONCURRENCY,
  mapWithConcurrency,
  MAX_BATCH_URLS,
  parseBatchUrls,
} from '../utils/batch';

interface BatchVideo {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly duration: number;
}

interface BatchResult {
  sourceUrl: string;
  video?: BatchVideo;
  error?: string;
}

interface BatchMessage {
  text: string;
  tone: 'info' | 'error';
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [hours, minutes, secs]
    .map(value => value.toString().padStart(2, '0'))
    .join(':');
}

export const BatchDownload: React.FC = () => {
  const { downloadQueue, isLoading, setError } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [results, setResults] = useState<BatchResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [isFetching, setIsFetching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<BatchMessage | null>(null);

  const successfulResults = useMemo(
    () => results.filter((result): result is BatchResult & { video: BatchVideo } => Boolean(result.video)),
    [results]
  );

  const handleAnalyze = async () => {
    const parsed = parseBatchUrls(input);
    setMessage(null);

    if (parsed.invalidEntries.length > 0) {
      setMessage({
        text: `Remove ${parsed.invalidEntries.length} invalid URL(s) before continuing.`,
        tone: 'error',
      });
      return;
    }

    if (parsed.exceedsLimit) {
      setMessage({
        text: `A batch can contain at most ${MAX_BATCH_URLS} URLs.`,
        tone: 'error',
      });
      return;
    }

    if (parsed.urls.length === 0) {
      setMessage({ text: 'Paste at least one valid URL.', tone: 'error' });
      return;
    }

    setIsFetching(true);
    setResults([]);
    setSelectedUrls(new Set());

    try {
      const fetched = await mapWithConcurrency(
        parsed.urls,
        BATCH_METADATA_CONCURRENCY,
        async (url): Promise<BatchResult> => {
          try {
            const response = await window.electronAPI.fetchVideoInfo(url);
            if (response.success && response.data) {
              return { sourceUrl: url, video: response.data };
            }

            return {
              sourceUrl: url,
              error: response.error?.message || 'Could not fetch video information',
            };
          } catch {
            return { sourceUrl: url, error: 'Could not fetch video information' };
          }
        }
      );

      setResults(fetched);
      setSelectedUrls(new Set(
        fetched.filter(result => result.video).map(result => result.sourceUrl)
      ));

      const failedCount = fetched.filter(result => result.error).length;
      const duplicateMessage = parsed.duplicateCount > 0
        ? ` ${parsed.duplicateCount} duplicate URL(s) were ignored.`
        : '';
      setMessage({
        text: failedCount > 0
          ? `${fetched.length - failedCount} ready, ${failedCount} failed.${duplicateMessage}`
          : `${fetched.length} video(s) ready.${duplicateMessage}`,
        tone: failedCount > 0 ? 'error' : 'info',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleImportPlaylist = async () => {
    const parsed = parseBatchUrls(input);
    setMessage(null);

    if (parsed.invalidEntries.length > 0 || parsed.urls.length !== 1) {
      setMessage({
        text: 'Paste exactly one valid playlist URL to import a playlist.',
        tone: 'error',
      });
      return;
    }

    setIsFetching(true);
    setResults([]);
    setSelectedUrls(new Set());

    try {
      const response = await window.electronAPI.fetchPlaylistInfo(parsed.urls[0]);
      if (!response.success || !response.data) {
        setMessage({
          text: response.error?.message || 'Could not import this playlist.',
          tone: 'error',
        });
        return;
      }

      const playlistResults: BatchResult[] = response.data.entries.map(entry => ({
        sourceUrl: entry.url,
        video: entry,
      }));
      setResults(playlistResults);
      setSelectedUrls(new Set(playlistResults.map(result => result.sourceUrl)));
      setMessage({
        text: response.data.truncatedWarning
          ? response.data.truncatedWarning
          : response.data.truncated
            ? `Playlist “${response.data.title}”: showing ${playlistResults.length} of ${response.data.totalEntries} videos.`
            : `Playlist “${response.data.title}”: ${playlistResults.length} video(s) ready.`,
        tone: response.data.truncatedWarning ? 'error' : 'info',
      });
    } catch {
      setMessage({ text: 'Could not import this playlist.', tone: 'error' });
    } finally {
      setIsFetching(false);
    }
  };

  const toggleSelection = (url: string) => {
    setSelectedUrls(current => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleAddToQueue = async () => {
    const selected = successfulResults.filter(result => selectedUrls.has(result.sourceUrl));
    if (selected.length === 0) {
      setMessage({ text: 'Select at least one video.', tone: 'error' });
      return;
    }

    setIsAdding(true);
    setError(null);
    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      for (const result of selected) {
        const video = result.video;
        const alreadyQueued = downloadQueue.some(task => task.url === video.url);

        if (alreadyQueued) {
          skippedCount += 1;
          continue;
        }

        try {
          const response = await window.electronAPI.startDownload(
            video.url,
            video.title,
            format,
            'best'
          );

          if (response.success) addedCount += 1;
          else failedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      setSelectedUrls(current => {
        const next = new Set(current);
        selected.forEach(result => next.delete(result.sourceUrl));
        return next;
      });

      const details = [
        `${addedCount} added`,
        skippedCount > 0 ? `${skippedCount} already in queue` : null,
        failedCount > 0 ? `${failedCount} failed` : null,
      ].filter(Boolean).join(', ');
      setMessage({ text: `${details}.`, tone: failedCount > 0 ? 'error' : 'info' });

      if (failedCount > 0) {
        setError({ type: 'unknown', message: 'Some batch items could not be added to the queue.' });
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section className="mt-3 border-t border-border">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        aria-expanded={isOpen}
        aria-controls="batch-download-panel"
      >
        <ListPlus className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
        <span className="text-[12px] font-medium text-muted">Batch or playlist</span>
        <span className="ml-auto hidden text-[10px] text-faint sm:inline">
          Up to {MAX_BATCH_URLS} links
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-faint transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div id="batch-download-panel" className="space-y-3 pb-1 pt-1">
          <div>
            <label htmlFor="batch-urls" className="sr-only">
              Batch URLs, one per line
            </label>
            <textarea
              id="batch-urls"
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={4}
              disabled={isFetching || isAdding}
              placeholder={'https://example.com/video-1\nhttps://example.com/video-2'}
              className="field h-auto min-h-[88px] resize-y py-2 leading-5"
            />
            <p className="mt-1 text-[10px] text-faint">
              One URL per line, or one playlist URL. Maximum {MAX_BATCH_URLS}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={isFetching || isAdding || isLoading}
              className="btn btn-secondary h-8 px-3 text-[11px]"
            >
              {isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              )}
              {isFetching ? 'Working' : 'Analyze links'}
            </button>
            <button
              type="button"
              onClick={() => void handleImportPlaylist()}
              disabled={isFetching || isAdding || isLoading}
              className="btn btn-ghost h-8 px-3 text-[11px]"
            >
              <ListVideo className="h-3.5 w-3.5" aria-hidden="true" />
              Import playlist
            </button>
          </div>

          {message && (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={`break-words text-[11px] leading-5 ${
                message.tone === 'error' ? 'text-danger' : 'text-muted'
              }`}
            >
              {message.text}
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="section-label">Results</p>
              <div className="max-h-[220px] divide-y divide-border overflow-y-auto scrollbar-thin rounded-md border border-border">
                {results.map(result => (
                  <div key={result.sourceUrl} className="flex items-start gap-2.5 px-3 py-2">
                    {result.video ? (
                      <>
                        <input
                          type="checkbox"
                          checked={selectedUrls.has(result.sourceUrl)}
                          onChange={() => toggleSelection(result.sourceUrl)}
                          className="checkbox-field mt-0.5"
                          aria-label={`Select ${result.video.title}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-[12px] font-medium text-ink"
                            title={result.video.title}
                          >
                            {result.video.title}
                          </p>
                          <p className="mt-0.5 text-[10px] tabular-nums text-faint">
                            {formatDuration(result.video.duration)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="break-words text-[11px] leading-4 text-danger">{result.error}</p>
                          <p
                            className="mt-0.5 truncate text-[10px] text-faint"
                            title={result.sourceUrl}
                          >
                            {result.sourceUrl}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {successfulResults.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="batch-format" className="section-label">
                      Batch format
                    </label>
                    <div className="relative mt-1">
                      <select
                        id="batch-format"
                        value={format}
                        onChange={event => setFormat(event.target.value as 'mp4' | 'mp3')}
                        disabled={isAdding}
                        className="select-field h-9"
                      >
                        <option value="mp4">MP4 — best quality</option>
                        <option value="mp3">MP3 — best quality</option>
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddToQueue()}
                    disabled={isAdding || selectedUrls.size === 0}
                    className="btn btn-secondary h-9 shrink-0"
                  >
                    {isAdding && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    )}
                    {isAdding ? 'Adding' : `Add ${selectedUrls.size} to queue`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
