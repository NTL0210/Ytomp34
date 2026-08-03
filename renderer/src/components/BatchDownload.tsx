import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, ListPlus, ListVideo, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  BATCH_METADATA_CONCURRENCY,
  mapWithConcurrency,
  MAX_BATCH_URLS,
  parseBatchUrls
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
  const [message, setMessage] = useState<string | null>(null);

  const successfulResults = useMemo(
    () => results.filter((result): result is BatchResult & { video: BatchVideo } => Boolean(result.video)),
    [results]
  );

  const handleAnalyze = async () => {
    const parsed = parseBatchUrls(input);
    setMessage(null);

    if (parsed.invalidEntries.length > 0) {
      setMessage(`Remove ${parsed.invalidEntries.length} invalid URL(s) before continuing.`);
      return;
    }

    if (parsed.exceedsLimit) {
      setMessage(`A batch can contain at most ${MAX_BATCH_URLS} URLs.`);
      return;
    }

    if (parsed.urls.length === 0) {
      setMessage('Paste at least one valid URL.');
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
              error: response.error?.message || 'Could not fetch video information'
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
      setMessage(
        failedCount > 0
          ? `${fetched.length - failedCount} ready, ${failedCount} failed.${duplicateMessage}`
          : `${fetched.length} video(s) ready.${duplicateMessage}`
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleImportPlaylist = async () => {
    const parsed = parseBatchUrls(input);
    setMessage(null);

    if (parsed.invalidEntries.length > 0 || parsed.urls.length !== 1) {
      setMessage('Paste exactly one valid playlist URL to import a playlist.');
      return;
    }

    setIsFetching(true);
    setResults([]);
    setSelectedUrls(new Set());

    try {
      const response = await window.electronAPI.fetchPlaylistInfo(parsed.urls[0]);
      if (!response.success || !response.data) {
        setMessage(response.error?.message || 'Could not import this playlist.');
        return;
      }

      const playlistResults: BatchResult[] = response.data.entries.map(entry => ({
        sourceUrl: entry.url,
        video: entry
      }));
      setResults(playlistResults);
      setSelectedUrls(new Set(playlistResults.map(result => result.sourceUrl)));
      setMessage(
        response.data.truncated
          ? `Playlist “${response.data.title}”: showing ${playlistResults.length} of ${response.data.totalEntries} videos.`
          : `Playlist “${response.data.title}”: ${playlistResults.length} video(s) ready.`
      );
    } catch {
      setMessage('Could not import this playlist.');
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
      setMessage('Select at least one video.');
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
        failedCount > 0 ? `${failedCount} failed` : null
      ].filter(Boolean).join(', ');
      setMessage(`${details}.`);

      if (failedCount > 0) {
        setError({ type: 'unknown', message: 'Some batch items could not be added to the queue.' });
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-gray-900 dark:text-gray-100"
      >
        <span className="flex items-center gap-2 font-medium">
          <ListPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Batch URLs
        </span>
        {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Paste one URL per line (maximum {MAX_BATCH_URLS}), or one playlist URL
            </label>
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={5}
              disabled={isFetching || isAdding}
              placeholder={'https://example.com/video-1\nhttps://example.com/video-2'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isFetching || isAdding || isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
              {isFetching ? 'Working...' : 'Analyze URLs'}
            </button>
            <button
              type="button"
              onClick={handleImportPlaylist}
              disabled={isFetching || isAdding || isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <ListVideo className="w-4 h-4" />
              Import Playlist
            </button>
          </div>

          {message && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto scrollbar-thin space-y-2 pr-1">
                {results.map(result => (
                  <div
                    key={result.sourceUrl}
                    className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    {result.video ? (
                      <>
                        <input
                          type="checkbox"
                          checked={selectedUrls.has(result.sourceUrl)}
                          onChange={() => toggleSelection(result.sourceUrl)}
                          className="mt-1 w-4 h-4 accent-blue-600"
                          aria-label={`Select ${result.video.title}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {result.video.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDuration(result.video.duration)}
                          </p>
                        </div>
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                      </>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.sourceUrl}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {successfulResults.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Format for selected videos
                    </label>
                    <select
                      value={format}
                      onChange={event => setFormat(event.target.value as 'mp4' | 'mp3')}
                      disabled={isAdding}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    >
                      <option value="mp4">MP4 — Best quality</option>
                      <option value="mp3">MP3 — Best quality</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    disabled={isAdding || selectedUrls.size === 0}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isAdding ? 'Adding...' : `Add ${selectedUrls.size} to Queue`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
