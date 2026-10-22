/**
 * Download queue with active and history views.
 */

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, History, Inbox, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';
import { DownloadItem } from './DownloadItem';
import { Modal } from './Modal';

export const DownloadQueue: React.FC = () => {
  const { downloadQueue } = useAppStore();
  const { clearCompleted, deleteCompletedFiles } = useIPC();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const historyTabRef = useRef<HTMLButtonElement>(null);

  const activeTasks = useMemo(
    () => downloadQueue.filter(task => task.status !== 'completed'),
    [downloadQueue]
  );
  const historyTasks = useMemo(
    () => downloadQueue
      .filter(task => task.status === 'completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [downloadQueue]
  );

  const downloadingCount = activeTasks.filter(task => task.status === 'downloading').length;
  const queuedCount = activeTasks.filter(task => task.status === 'pending').length;
  const summaryParts = [
    downloadingCount > 0 ? `${downloadingCount} downloading` : '',
    queuedCount > 0 ? `${queuedCount} queued` : '',
  ].filter(Boolean);
  const queueSummary = summaryParts.length > 0
    ? summaryParts.join(' · ')
    : activeTasks.length > 0
      ? `${activeTasks.length} in queue`
      : 'Nothing in progress';

  const visibleTasks = activeTab === 'active' ? activeTasks : historyTasks;

  const handleClearHistory = async () => {
    await clearCompleted();
  };

  const handleDeleteFiles = async () => {
    await deleteCompletedFiles();
    setShowDeleteConfirm(false);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const nextTab = activeTab === 'active' ? 'history' : 'active';
    setActiveTab(nextTab);
    (nextTab === 'active' ? activeTabRef : historyTabRef).current?.focus();
  };

  const emptyTitle = downloadQueue.length === 0
    ? 'Queue is empty'
    : activeTab === 'active'
      ? 'No active downloads'
      : 'No completed downloads';
  const emptyMessage = downloadQueue.length === 0
    ? 'Downloads you start will appear here.'
    : activeTab === 'active'
      ? 'Completed items are available in History.'
      : 'Finished downloads will be listed here.';

  return (
    <section
      className="panel flex flex-col overflow-hidden min-[860px]:h-[calc(100vh-6.25rem)]"
      aria-labelledby="queue-title"
    >
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 id="queue-title" className="text-[13px] font-semibold leading-5 text-ink">
            Queue
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">{queueSummary}</p>
        </div>
      </div>

      <div
        className="flex items-center gap-5 border-b border-border px-4"
        role="tablist"
        aria-label="Queue views"
      >
        <button
          ref={activeTabRef}
          id="queue-active-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'active'}
          aria-controls="queue-panel"
          tabIndex={activeTab === 'active' ? 0 : -1}
          onClick={() => setActiveTab('active')}
          onKeyDown={handleTabKeyDown}
          className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            activeTab === 'active'
              ? 'border-accent text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Active
          <span className="tabular-nums text-[10px] text-faint">{activeTasks.length}</span>
        </button>

        <button
          ref={historyTabRef}
          id="queue-history-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          aria-controls="queue-panel"
          tabIndex={activeTab === 'history' ? 0 : -1}
          onClick={() => setActiveTab('history')}
          onKeyDown={handleTabKeyDown}
          className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            activeTab === 'history'
              ? 'border-accent text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          History
          <span className="tabular-nums text-[10px] text-faint">{historyTasks.length}</span>
        </button>
      </div>

      {activeTab === 'history' && historyTasks.length > 0 && (
        <div className="flex items-center justify-end gap-1 border-b border-border bg-surface-2/40 px-2 py-1.5">
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            className="btn btn-ghost h-7 px-2 text-[11px]"
            title="Clear history records (keeps downloaded files)"
          >
            <History className="h-3 w-3" aria-hidden="true" />
            Clear history
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="btn btn-ghost-danger h-7 px-2 text-[11px]"
            title="Permanently delete downloaded files and clear history"
            aria-haspopup="dialog"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Delete files
          </button>
        </div>
      )}

      <div
        id="queue-panel"
        role="tabpanel"
        aria-labelledby={activeTab === 'active' ? 'queue-active-tab' : 'queue-history-tab'}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        {visibleTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 py-10 text-center">
            <Inbox className="h-5 w-5 text-faint" aria-hidden="true" />
            <p className="mt-2 text-[12px] font-medium text-ink">{emptyTitle}</p>
            <p className="mt-0.5 max-w-[230px] text-[11px] leading-5 text-muted">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div role="list" className="divide-y divide-border">
            {visibleTasks.map(task => (
              <div role="listitem" key={task.id}>
                <DownloadItem task={task} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete downloaded files?"
        description="This action cannot be undone."
        icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />}
        size="sm"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteFiles()}
              className="btn btn-danger"
            >
              Delete files
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-5 text-muted">
          This permanently deletes{' '}
          <strong className="font-semibold text-ink">
            {historyTasks.length} downloaded {historyTasks.length === 1 ? 'file' : 'files'}
          </strong>{' '}
          from disk and removes {historyTasks.length === 1 ? 'it' : 'them'} from history.
        </p>
      </Modal>
    </section>
  );
};
