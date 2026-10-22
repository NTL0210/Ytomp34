/**
 * Primary URL entry and metadata fetch action.
 */

import React, { useRef, useState } from 'react';
import { AlertCircle, Link2, Loader2, Search, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const URLInput: React.FC = () => {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentVideo, isLoading } = useAppStore();
  const { fetchVideoInfo } = useIPC();

  const isValidUrl = (urlString: string): boolean => {
    if (!urlString.trim()) return false;

    try {
      new URL(urlString.trim());
      return true;
    } catch {
      return false;
    }
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
    if (urlError) setUrlError(null);
  };

  const handleFetch = async () => {
    if (!isValidUrl(url)) {
      setUrlError('Please enter a valid URL.');
      return;
    }

    setUrlError(null);
    await fetchVideoInfo(url.trim());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isLoading) return;
    event.preventDefault();
    void handleFetch();
  };

  const handleClear = () => {
    setUrl('');
    setUrlError(null);
    inputRef.current?.focus();
  };

  const isValid = isValidUrl(url);

  return (
    <div className="space-y-2">
      <label htmlFor="media-url" className="sr-only">
        Media URL
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Link2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="media-url"
            type="text"
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            title={url || undefined}
            placeholder="Paste a video or audio URL"
            className={`field h-10 pl-9 ${url ? 'pr-9' : ''} ${
              urlError ? 'border-danger focus:border-danger focus:ring-danger/20' : ''
            }`}
            disabled={isLoading}
            aria-invalid={Boolean(urlError)}
            aria-describedby={urlError ? 'media-url-error' : 'media-url-hint'}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />

          {url && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="icon-btn absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              aria-label="Clear URL"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleFetch()}
          disabled={!isValid || isLoading}
          className={`btn h-10 shrink-0 px-4 sm:min-w-[122px] ${
            currentVideo ? 'btn-secondary' : 'btn-primary'
          }`}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {isLoading ? 'Fetching' : 'Fetch info'}
        </button>
      </div>

      {urlError ? (
        <p
          id="media-url-error"
          role="alert"
          className="flex items-center gap-1.5 text-[11px] text-danger"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {urlError}
        </p>
      ) : (
        <p id="media-url-hint" className="sr-only">
          Paste a video or audio URL, then press Enter to fetch details.
        </p>
      )}
    </div>
  );
};
