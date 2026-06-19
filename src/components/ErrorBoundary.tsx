import { Component, type ErrorInfo, type ReactNode } from 'react';
import { fileAutoReport } from '../lib/errorReporter';

interface ErrorBoundaryState {
  hasError: boolean;
  /** Ticket id once the auto-filed report resolves; null while pending. */
  reportId: number | null;
}

/**
 * App-root error boundary. Render errors anywhere below get caught
 * here instead of white-screening; componentDidCatch files an auto bug
 * report through the same session-guarded path as the window error
 * listeners (so a crash that ALSO fired window.onerror dedups by
 * fingerprint instead of double-filing).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, reportId: null };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void fileAutoReport({
      kind: 'error',
      errorName: error.name,
      message: error.message,
      stack: error.stack,
      title: `Crash: ${error.name}: ${error.message}`.slice(0, 120),
      description: `${error.stack ?? `${error.name}: ${error.message}`}\n\nComponent stack:${info.componentStack ?? ' (unavailable)'}`,
    }).then((result) => {
      if (result) this.setState({ reportId: result.id });
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-dvh bg-[#0d1117] text-[#c9d1d9] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl bg-[#161b22] border border-[#30363d] shadow-2xl p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2 text-white">Something went wrong</h1>
          <p className="text-sm text-[#8b949e] mb-6">
            Chino hit an unexpected error. A bug report was filed automatically
            {this.state.reportId ? <> — #{this.state.reportId}</> : null}, so
            there's nothing you need to do besides reload.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-[#58a6ff] hover:bg-[#58a6ff]/80 text-white rounded-lg font-medium"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
