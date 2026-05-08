/**
 * ErrorNotification Component
 * Displays user-friendly error messages with actionable guidance
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */

import React from 'react';
import { AlertCircle, X, ExternalLink } from 'lucide-react';
import { ErrorDisplay } from '../constants/errorMessages';

interface ErrorNotificationProps {
  error: ErrorDisplay;
  onDismiss: () => void;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({ error, onDismiss }) => {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
          {error.title}
        </h3>
        <p className="text-sm text-red-700 dark:text-red-300 mb-2">
          {error.message}
        </p>
        {error.action && (
          <a
            href={error.action.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 transition-colors"
          >
            {error.action.label}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
        aria-label="Dismiss error"
      >
        <X className="w-4 h-4 text-red-600 dark:text-red-400" />
      </button>
    </div>
  );
};
