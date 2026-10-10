import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { useCommand } from '../lib/commands';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { Translate } from './Translate';
import { useTranslate } from '../hooks/useTranslate';
import { roleLabel } from '../lib/permissions';
import { FEEDBACK_KINDS, kindMeta, kindToType, TONE_CLASSES } from '../lib/feedbackKinds';
import { capturePageScreenshot } from '../lib/feedbackScreenshot';
import { PopupFrame } from './ui/PopupFrame';
import { FeedbackKind } from '../types';


export default function FeedbackFAB() {
  const { user, role } = useAuth();
  const isMessagesPage = typeof window !== 'undefined' && window.location.pathname === '/messages';
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Both timers outlive a render, and the auto-close one runs 2.2s after a
  // successful send — long enough that the FAB can unmount first (a route
  // change, or a test file finishing). Without this the callback lands on an
  // unmounted tree, which surfaced as an uncaught `window is not defined`
  // during suite teardown.
  useEffect(() => () => {
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  // Focus the textarea shortly after the panel opens.
  useEffect(() => {
    if (isOpen && phase === 'idle') {
      const t = setTimeout(() => areaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, phase]);

  const navigate = useNavigate();

  const clearAutoClose = () => {
    if (autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }
  };

  const resetForm = () => {
    setKind('thought');
    setMessage('');
    setPhase('idle');
  };

  const close = () => {
    clearAutoClose();
    setIsOpen(false);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(resetForm, 320);
  };

  const openFresh = () => {
    clearAutoClose();
    resetForm();
    setIsOpen(true);
  };

  const canSend = message.trim().length > 0 && phase === 'idle';

  const submit = async () => {
    if (!canSend || !user) return;
    const submissionMessage = message.trim();
    const submissionKind = kind;
    const type = kindToType(submissionKind);

    setPhase('busy');

    // Capture before the payload is built. `ignoreElements` keeps the FAB and
    // this dialog out of the shot, so what lands is the page behind them.
    const screenshot = await capturePageScreenshot();

    const payload = {
      userId: user.uid,
      userName: user.displayName || 'Anonymous User',
      type,
      kind: submissionKind,
      message: submissionMessage,
      screenshot,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio})`,
    };

    // 1. Write feedback record via Backend API
    try {
      let token: string | null = null;
      try {
        if (user && typeof user.getIdToken === 'function') {
          token = await user.getIdToken();
        }
      } catch (tokenErr) {
        console.error('Failed to get Firebase ID token:', tokenErr);
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to submit feedback through API:', error);
      setPhase('idle');
      try {
        handleFirestoreError(error, OperationType.WRITE, 'feedback');
      } catch (e) {
        // Fallback for user view
      }
      return;
    }

    // Saved — show success state, then auto-close
    setPhase('done');
    clearAutoClose();
    autoCloseTimer.current = setTimeout(close, 2200);

    // 2. Best-effort side-effects — their failure must not revert the success
    try {
      await logActivity({
        action: 'submitted feedback',
        targetId: 'feedback_root',
        targetName: kindMeta(submissionKind).label,
        targetType: 'contact',
        description: `User left a note (${kindMeta(submissionKind).label}): "${submissionMessage.slice(0, 40)}${submissionMessage.length > 40 ? '...' : ''}"`,
        type: 'create',
      });
    } catch (error) {
      console.error('Feedback saved, but follow-up log failed:', error);
    }
  };

  useCommand({
    id: 'feedback.send',
    scope: 'compose',
    description: 'Send your note',
    shortcut: { key: 'Enter', mod: true },
    minRole: 'viewer',
    when: (e) => e.target === areaRef.current,
    available: () => isOpen,
    handler: () => submit(),
  });

  if (!user) return null;

  const firstName = (user.displayName || '').trim().split(/\s+/)[0] || 'friend';
  const activeMeta = kindMeta(kind);
  const { t } = useLanguage();
  const { translatedText: activePlaceholder } = useTranslate(activeMeta.placeholder);

  return (
    <>
      {/* FAB Button — pencil, morphs to × when open.
          It sits below the overlay layer (z-100) so drawers and modals stack
          above it; at z-[100] it used to land on top of the Rhythm drawer's
          own controls (issue 982). While its own panel is open it rises above that
          panel. It stays there while its own panel is open too: the panel's
          scrim closes on click, so the × landing under the scrim does the same
          thing as pressing it. */}
      <button
        id="feedback-fab-btn"
        onClick={() => (isOpen ? close() : openFresh())}
        className={`fixed right-4 z-40 w-12 h-12 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center border-none cursor-pointer ${
          isMessagesPage ? 'bottom-28 lg:bottom-28 lg:right-6' : 'bottom-20 lg:bottom-6 lg:right-6'
        } ${
          isOpen
            ? 'bg-surface-container-highest text-on-surface-variant'
            : 'bg-primary text-on-primary hover:scale-105'
        }`}
        title={isOpen ? t('feedback.close') : t('feedback.leave_note_for_team')}
        aria-label={isOpen ? t('feedback.close_feedback_panel') : t('feedback.leave_note_for_team')}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
      </button>

      <PopupFrame
        open={isOpen}
        onClose={close}
        size="sm"
        eyebrow={t('feedback.eyebrow')}
        title={t('feedback.leave_a_note')}
        subtitle={t('feedback.all_welcome')}
        dirty={phase === 'idle' && message.trim().length > 0}
        noun={t('feedback.note_noun')}
        footerHint={
          phase !== 'done' ? (
            <span className="min-w-0 truncate text-[12px] text-[var(--text-mute)]">
              {user.displayName || t('common.you')} · <Translate text={roleLabel(role)} />
            </span>
          ) : undefined
        }
        cancelLabel={t('actions.cancel')}
        onCancel={close}
        primary={
          phase === 'done'
            ? {
                label: t('feedback.see_your_notes'),
                onClick: () => {
                  close();
                  navigate('/feedback');
                },
                savingLabel: t('feedback.sending'),
              }
            : {
                label: t('feedback.send'),
                onClick: submit,
                disabled: !canSend,
                saving: phase === 'busy',
                savingLabel: t('feedback.sending'),
              }
        }
      >
        {phase === 'done' ? (
          /* Success */
          <div className="flex flex-col items-center gap-2 px-7 py-8 text-center">
            <div className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-xl text-accent">
              ✦
            </div>
            <p className="font-serif text-lg text-on-surface">{t('feedback.we_got_your_note')}</p>
            <p className="text-sm text-on-surface-variant">
              {t('feedback.thanks_for_time')} {firstName}.
            </p>
            <button
              type="button"
              onClick={() => {
                clearAutoClose();
                resetForm();
                areaRef.current?.focus();
              }}
              className="mt-3 cursor-pointer rounded-full border border-outline bg-transparent px-5 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-variant"
            >
              {t('feedback.send_another')}
            </button>
          </div>
        ) : (
          /* Form */
          <div className="flex flex-col gap-3.5 px-7 py-5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('feedback.kind_of_note')}>
              {FEEDBACK_KINDS.map((k) => {
                const on = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    disabled={phase === 'busy'}
                    onClick={() => setKind(k.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[12.5px] transition-colors disabled:cursor-default disabled:opacity-50 ${
                      on
                        ? `${TONE_CLASSES[k.tone].chip} border-transparent font-medium`
                        : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <Translate text={k.label} />
                  </button>
                );
              })}
            </div>

            <textarea
              ref={areaRef}
              value={message}
              disabled={phase === 'busy'}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder={activePlaceholder}
              aria-label={t('feedback.your_note')}
              className="w-full resize-none rounded-sm border border-outline-variant bg-surface p-3 text-sm text-on-surface transition-shadow placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>
        )}
      </PopupFrame>
    </>
  );
}

