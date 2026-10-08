// The shared popup frame (spec #1444, direction A — Ink, structured).
//
// Built with its first consumer, Log a visit / Edit a visit, rather than ahead
// of it, so it carries only the slots that consumer uses: a header (eyebrow,
// Plus Jakarta title, subtitle, round Close), sections whose label sits in a
// left column, filled fields, person pills with a stable avatar tint, and a
// pinned footer (shortcut hint, Cancel, one primary action). Values come from
// existing Ink tokens so dark mode follows automatically; radii follow the
// ADR 0009 ladder (dialog 24, nested panels 14, controls 10, pills full).
import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../LanguageProvider';

const SIZES = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[960px]',
} as const;

/** Ink's eight data hues, used to tint a person's avatar deterministically. */
const AVATAR_HUES = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'] as const;

/** A person keeps the same avatar tint every time, derived from their id. */
export function avatarTint(seed: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length];
  return { background: `var(--t-${hue}-soft)`, color: `var(--t-${hue})` };
}

/** A section: its label (and hint) in a left column, content on the right. */
export function PopupSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 border-t border-outline-variant px-7 py-5 sm:grid-cols-[128px_minmax(0,1fr)]">
      <div>
        <p className="text-[13px] font-semibold text-on-surface">{label}</p>
        {hint && <p className="mt-1 text-[12px] leading-snug text-[var(--text-mute)]">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A field: a 13px ink label, the control, optional hint and error lines. */
export function PopupField({
  label,
  htmlFor,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-on-surface">
        {label}
        {optional && <span className="ml-1 font-normal text-[var(--text-mute)]">· {optional}</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-[var(--text-mute)]">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** An outlined pill for a person, with a tinted avatar and optional remove. */
export function PersonPill({
  id,
  name,
  initials,
  onRemove,
  removeLabel,
}: {
  id: string;
  name: string;
  initials: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-outline-variant bg-[var(--bg-elev)] pl-1 pr-2.5 text-[13px] text-on-surface">
      <span
        style={avatarTint(id)}
        className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold"
        aria-hidden="true"
      >
        {initials}
      </span>
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="text-[var(--text-mute)] transition-colors hover:text-on-surface"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

export interface PopupFrameProps {
  open: boolean;
  /** Called to actually close — the frame has already asked about dirty state. */
  onClose: () => void;
  size?: keyof typeof SIZES;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** When dirty, closing asks "Discard this <noun>?" before it closes. */
  dirty?: boolean;
  noun?: string;
  footerHint?: React.ReactNode;
  /** A rejected save: replaces the footer with a message and a retry action. */
  error?: { message: string; retryLabel: string; onRetry: () => void } | null;
  cancelLabel: string;
  onCancel: () => void;
  primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    saving?: boolean;
    savingLabel: string;
  };
  children: React.ReactNode;
}

export function PopupFrame({
  open,
  onClose,
  size = 'md',
  eyebrow,
  title,
  subtitle,
  dirty = false,
  noun,
  footerHint,
  error,
  cancelLabel,
  onCancel,
  primary,
  children,
}: PopupFrameProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Focus moves into the dialog on open and returns to the opener on close.
  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
      (target ?? dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      setConfirming(false);
      openerRef.current?.focus?.();
    };
  }, [open]);

  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirming) {
        setConfirming(false);
        return;
      }
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requestClose}
            aria-hidden="true"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-[var(--bg-elev)] shadow-[var(--shadow-pop)] outline-none',
              SIZES[size],
            )}
          >
            <header className="flex items-start gap-3 px-7 pb-5 pt-6">
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-mute)]">
                    {eyebrow}
                  </p>
                )}
                <h2 id={titleId} className="font-serif text-[22px] font-bold tracking-tight text-on-surface">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-[13px] text-on-surface-variant">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label={t('modals.close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            <footer className="border-t border-outline-variant bg-surface-container-low">
              {error ? (
                <div className="flex items-center gap-3 px-7 py-4">
                  <p role="alert" className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-error">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{error.message}</span>
                  </p>
                  <button
                    type="button"
                    onClick={error.onRetry}
                    className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary"
                  >
                    {error.retryLabel}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-7 py-4">
                  {footerHint && <span className="text-[12px] text-[var(--text-mute)]">{footerHint}</span>}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={onCancel}
                    className="h-11 rounded-full px-4 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={primary.onClick}
                    disabled={primary.disabled || primary.saving}
                    className="inline-flex h-11 min-w-[9.5rem] items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {primary.saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {primary.saving ? primary.savingLabel : primary.label}
                  </button>
                </div>
              )}
            </footer>

            {confirming && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-6">
                <div
                  role="alertdialog"
                  aria-label={t('popup.discard_question').replace('{noun}', noun ?? '')}
                  className="w-full max-w-sm rounded-lg border border-outline-variant bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-pop)]"
                >
                  <p className="text-sm font-medium text-on-surface">
                    {t('popup.discard_question').replace('{noun}', noun ?? '')}
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-full px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                    >
                      {t('popup.keep_editing')}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary"
                    >
                      {t('popup.discard')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
