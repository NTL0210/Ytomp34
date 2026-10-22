/**
 * Main application shell.
 * Keeps the existing component contracts and IPC behavior while presenting the
 * download workflow as a single, focused desktop workspace.
 */

import React, { useEffect, useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { useIPC } from './hooks/useIPC';
import { ThemeToggle } from './components/ThemeToggle';
import { URLInput } from './components/URLInput';
import { BatchDownload } from './components/BatchDownload';
import { VideoInfo } from './components/VideoInfo';
import { FormatSelector } from './components/FormatSelector';
import { DownloadQueue } from './components/DownloadQueue';
import { Settings } from './components/Settings';
import { Donation } from './components/Donation';
import { ErrorNotification } from './components/ErrorNotification';
import { getErrorDisplay } from './constants/errorMessages';

export const App: React.FC = () => {
  const { currentVideo, error, setError } = useAppStore();
  const { getSettings } = useIPC();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Load settings without hiding the window behind a permanent failure screen.
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setError(null);
        await getSettings();
        if (!cancelled) setError(null);
      } catch (loadError) {
        console.error('Failed to load settings:', loadError);
        if (!cancelled) {
          setError({
            type: 'unknown',
            message: `Failed to load settings: ${
              loadError instanceof Error ? loadError.message : 'Unknown error'
            }`,
          });
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [getSettings, setError]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="./icon.png" alt="" className="h-7 w-7 shrink-0" />
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              Ytomp34
            </span>
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <Donation />
            <div className="mx-1.5 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <Settings />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isBootstrapping ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <img src="./icon.png" alt="" className="h-9 w-9 opacity-80" />
            <div className="flex items-center gap-2 text-[12px]" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              Loading workspace
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1240px] px-4 pb-4 pt-5 sm:px-6">
            <div className="grid grid-cols-1 items-start gap-4 min-[860px]:grid-cols-[minmax(0,1fr)_370px] min-[1180px]:grid-cols-[minmax(0,1fr)_410px] min-[860px]:gap-5">
              <div className="min-w-0 space-y-4">
                {error && (
                  <ErrorNotification
                    error={{
                      ...getErrorDisplay(error.type),
                      message: error.message || getErrorDisplay(error.type).message,
                    }}
                    onDismiss={() => setError(null)}
                  />
                )}

                <section className="panel px-4 py-4 sm:px-5" aria-labelledby="add-media-title">
                  <div className="mb-2.5">
                    <p className="section-label">New download</p>
                    <h1
                      id="add-media-title"
                      className="mt-1 text-[15px] font-semibold leading-5 tracking-[-0.01em]"
                    >
                      Add a media link
                    </h1>
                  </div>

                  <URLInput />
                  <BatchDownload />
                </section>

                {currentVideo ? (
                  <section className="panel overflow-hidden" aria-label="Selected media">
                    <VideoInfo />
                    <FormatSelector />
                  </section>
                ) : (
                  <section
                    className="flex items-start gap-3 rounded-lg border border-dashed border-border px-4 py-5"
                    aria-label="Media details"
                  >
                    <Film className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">No media selected</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-muted">
                        Paste a link above to load its details and download options.
                      </p>
                    </div>
                  </section>
                )}
              </div>

              <aside className="min-w-0 min-[860px]:sticky min-[860px]:top-5">
                <DownloadQueue />
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
