/**
 * Settings dialog: download location, concurrency, and update controls.
 */

import React, { useEffect, useState } from 'react';
import { Folder, Loader2, Settings2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';
import { AppUpdate } from './AppUpdate';
import { Modal } from './Modal';

export const Settings: React.FC = () => {
  const { settings } = useAppStore();
  const { selectFolder, updateSettings } = useIPC();
  const [isOpen, setIsOpen] = useState(false);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const [concurrency, setConcurrency] = useState(settings.concurrentLimit);

  useEffect(() => {
    setConcurrency(settings.concurrentLimit);
  }, [settings.concurrentLimit]);

  const handleConcurrentLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setConcurrency(value);
    void updateSettings({ concurrentLimit: value });
  };

  const handleSelectFolder = async () => {
    setIsSelectingFolder(true);
    try {
      await selectFolder();
    } finally {
      setIsSelectingFolder(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost h-8 px-2.5"
        aria-label="Settings"
        title="Settings"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Settings</span>
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Settings"
        description="Download location, concurrency, and updates."
        icon={<Settings2 className="h-4 w-4 text-muted" aria-hidden="true" />}
      >
        <div className="space-y-5">
          <section aria-labelledby="settings-location-title">
            <h3 id="settings-location-title" className="text-[13px] font-semibold text-ink">
              Download location
            </h3>
            <p className="mt-0.5 text-[11px] leading-5 text-muted">
              New files are saved to this folder.
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5">
                <Folder className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                <span
                  className="truncate font-mono text-[11px] text-ink"
                  title={settings.downloadDirectory || undefined}
                >
                  {settings.downloadDirectory || 'No folder selected'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleSelectFolder()}
                disabled={isSelectingFolder}
                className="btn btn-secondary h-9 shrink-0"
              >
                {isSelectingFolder && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                )}
                {isSelectingFolder ? 'Opening' : 'Change'}
              </button>
            </div>
          </section>

          <section aria-labelledby="settings-concurrency-title">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="settings-concurrency-title" className="text-[13px] font-semibold text-ink">
                Concurrent downloads
              </h3>
              <span className="text-[12px] font-medium tabular-nums text-ink">
                {concurrency}
              </span>
            </div>
            <p
              id="settings-concurrency-description"
              className="mt-0.5 text-[11px] leading-5 text-muted"
            >
              Files downloaded at the same time. Higher values use more bandwidth.
            </p>
            <input
              id="settings-concurrency"
              type="range"
              min="1"
              max="10"
              step="1"
              value={concurrency}
              onChange={handleConcurrentLimitChange}
              className="mt-3 h-1.5 w-full cursor-pointer accent-accent"
              aria-labelledby="settings-concurrency-title"
              aria-describedby="settings-concurrency-description"
            />
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-faint">
              <span>1</span>
              <span>10</span>
            </div>
            <p className="mt-1 text-[10px] text-faint">Changes save automatically.</p>
          </section>

          <section className="border-t border-border pt-5" aria-label="Application updates">
            <AppUpdate />
          </section>

          <p className="border-t border-border pt-4 text-[10px] leading-4 text-faint">
            Downloads are processed locally with yt-dlp and ffmpeg.
          </p>
        </div>
      </Modal>
    </>
  );
};
