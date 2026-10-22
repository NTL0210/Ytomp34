/**
 * Inline error feedback with actionable guidance.
 */

import React from 'react';
import { AlertCircle, ExternalLink, X } from 'lucide-react';
import { ErrorDisplay } from '../constants/errorMessages';

interface ErrorNotificationProps {
  error: ErrorDisplay;
  onDismiss: () => void;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({ error, onDismiss }) => {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5 text-ink">{error.title}</p>
        <p className="mt-0.5 break-words text-[12px] leading-5 text-muted">{error.message}</p>
        {error.action?.link && (
          <a
            href={error.action.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60 focus-visible:ring-offset-2 focus-visible:ring-offset-danger-soft"
          >
            {error.action.label}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="icon-btn -mr-1 -mt-1 h-7 w-7 hover:bg-danger/10 hover:text-danger"
        aria-label="Dismiss error"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
