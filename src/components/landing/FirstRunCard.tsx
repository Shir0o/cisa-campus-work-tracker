import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  FirstRunStore,
  evaluateFirstRun,
  getFrnCopy,
  type FirstRunPredicateContext,
} from '../../lib/firstRun';

export interface FirstRunCardProps {
  role?: string | null;
  userId?: string | null;
  context?: FirstRunPredicateContext;
  className?: string;
  onDismiss?: () => void;
}

export default function FirstRunCard({
  role,
  userId,
  context = {},
  className,
  onDismiss,
}: FirstRunCardProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const copy = getFrnCopy(role);
  const data = evaluateFirstRun(role, userId, context);

  // Sync state if localStorage changes or if user was already dismissed
  useEffect(() => {
    setDismissed(data.isAway);
  }, [data.key, data.isAway]);

  if (dismissed || !data.isVisible) {
    return null;
  }

  const handlePutAway = () => {
    FirstRunStore.putAway(data.key);
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <section
      aria-label="Getting started checklist"
      className={cn(
        'p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-outline-variant bg-surface shadow-sm space-y-4 text-left transition-all',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg sm:text-xl font-semibold text-on-surface">
            {copy.title}
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5 leading-relaxed">
            {copy.sub}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-on-surface-variant border border-outline-variant rounded-full px-2.5 py-0.5 bg-surface-container/50">
          {data.doneCount} of {data.totalCount}
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-outline-variant/50 pt-1">
        {data.steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-3 items-center py-3 first:pt-2 last:pb-1',
              step.done && 'opacity-70',
            )}
          >
            {/* Tick */}
            <div
              className={cn(
                'w-5 h-5 sm:w-6 sm:h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors',
                step.done
                  ? 'bg-accent-soft border-accent/40 text-accent'
                  : 'border-outline-variant bg-surface-container/40 text-transparent',
              )}
              aria-hidden="true"
            >
              {step.done && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            </div>

            {/* Content */}
            <div className="min-w-0 pr-1">
              <div
                className={cn(
                  'text-sm font-medium leading-tight',
                  step.done ? 'line-through text-on-surface-variant' : 'text-on-surface',
                )}
              >
                {step.label}
              </div>
              {!step.done && (
                <div className="text-xs text-on-surface-variant mt-0.5 leading-normal">
                  {step.hint}
                </div>
              )}
            </div>

            {/* Go button if not done and has target link */}
            {!step.done && step.to && (
              <div className="col-start-2 sm:col-start-auto justify-self-start sm:justify-self-end mt-1 sm:mt-0">
                <button
                  type="button"
                  onClick={() => step.to && navigate(step.to)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-accent border border-outline-variant hover:bg-accent-soft/60 rounded-full transition-colors"
                >
                  Show me
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-outline-variant/60 text-xs text-on-surface-variant">
        <span>{copy.foot}</span>
        <button
          type="button"
          onClick={handlePutAway}
          className="font-medium text-on-surface-variant hover:text-accent underline underline-offset-4 decoration-outline-variant transition-colors"
        >
          Put this away
        </button>
      </div>
    </section>
  );
}
