/**
 * Main App Component
 * Composes all components with minimalist layout
 * Applies theme classes and displays error notifications
 * Validates: Requirements 13.3, 13.4, 14.3, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useEffect } from 'react';
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
  const { error, setError } = useAppStore();
  const { getSettings } = useIPC();

  // Load settings on mount with error handling
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Clear any existing errors first
        setError(null);
        await getSettings();
        // Ensure error is cleared after successful load
        setError(null);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setError({ 
          type: 'unknown', 
          message: `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    };
    
    loadSettings();
  }, [getSettings]); // Now getSettings is memoized with useCallback

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src="./icon.png" alt="" className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0" />
            <h1 className="truncate text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              Ytomp34
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Donation />
            <Settings />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Error notification */}
        {error && (
          <ErrorNotification
            error={{
              ...getErrorDisplay(error.type),
              message: error.message || getErrorDisplay(error.type).message
            }}
            onDismiss={() => setError(null)}
          />
        )}

        {/* URL Input */}
        <section>
          <URLInput />
        </section>

        <section>
          <BatchDownload />
        </section>

        {/* Video Info */}
        <section>
          <VideoInfo />
        </section>

        {/* Format Selector */}
        <section>
          <FormatSelector />
        </section>

        {/* Download Queue */}
        <section>
          <DownloadQueue />
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Powered by yt-dlp</p>
      </footer>
    </div>
  );
};
