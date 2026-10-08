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
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { AlertCircle, ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../LanguageProvider';
import { useMediaQuery } from '../../lib/useMediaQuery';

const SIZES = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[960px]',
} as const;

/** Ink's eight data hues, used to tint a person's avatar deterministically. */
const AVATAR_HUES = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'] as const;

/** The open dialogs, oldest first. Only the topmost responds to Escape, so a
 *  popup opened on top of another (e.g. the Home editor from Log a visit) owns
 *  the keyboard without the one underneath also handling the same key. */
const OPEN_DIALOGS: symbol[] = [];

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
  /** An optional back action in the header (e.g. "back to the list"). When the
   *  popup is dirty, the back action asks before it discards the edits. */
  onBack?: () => void;
  backLabel?: string;
  /** When dirty, closing asks "Discard this <noun>?" before it closes. */
  dirty?: boolean;
  noun?: string;
  /** Overrides the discard question entirely (e.g. "Discard changes to this
   *  home?"). Defaults to `popup.discard_question` with `{noun}` filled in. */
  discardQuestion?: string;
  footerHint?: React.ReactNode;
  /** A destructive action in red, far left of the footer (e.g. Delete home). */
  destructive?: { label: string; onClick: () => void } | null;
  /** A rejected save: replaces the footer with a message and a retry action. */
  error?: { message: string; retryLabel: string; onRetry: () => void } | null;
  /** The footer is optional: a read-only popup (e.g. the Homes list) has none. */
  cancelLabel?: string;
  onCancel?: () => void;
  primary?: {
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
  onBack,
  backLabel,
  dirty = false,
  noun,
  discardQuestion,
  footerHint,
  destructive,
  error,
  cancelLabel,
  onCancel,
  primary,
  children,
}: PopupFrameProps) {
  const { t } = useLanguage();
  // Under 768 px the frame becomes a bottom sheet: the same content, ~92dvh
  // tall, with a grabber and the footer pinned above the keyboard (spec #1447).
  const isPhone = useMediaQuery('(max-width: 768px)');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const tokenRef = useRef<symbol>(Symbol('popup'));
  const [pending, setPending] = useState<null | 'close' | 'back'>(null);

  const question = discardQuestion ?? t('popup.discard_question').replace('{noun}', noun ?? '');

  // Focus moves into the dialog on open and returns to the opener on close.
  // The token also marks this dialog's place in the open stack.
  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    OPEN_DIALOGS.push(token);
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
      (target ?? dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      setPending(null);
      const i = OPEN_DIALOGS.indexOf(token);
      if (i >= 0) OPEN_DIALOGS.splice(i, 1);
      openerRef.current?.focus?.();
    };
  }, [open]);

  const requestClose = () => {
    if (dirty) setPending('close');
    else onClose();
  };
  const requestBack = () => {
    if (dirty) setPending('back');
    else onBack?.();
  };

  // A swipe down far enough (or fast enough) dismisses the phone sheet, through
  // the same dirty-confirm path as Close and the scrim.
  const onSheetDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 96 || info.velocity.y > 480) requestClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost open popup owns Escape, so a popup opened on top of
      // another doesn't make both ask about discarding at once.
      if (OPEN_DIALOGS[OPEN_DIALOGS.length - 1] !== tokenRef.current) return;
      if (pending) {
        setPending(null);
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
        <div
          className={cn(
            'fixed inset-0 z-[100] flex justify-center',
            isPhone ? 'items-end p-0' : 'items-center p-4',
          )}
        >
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
            initial={isPhone ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
            animate={isPhone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isPhone ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
            transition={isPhone ? { type: 'spring', damping: 32, stiffness: 320 } : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              'relative flex w-full flex-col overflow-hidden border border-outline-variant bg-[var(--bg-elev)] shadow-[var(--shadow-pop)] outline-none',
              isPhone
                ? 'h-[92dvh] max-h-[92dvh] rounded-t-xl rounded-b-none'
                : cn('max-h-[90vh] rounded-xl', SIZES[size]),
            )}
          >
            {isPhone && (
              <motion.button
                type="button"
                onClick={requestClose}
                aria-label={t('popup.dismiss_sheet')}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.5 }}
                onDragEnd={onSheetDragEnd}
                data-testid="popup-sheet-grabber"
                className="group flex h-11 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
              >
                <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-outline-variant transition-colors group-hover:bg-outline" />
              </motion.button>
            )}
            <header className={cn('flex items-start gap-3 px-7', isPhone ? 'pb-4 pt-1' : 'pb-5 pt-6')}>
              {onBack && (
                <button
                  type="button"
                  onClick={requestBack}
                  aria-label={backLabel ?? t('popup.back')}
                  className={cn(
                    'grid shrink-0 place-items-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low',
                    isPhone ? 'h-11 w-11' : 'h-10 w-10',
                  )}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
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
                className={cn(
                  'grid shrink-0 place-items-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:text-on-surface',
                  isPhone ? 'h-11 w-11' : 'h-10 w-10',
                )}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            {(error || primary) && (
              <footer
                className="shrink-0 border-t border-outline-variant bg-surface-container-low"
                style={isPhone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
              >
                {error ? (
                  <div className="flex items-center gap-3 px-7 py-4">
                    <p role="alert" className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="truncate">{error.message}</span>
                    </p>
                    <button
                      type="button"
                      onClick={error.onRetry}
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary',
                        isPhone ? 'h-11' : 'h-9',
                      )}
                    >
                      {error.retryLabel}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-7 py-4">
                    {destructive && (
                      <button
                        type="button"
                        onClick={destructive.onClick}
                        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium text-error transition-colors hover:bg-error/10"
                      >
                        {destructive.label}
                      </button>
                    )}
                    {footerHint && (
                      <span className="truncate text-[12px] text-[var(--text-mute)]">{footerHint}</span>
                    )}
                    <span className="flex-1" />
                    {cancelLabel && (
                      <button
                        type="button"
                        onClick={onCancel}
                        className="h-11 rounded-full px-4 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                      >
                        {cancelLabel}
                      </button>
                    )}
                    {primary && (
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
                    )}
                  </div>
                )}
              </footer>
            )}

            {pending && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-6">
                <div
                  role="alertdialog"
                  aria-label={question}
                  className="w-full max-w-sm rounded-lg border border-outline-variant bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-pop)]"
                >
                  <p className="text-sm font-medium text-on-surface">{question}</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className={cn(
                        'rounded-full px-4 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface',
                        isPhone ? 'h-11' : 'py-2',
                      )}
                    >
                      {t('popup.keep_editing')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const action = pending;
                        setPending(null);
                        if (action === 'back') onBack?.();
                        else onClose();
                      }}
                      className={cn(
                        'rounded-full bg-primary px-4 text-sm font-medium text-on-primary',
                        isPhone ? 'h-11' : 'py-2',
                      )}
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
