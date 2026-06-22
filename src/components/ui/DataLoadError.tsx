import { AlertCircle, RefreshCw } from 'lucide-react';

interface DataLoadErrorProps {
  /** Friendly name of what failed to load, e.g. "the dashboard" or "contacts". */
  label: string;
  /** Override the retry action. Defaults to a full page reload. */
  onRetry?: () => void;
}

/**
 * Shared error state for data views whose Firestore listeners fail. Lets the user
 * tell a load failure apart from an empty list, and offers a reload — the practical
 * retry, since onSnapshot auto-retries on reconnect but a permission-denied error
 * won't recover on its own.
 */
export function DataLoadError({ label, onRetry }: DataLoadErrorProps) {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="flex flex-col items-center justify-center text-center gap-4 py-16 px-6 rounded-3xl border border-error/20 bg-error/5">
        <div className="w-14 h-14 bg-error-container text-error rounded-full flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-on-surface">Couldn't load {label}</h2>
          <p className="text-sm text-on-surface-variant">
            Something went wrong while loading. Please try again.
          </p>
        </div>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-full font-medium active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Reload
        </button>
      </div>
    </div>
  );
}
