import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
          <div className="w-full max-w-[460px] rounded-xl border border-border bg-surface p-6 shadow-dialog">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold text-ink">Application error</h1>
                <p className="mt-1 text-[12px] leading-5 text-muted">
                  Reload the window to continue. If it happens again, restart Ytomp34.
                </p>
              </div>
            </div>

            {this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer rounded-sm text-[11px] font-medium text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto scrollbar-thin whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 font-mono text-[10px] leading-5 text-muted">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-5 w-full"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
