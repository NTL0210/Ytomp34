/**
 * A single queue row. Shows only data supplied by the download task and keeps
 * platform-specific actions accurate (pause/resume are not available on Windows).
 */

import React from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useIPC } from '../hooks/useIPC';

interface DownloadTask {
  readonly id: string;
  readonly url: string;
  readonly videoTitle: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  readonly filePath: string;
  outputFilePath?: string;
  readonly selectedFormat: 'mp4' | 'mp3';
  readonly selectedQuality: string;
  retryCount: number;
  errorMessage?: string;
  actualWidth?: number;
  actualHeight?: number;
  actualResolution?: string;
  actualQuality?: string;
  actualVideoCodec?: string;
  actualAudioCodec?: string;
  actualContainer?: string;
  verified?: boolean;
  hasAudio?: boolean;
  qualityNote?: string;
  readonly createdAt: Date;
  updatedAt: Date;
  processId?: number;
}

interface DownloadItemProps {
  task: DownloadTask;
}

function getStatusDisplay(status: DownloadTask['status']) {
  switch (status) {
    case 'completed':
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />,
        label: 'Completed',
        className: 'text-success',
      };
    case 'error':
      return {
        icon: <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />,
        label: 'Failed',
        className: 'text-danger',
      };
    case 'paused':
      return {
        icon: <Pause className="h-4 w-4 text-warning" aria-hidden="true" />,
        label: 'Paused',
        className: 'text-warning',
      };
    case 'pending':
      return {
        icon: <Clock3 className="h-4 w-4 text-faint" aria-hidden="true" />,
        label: 'Queued',
        className: 'text-muted',
      };
    case 'downloading':
    default:
      return {
        icon: <ArrowDownToLine className="h-4 w-4 text-accent" aria-hidden="true" />,
        label: 'Downloading',
        className: 'text-accent',
      };
  }
}

function getActualFormatLabel(task: DownloadTask): string {
  const extension = task.outputFilePath?.split('.').pop()?.toUpperCase();
  if (extension && ['MP4', 'MKV', 'WEBM', 'M4A', 'MP3'].includes(extension)) {
    return extension;
  }

  const container = task.actualContainer?.toLowerCase() ?? '';
  if (task.selectedFormat === 'mp3') {
    if (container.includes('mp3')) return 'MP3';
    if (container.includes('m4a')) return 'M4A';
  } else {
    if (container.includes('matroska')) return 'MKV';
    if (container.includes('webm')) return 'WebM';
    if (container.includes('mp4') || container.includes('mov')) return 'MP4';
  }

  return task.selectedFormat.toUpperCase();
}

