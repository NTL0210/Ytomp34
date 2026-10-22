import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { AppUpdateResponse, AppUpdateStatus } from '../types/app-update';

export const AppUpdate: React.FC = () => {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.electronAPI.getUpdateStatus()
      .then((response) => {
        if (mounted) setStatus(response.data);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setStatus({
          state: 'error',
          currentVersion: 'unknown',
          error: error instanceof Error ? error.message : 'Unable to read update status.',
        });
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
        error: error instanceof Error ? error.message : 'Update action failed.',
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

  const isBusyState = status?.state === 'checking' || status?.state === 'downloading';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">Application updates</h3>
          <p className="mt-0.5 text-[11px] text-faint">
            Installed version {status?.currentVersion || '…'}
          </p>
        </div>

        {isBusyState && (
          <Loader2
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {(status?.state === 'up-to-date' || status?.state === 'downloaded') && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        )}
        {status?.state === 'error' && (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        )}
      </div>

      <p
        className={`break-words text-[11px] leading-5 ${
          status?.state === 'error' ? 'text-danger' : 'text-muted'
        }`}
      >
        {message}
      </p>

      {status?.state === 'available' && status.releaseNotes && (
        <div className="max-h-28 overflow-y-auto scrollbar-thin whitespace-pre-wrap break-words rounded-md bg-surface-2 px-3 py-2.5 text-[11px] leading-5 text-muted">
          {status.releaseNotes}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(status?.state === 'idle' || status?.state === 'up-to-date' || status?.state === 'error') && (
          <button
            type="button"
            onClick={() => void runAction(window.electronAPI.checkForAppUpdate)}
            disabled={isWorking}
            className="btn btn-secondary h-8 px-3 text-[11px]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isWorking ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden="true"
            />
            Check for updates
          </button>
        )}

        {status?.state === 'available' && (
          <button
            type="button"
            onClick={() => void runAction(window.electronAPI.downloadAppUpdate)}
            disabled={isWorking}
            className="btn btn-primary h-8 px-3 text-[11px]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download update
          </button>
        )}

        {status?.state === 'downloaded' && (
          <button
            type="button"
            onClick={() => void runAction(window.electronAPI.installAppUpdate)}
            disabled={isWorking}
            className="btn btn-primary h-8 px-3 text-[11px]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restart &amp; install
          </button>
        )}
      </div>
    </div>
  );
};
