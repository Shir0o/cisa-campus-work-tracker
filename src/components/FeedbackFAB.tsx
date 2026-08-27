import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, X, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { useCommand } from '../lib/commands';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { Translate } from './Translate';
import { useTranslate } from '../hooks/useTranslate';
import { roleLabel } from '../lib/permissions';
import { FEEDBACK_KINDS, kindMeta, kindToType, TONE_CLASSES } from '../lib/feedbackKinds';
import { FeedbackKind } from '../types';

const MAX_SCREENSHOT_DIMENSION = 1000;
const MAX_PAYLOAD_LENGTH = 600000;

export default function FeedbackFAB() {
  const { user, role } = useAuth();
  const isMessagesPage = typeof window !== 'undefined' && window.location.pathname === '/messages';
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus the textarea shortly after the panel opens.
  useEffect(() => {
    if (isOpen && phase === 'idle') {
      const t = setTimeout(() => areaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, phase]);

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
    setTimeout(resetForm, 320);
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

    // Auto-capture screenshot and diagnostic information
    let screenshot = '';
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: 1.0,
        ignoreElements: (el) =>
          el.id === 'feedback-fab-btn' ||
          el.getAttribute('role') === 'dialog' ||
          Boolean(el.closest('[role="dialog"]')),
      });

      let finalCanvas = canvas;
      if (canvas.width > MAX_SCREENSHOT_DIMENSION || canvas.height > MAX_SCREENSHOT_DIMENSION) {
        const scale = Math.min(MAX_SCREENSHOT_DIMENSION / canvas.width, MAX_SCREENSHOT_DIMENSION / canvas.height);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.round(canvas.width * scale);
        tempCanvas.height = Math.round(canvas.height * scale);
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
          finalCanvas = tempCanvas;
        }
      }
      screenshot = finalCanvas.toDataURL('image/jpeg', 0.65);
      if (screenshot.length > MAX_PAYLOAD_LENGTH) {
        screenshot = finalCanvas.toDataURL('image/jpeg', 0.4);
      }
      if (screenshot.length > MAX_PAYLOAD_LENGTH) {
        screenshot = '';
      }
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    }

    const payload = {
      userId: user.uid,
      userEmail: user.email?.toLowerCase() || 'anonymous',
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
      {/* FAB Button — pencil, morphs to × when open */}
      <button
        id="feedback-fab-btn"
        onClick={() => (isOpen ? close() : openFresh())}
        className={`fixed right-4 z-[100] w-12 h-12 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center border-none cursor-pointer ${
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

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Scrim (closes on outside click) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-[110]"
              aria-hidden="true"
            />

            {/* Panel — anchored above the FAB */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 360 }}
              role="dialog"
              aria-modal="true"
              aria-label={t('feedback.leave_note_for_team')}
              className={`fixed right-4 z-[120] w-[calc(100vw-2rem)] max-w-[340px] bg-surface-container border border-outline-variant rounded-2xl shadow-2xl p-5 focus:outline-none ${
                isMessagesPage ? 'bottom-44 lg:bottom-44 lg:right-6' : 'bottom-36 lg:bottom-20 lg:right-6'
              }`}
            >
              {phase === 'done' ? (
                /* Success */
                <div className="flex flex-col items-center text-center gap-2 py-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-accent grid place-items-center text-xl mb-1">
                    ✦
                  </div>
                  <p className="font-serif text-lg text-on-surface">{t('feedback.we_got_your_note')}</p>
                  <p className="text-sm text-on-surface-variant">{t('feedback.thanks_for_time')} {firstName}.</p>
                  <button
                    type="button"
                    onClick={() => {
                      clearAutoClose();
                      resetForm();
                      areaRef.current?.focus();
                    }}
                    className="mt-3 py-2 px-5 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors cursor-pointer"
                  >
                    Send another
                  </button>
                </div>
              ) : (
                /* Form */
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-serif text-lg font-medium text-on-surface leading-snug">{t('feedback.leave_a_note')}</h3>
                    <p className="text-[13px] text-on-surface-variant leading-snug">
                      {t('feedback.all_welcome')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('feedback.kind_of_note')}>
                    {FEEDBACK_KINDS.map((k) => {
                      const on = kind === k.id;
                      return (
                        <button
                          key={k.id}
                          type="button"
                          disabled={phase === 'busy'}
                          onClick={() => setKind(k.id)}
                          className={`text-[12.5px] rounded-full px-3 py-1 border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                            on
                              ? `${TONE_CLASSES[k.tone].chip} border-transparent font-medium`
                              : 'text-on-surface-variant bg-surface border-outline-variant hover:bg-surface-container-high'
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
                    className="w-full resize-none bg-surface border border-outline-variant rounded-xl p-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow disabled:opacity-60"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-on-surface-variant truncate min-w-0">
                      {user.displayName || t('common.you')} · <Translate text={roleLabel(role)} />
                    </span>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSend}
                      className="shrink-0 py-1.5 px-4 bg-primary text-on-primary font-semibold rounded-full text-[13px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default border-none cursor-pointer flex items-center gap-1.5"
                    >
                      {phase === 'busy' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('feedback.sending')}</span>
                        </>
                      ) : (
                        t('feedback.send')
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

