import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react';
import type { AppUpdateResponse, AppUpdateStatus } from '../types/app-update';

export const AppUpdate: React.FC = () => {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.electronAPI.getUpdateStatus().then((response) => {
      if (mounted) {
        setStatus(response.data);
      }
    });

    const unsubscribe = window.electronAPI.onUpdateStatus((nextStatus) => {
      setStatus(nextStatus);
      setIsWorking(nextStatus.state === 'checking' || nextStatus.state === 'downloading');
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const runAction = useCallback(async (action: () => Promise<AppUpdateResponse>) => {
    setIsWorking(true);
    try {
      const response = await action();
      setStatus(response.data);
    } catch (error) {
      setStatus((current) => ({
        state: 'error',
        currentVersion: current?.currentVersion || 'unknown',
        error: error instanceof Error ? error.message : 'Update action failed.'
      }));
    } finally {
      setIsWorking(false);
    }
  }, []);

  const message = (() => {
    switch (status?.state) {
      case 'development':
        return 'Update checks are enabled in installed builds.';
      case 'unsupported':
        return status.error || 'Automatic updates are currently supported on Windows only.';
      case 'checking':
        return 'Checking the official release channel…';
      case 'up-to-date':
        return 'You are using the latest published version.';
      case 'available':
        return `Version ${status.latestVersion} is available. Review it before downloading.`;
      case 'downloading':
        return 'Downloading the update in the background…';
      case 'downloaded':
        return status.error || 'The update is ready. Restart only when your downloads are finished.';
      case 'error':
        return status.error || 'Unable to update right now.';
      default:
        return 'Updates are checked only when you request them.';
    }
  })();

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Application Updates
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Current version: {status?.currentVersion || '…'}
          </p>
        </div>

        {(status?.state === 'up-to-date' || status?.state === 'downloaded') && (
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        )}
        {status?.state === 'error' && (
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        )}
      </div>

      <p className={`text-xs ${status?.error ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
        {message}
      </p>

      {status?.state === 'available' && status.releaseNotes && (
        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-xs text-gray-600 dark:text-gray-300">
          {status.releaseNotes}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(status?.state === 'idle' || status?.state === 'up-to-date' || status?.state === 'error') && (
          <button
            onClick={() => runAction(window.electronAPI.checkForAppUpdate)}
            disabled={isWorking}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isWorking ? 'animate-spin' : ''}`} />
            Check for updates
          </button>
        )}

        {status?.state === 'available' && (
          <button
            onClick={() => runAction(window.electronAPI.downloadAppUpdate)}
            disabled={isWorking}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download update
          </button>
        )}

        {status?.state === 'downloaded' && (
          <button
            onClick={() => runAction(window.electronAPI.installAppUpdate)}
            disabled={isWorking}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Restart &amp; install
          </button>
        )}
      </div>
    </div>
  );
};
