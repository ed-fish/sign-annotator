import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  lastSaveTime: string | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, lastSaveTime: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DCAL] Uncaught error:', error, info.componentStack);

    // Read last save time from localStorage
    let lastSaveTime: string | null = null;
    try {
      const crashLog = localStorage.getItem('dcal-crash-log');
      if (crashLog) {
        const parsed = JSON.parse(crashLog);
        if (parsed.timestamp) {
          lastSaveTime = new Date(parsed.timestamp).toLocaleTimeString();
        }
      }
    } catch { /* ignore */ }

    try {
      localStorage.setItem('dcal-crash-log', JSON.stringify({
        emergencySave: true,
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack,
      }));
    } catch { /* ignore */ }

    this.setState({ lastSaveTime });
  }

  handleCopyError = () => {
    const error = this.state.error;
    if (!error) return;
    const details = `DCAL Annotator Crash Report\n${'='.repeat(40)}\nError: ${error.message}\n\nStack trace:\n${error.stack ?? 'No stack trace available'}\n\nTimestamp: ${new Date().toISOString()}\nUser Agent: ${navigator.userAgent}`;
    navigator.clipboard.writeText(details).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-zinc-900 text-zinc-200 p-8">
          <div className="max-w-lg text-center space-y-4">
            <h1 className="text-xl font-semibold text-red-400">Something went wrong</h1>
            <p className="text-sm text-zinc-400">
              DCAL encountered an unexpected error.
              {this.state.lastSaveTime
                ? ` Your work was last auto-saved at ${this.state.lastSaveTime}.`
                : ' Your work may have been auto-saved.'}
            </p>
            <p className="text-xs text-zinc-500">
              Try reloading the application. Your annotations should be restored from the last auto-save.
              If the problem persists, try clearing your browser data for this site.
            </p>
            <pre className="text-xs text-left bg-zinc-800 p-3 rounded overflow-auto max-h-40 text-zinc-400">
              {this.state.error?.message}
            </pre>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm"
              >
                Reload Application
              </button>
              <button
                onClick={this.handleCopyError}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-sm"
              >
                {this.state.copied ? 'Copied!' : 'Copy error details'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
