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

/** What Tab can reach inside a popup, for the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A drag on the phone sheet's handle or header dismisses it past this far
 *  (px) or this fast (px/s); short of that it springs back. */
const SWIPE_DISTANCE = 96;
const SWIPE_VELOCITY = 480;

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
  /**
   * `center` (default) is the white dialog on a scrim — a bottom sheet on a
   * phone. `side` keeps the same header, sections and footer but slides in
   * from the right as a full-height panel, and never becomes a bottom sheet
   * (spec #1444: side panels stay side panels).
   */
  placement?: 'center' | 'side';
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
  /** Cancel discards the popup's work, so when dirty it asks first, then calls
   *  this (not `onClose` — in the Homes editor Cancel means "back to the list"). */
  onCancel?: () => void;
  /** Set false when Cancel is a step back that keeps the work (Smart import's
   *  "Back to text"), so it never asks. */
  cancelDiscards?: boolean;
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
  placement = 'center',
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
  cancelDiscards = true,
  primary,
  children,
}: PopupFrameProps) {
  const { t } = useLanguage();
  // Under 768 px the frame becomes a bottom sheet: the same content, ~92dvh
  // tall, with a grabber and the footer pinned above the keyboard (spec #1447).
  // A side panel is the exception — it stays a side panel on every width.
  const isPhone = useMediaQuery('(max-width: 768px)');
  const isSide = placement === 'side';
  const sheet = isPhone && !isSide;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const tokenRef = useRef<symbol>(Symbol('popup'));
  const [pending, setPending] = useState<null | 'close' | 'back' | 'cancel'>(null);
  // Where focus was when the discard question opened, to return it on Keep editing.
  const askedFromRef = useRef<HTMLElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // The last keydown that bubbled through this dialog's React tree — which
  // includes its portals (e.g. a date picker's calendar), so the focus trap
  // can leave those alone.
  const ownKeyRef = useRef<Event | null>(null);
  // An in-progress drag of the phone sheet: where it started, the last
  // sample, and the speed at that sample.
  const dragRef = useRef<{ startY: number; y: number; t: number; v: number } | null>(null);
  // The on-screen keyboard's overlap, from visualViewport (null when none).
  const [keyboardFit, setKeyboardFit] = useState<null | { height: number; bottom: number }>(null);

  const question = discardQuestion ?? t('popup.discard_question').replace('{noun}', noun ?? '');

  // Focus moves into the dialog on open and returns to the opener on close.
  // The token also marks this dialog's place in the open stack.
  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    OPEN_DIALOGS.push(token);
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      // Don't steal focus if the user (or a test) has already moved it inside
      // the dialog — the deferred focus is only there to pull focus in from
      // the opener on open.
      if (!dialog || dialog.contains(document.activeElement)) return;
      const target = dialog.querySelector<HTMLElement>('input, textarea, select, button');
      (target ?? dialog).focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      setPending(null);
      const i = OPEN_DIALOGS.indexOf(token);
      if (i >= 0) OPEN_DIALOGS.splice(i, 1);
      openerRef.current?.focus?.();
    };
  }, [open]);

  const ask = (action: 'close' | 'back' | 'cancel') => {
    askedFromRef.current = document.activeElement as HTMLElement | null;
    setPending(action);
  };
  const keepEditing = () => {
    setPending(null);
    // A scrim tap leaves focus on the page; come back to the dialog instead.
    const from = askedFromRef.current;
    (from && dialogRef.current?.contains(from) ? from : dialogRef.current)?.focus();
  };
  const requestClose = () => {
    if (dirty) ask('close');
    else onClose();
  };
  const requestBack = () => {
    if (dirty) ask('back');
    else onBack?.();
  };
  const requestCancel = () => {
    if (dirty && cancelDiscards) ask('cancel');
    else onCancel?.();
  };

  // The discard question takes focus as it opens.
  useEffect(() => {
    if (pending) keepEditingRef.current?.focus();
  }, [pending]);

  // The phone sheet follows a downward drag that starts on its handle or
  // header (not on a button there). Far or fast enough dismisses it through
  // the same dirty-confirm path as Close and the scrim; short of that it
  // springs back. The offset is the CSS `translate` property, which composes
  // with the transform motion animates, so the exit slides on from where the
  // finger let go.
  const setSheetOffset = (y: number, animate: boolean) => {
    const el = dialogRef.current;
    if (!el) return;
    el.style.transition = animate ? 'translate 200ms ease-out' : 'none';
    el.style.translate = y > 0 ? `0 ${y}px` : '';
  };
  const onDragStart = (e: React.PointerEvent<HTMLElement>) => {
    if (!sheet || e.button !== 0 || (e.target as Element).closest('button, a, input, textarea, select')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, y: e.clientY, t: performance.now(), v: 0 };
  };
  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    if (now > drag.t) drag.v = ((e.clientY - drag.y) / (now - drag.t)) * 1000;
    drag.y = e.clientY;
    drag.t = now;
    setSheetOffset(Math.max(0, e.clientY - drag.startY), false);
  };
  const onDragEnd = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const offset = Math.max(0, e.clientY - drag.startY);
    // A finger that paused before lifting isn't flicking.
    const velocity = performance.now() - drag.t < 100 ? drag.v : 0;
    const dismiss = e.type === 'pointerup' && (offset > SWIPE_DISTANCE || velocity > SWIPE_VELOCITY);
    if (dismiss) requestClose();
    if (!dismiss || dirty) setSheetOffset(0, true);
  };
  const dragHandlers = sheet
    ? { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }
    : {};

  // On a phone, the on-screen keyboard shrinks the visual viewport but not
  // dvh, so the pinned footer would sit under it. While the sheet is open,
  // fit it to the visible area instead.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !sheet || !vv) return;
    const fit = () => {
      const bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardFit(bottom > 0 ? { height: Math.round(vv.height * 0.92), bottom } : null);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      setKeyboardFit(null);
    };
  }, [open, sheet]);

  // Tab and Shift+Tab cycle within the dialog (within the discard question
  // while it's open), and pull focus back in if it has slipped out.
  const trapTab = (e: KeyboardEvent) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    // Focus in one of this popup's own portals keeps its own Tab order.
    if (ownKeyRef.current === e && !dialog.contains(active)) return;
    const root = (pending && dialog.querySelector<HTMLElement>('[role="alertdialog"]')) || dialog;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.checkVisibility?.() ?? true,
    );
    const first = items[0];
    const last = items[items.length - 1];
    const inside = active !== root && root.contains(active);
    if (!first) {
      e.preventDefault();
      root.focus();
    } else if (e.shiftKey ? !inside || active === first : !inside || active === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      // Only the topmost open popup owns the keyboard, so a popup opened on
      // top of another doesn't make both ask about discarding at once.
      if (OPEN_DIALOGS[OPEN_DIALOGS.length - 1] !== tokenRef.current) return;
      if (e.key === 'Tab') {
        trapTab(e);
        return;
      }
      if (pending) {
        keepEditing();
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
            'fixed inset-0 z-[100] flex',
            isSide
              ? 'justify-end'
              : cn('justify-center', sheet ? 'items-end p-0' : 'items-center p-4'),
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
            initial={isSide ? { x: '100%' } : sheet ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
            animate={isSide ? { x: 0 } : sheet ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isSide ? { x: '100%' } : sheet ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
            transition={isSide ? { type: 'spring', damping: 28, stiffness: 260 } : sheet ? { type: 'spring', damping: 32, stiffness: 320 } : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={(e: React.KeyboardEvent) => {
              ownKeyRef.current = e.nativeEvent;
            }}
            style={keyboardFit ? { height: keyboardFit.height, maxHeight: keyboardFit.height, marginBottom: keyboardFit.bottom } : undefined}
            className={cn(
              'relative flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-[var(--shadow-pop)] outline-none',
              isSide
                ? cn('h-full border-l border-outline-variant', SIZES[size])
                : cn(
                    'border border-outline-variant',
                    sheet ? 'h-[92dvh] max-h-[92dvh] rounded-t-xl rounded-b-none' : cn('max-h-[90vh] rounded-xl', SIZES[size]),
                  ),
            )}
          >
            {/* The handle is decoration for the drag, not a control: a tap on
                it does nothing, and the Close button is the accessible way out. */}
            {sheet && (
              <div
                aria-hidden="true"
                {...dragHandlers}
                data-testid="popup-sheet-grabber"
                className="group flex h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              >
                <span className="h-1.5 w-10 rounded-full bg-outline-variant transition-colors group-hover:bg-outline" />
              </div>
            )}
            <header
              {...dragHandlers}
              className={cn('flex items-start gap-3 px-7', sheet ? 'touch-none pb-4 pt-1' : 'pb-5 pt-6')}
            >
              {onBack && (
                <button
                  type="button"
                  onClick={requestBack}
                  aria-label={backLabel ?? t('popup.back')}
                  className={cn(
                    'grid shrink-0 place-items-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low',
                    sheet ? 'h-11 w-11' : 'h-10 w-10',
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
                  sheet ? 'h-11 w-11' : 'h-10 w-10',
                )}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            {(error || primary) && (
              <footer
                className="shrink-0 border-t border-outline-variant bg-surface-container-low"
                style={sheet ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
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
                        sheet ? 'h-11' : 'h-9',
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
                        onClick={requestCancel}
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
                      ref={keepEditingRef}
                      type="button"
                      onClick={keepEditing}
                      className={cn(
                        'rounded-full px-4 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface',
                        sheet ? 'h-11' : 'py-2',
                      )}
                    >
                      {t('popup.keep_editing')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const action = pending;
                        setPending(null);
                        if (action === 'close') {
                          onClose();
                          return;
                        }
                        // Back and Cancel may leave the popup open on another
                        // view (the Homes list); keep focus inside it.
                        dialogRef.current?.focus();
                        if (action === 'back') onBack?.();
                        else onCancel?.();
                      }}
                      className={cn(
                        'rounded-full bg-primary px-4 text-sm font-medium text-on-primary',
                        sheet ? 'h-11' : 'py-2',
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