export const DownloadItem: React.FC<DownloadItemProps> = ({ task }) => {
  const {
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    openDownloadedFile,
    showDownloadedFile,
    removeHistoryItem,
    startDownload,
  } = useIPC();
  const isWindows = window.electronAPI.platform === 'win32';

  const statusDisplay = getStatusDisplay(task.status);
  const progress = Math.min(100, Math.max(0, Number.isFinite(task.progress) ? task.progress : 0));
  const quality = task.selectedQuality === 'best'
    ? 'Best'
    : /^\d+p$/i.test(task.selectedQuality)
      ? task.selectedQuality
      : '';
  const requestedLabel = `${task.selectedFormat.toUpperCase()}${quality ? ` · ${quality}` : ''}`;
  const completedQuality = task.actualResolution
    || task.actualQuality
    || (task.verified === false && quality ? `${quality} (requested)` : quality);
  const formatLabel = task.status === 'completed'
    ? `${getActualFormatLabel(task)}${completedQuality ? ` · ${completedQuality}` : ''}`
    : requestedLabel;
  const hasProgress = task.status === 'downloading' || task.status === 'paused';
  const speed = task.status === 'downloading'
    && task.speed
    && !['0 B/s', 'Complete', 'N/A'].includes(task.speed)
    ? task.speed
    : '';
  const eta = task.status === 'downloading'
    && task.eta
    && !['--:--', '--:--:--', '00:00', 'N/A'].includes(task.eta)
    ? (/^\d/.test(task.eta) ? `ETA ${task.eta}` : task.eta)
    : '';

  const details = [
    speed,
    eta,
    task.status === 'error' && task.retryCount > 0 ? `Retry ${task.retryCount}/3` : '',
    task.status === 'error' && progress > 0 ? `${progress.toFixed(1)}% downloaded` : '',
    task.status === 'completed' && task.verified === false
      ? (task.selectedFormat === 'mp4' ? 'Resolution unverified' : 'Audio unverified')
      : '',
    task.status === 'completed' && task.actualVideoCodec ? `Video ${task.actualVideoCodec}` : '',
    task.status === 'completed' && task.actualAudioCodec ? `Audio ${task.actualAudioCodec}` : '',
  ].filter(Boolean);

  const handleDownloadAgain = () => {
    void startDownload(task.url, task.videoTitle, task.selectedFormat, task.selectedQuality);
  };

  return (
    <div className="px-3.5 py-3 transition-colors hover:bg-surface-2/50">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{statusDisplay.icon}</div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-ink"
              title={task.videoTitle}
            >
              {task.videoTitle || 'Untitled media'}
            </p>
            {hasProgress && (
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">
                {progress.toFixed(1)}%
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
            <span className="tabular-nums">{formatLabel}</span>
            <span className="text-border-strong" aria-hidden="true">·</span>
            <span className={statusDisplay.className}>{statusDisplay.label}</span>
            {details.map((detail, index) => (
              <React.Fragment key={`${detail}-${index}`}>
                <span className="text-border-strong" aria-hidden="true">·</span>
                <span>{detail}</span>
              </React.Fragment>
            ))}
          </div>

          {(task.status === 'downloading' || task.status === 'paused') && (
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={`Download progress for ${task.videoTitle || 'media'}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={`${statusDisplay.label}, ${progress.toFixed(1)} percent`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                  task.status === 'downloading'
                    ? 'bg-accent'
                    : task.status === 'paused'
                      ? 'bg-warning'
                      : 'bg-border-strong'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {task.status === 'completed' && task.qualityNote && (
            <p
              className="mt-1.5 line-clamp-2 break-words text-[11px] leading-4 text-warning"
              title={task.qualityNote}
            >
              {task.qualityNote}
            </p>
          )}

          {task.status === 'error' && task.errorMessage && (
            <p
              className="mt-1.5 line-clamp-2 break-words text-[11px] leading-4 text-danger"
              title={task.errorMessage}
            >
              {task.errorMessage}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {task.status === 'completed' && (
            <>
              <button
                type="button"
                onClick={() => void openDownloadedFile(task.id)}
                className="icon-btn h-7 w-7"
                aria-label="Open downloaded file"
                title="Open file"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void showDownloadedFile(task.id)}
                className="icon-btn h-7 w-7"
                aria-label="Show downloaded file in folder"
                title="Show in folder"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownloadAgain}
                className="icon-btn h-7 w-7"
                aria-label="Download again"
                title="Download again"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void removeHistoryItem(task.id)}
                className="icon-btn icon-btn-danger h-7 w-7"
                aria-label="Remove from history"
                title="Remove from history (keeps the file)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {task.status === 'error' && (
            <>
              <button
                type="button"
                onClick={() => void retryDownload(task.id)}
                className="icon-btn h-7 w-7 text-accent hover:bg-accent-soft hover:text-accent"
                aria-label="Retry failed download"
                title="Retry"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void cancelDownload(task.id)}
                className="icon-btn icon-btn-danger h-7 w-7"
                aria-label="Remove failed download"
                title="Remove from queue"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {!isWindows && task.status === 'downloading' && (
            <button
              type="button"
              onClick={() => void pauseDownload(task.id)}
              className="icon-btn h-7 w-7"
              aria-label="Pause download"
              title="Pause download"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          )}

          {!isWindows && task.status === 'paused' && (
            <button
              type="button"
              onClick={() => void resumeDownload(task.id)}
              className="icon-btn h-7 w-7"
              aria-label="Resume download"
              title="Resume download"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}

          {(task.status === 'downloading' || task.status === 'paused' || task.status === 'pending') && (
            <button
              type="button"
              onClick={() => void cancelDownload(task.id)}
              className="icon-btn icon-btn-danger h-7 w-7"
              aria-label="Cancel download"
              title="Cancel download"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
