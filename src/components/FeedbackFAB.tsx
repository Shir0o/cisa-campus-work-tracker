import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, X } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { roleLabel } from '../lib/permissions';
import { FEEDBACK_KINDS, kindMeta, kindToType, TONE_CLASSES } from '../lib/feedbackKinds';
import { FeedbackKind } from '../types';

export default function FeedbackFAB() {
  const { user, role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea shortly after the panel opens.
  useEffect(() => {
    if (isOpen && phase === 'idle') {
      const t = setTimeout(() => areaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, phase]);

  const close = () => {
    setIsOpen(false);
    setTimeout(() => {
      setKind('thought');
      setMessage('');
      setPhase('idle');
    }, 320);
  };

  const canSend = message.trim().length > 0 && phase === 'idle';

  const submit = async () => {
    if (!canSend || !user) return;
    setPhase('busy');

    const type = kindToType(kind);

    // Auto-capture screenshot and diagnostic information
    let screenshot = '';
    const fabBtn = document.getElementById('feedback-fab-btn');
    const dialogPanel = document.querySelector('div[role="dialog"]');
    try {
      if (fabBtn) (fabBtn as HTMLElement).style.visibility = 'hidden';
      if (dialogPanel) (dialogPanel as HTMLElement).style.visibility = 'hidden';

      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: 1.0,
      });

      let finalCanvas = canvas;
      const maxDim = 1000;
      if (canvas.width > maxDim || canvas.height > maxDim) {
        const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height);
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
      if (screenshot.length > 600000) {
        screenshot = finalCanvas.toDataURL('image/jpeg', 0.4);
      }
      if (screenshot.length > 600000) {
        screenshot = '';
      }
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    } finally {
      if (fabBtn) (fabBtn as HTMLElement).style.visibility = 'visible';
      if (dialogPanel) (dialogPanel as HTMLElement).style.visibility = 'visible';
    }

    const payload = {
      userId: user.uid,
      userEmail: user.email?.toLowerCase() || 'anonymous',
      userName: user.displayName || 'Anonymous User',
      type,
      kind,
      message: message.trim(),
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
    setTimeout(close, 2200);

    // 2. Best-effort side-effects — their failure must not revert the success
    try {
      await logActivity({
        action: 'submitted feedback',
        targetId: 'feedback_root',
        targetName: kindMeta(kind).label,
        targetType: 'contact',
        description: `User left a note (${kindMeta(kind).label}): "${message.slice(0, 40)}${message.length > 40 ? '...' : ''}"`,
        type: 'create',
      });

      await sendNotification({
        userId: user.uid,
        title: 'We got your note',
        message: 'Thank you! Your note has been saved and our admins have been notified.',
        type: 'success',
      });
    } catch (error) {
      console.error('Feedback saved, but follow-up log/notify failed:', error);
    }
  };

  if (!user) return null;

  const firstName = (user.displayName || '').trim().split(/\s+/)[0] || 'friend';
  const activeMeta = kindMeta(kind);

  return (
    <>
      {/* FAB Button — pencil, morphs to × when open */}
      <button
        id="feedback-fab-btn"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[100] w-12 h-12 rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center border-none cursor-pointer ${
          isOpen
            ? 'bg-surface-container-highest text-on-surface-variant'
            : 'bg-primary text-on-primary hover:scale-105'
        }`}
        title={isOpen ? 'Close' : 'Leave a note for the team'}
        aria-label={isOpen ? 'Close feedback panel' : 'Leave a note for the team'}
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
              aria-label="Leave a note for the team"
              className="fixed bottom-36 right-4 lg:bottom-20 lg:right-6 z-[120] w-[calc(100vw-2rem)] max-w-[340px] bg-surface-container border border-outline-variant rounded-2xl shadow-2xl p-5 focus:outline-none"
            >
              {phase === 'done' ? (
                /* Success */
                <div className="flex flex-col items-center text-center gap-2 py-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary grid place-items-center text-xl mb-1">
                    ✦
                  </div>
                  <p className="font-serif text-lg text-on-surface">We got your note.</p>
                  <p className="text-sm text-on-surface-variant">Thank you for taking the time, {firstName}.</p>
                </div>
              ) : (
                /* Form */
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-serif text-lg font-medium text-on-surface leading-snug">Leave a note</h3>
                    <p className="text-[13px] text-on-surface-variant leading-snug">
                      Ideas, friction, appreciation — all welcome.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of note">
                    {FEEDBACK_KINDS.map((k) => {
                      const on = kind === k.id;
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => setKind(k.id)}
                          className={`text-[12.5px] rounded-full px-3 py-1 border transition-colors cursor-pointer ${
                            on
                              ? `${TONE_CLASSES[k.tone].chip} border-transparent font-medium`
                              : 'text-on-surface-variant bg-surface border-outline-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {k.label}
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    ref={areaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
                    }}
                    rows={4}
                    maxLength={600}
                    placeholder={activeMeta.placeholder}
                    aria-label="Your note"
                    className="w-full resize-none bg-surface border border-outline-variant rounded-xl p-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-on-surface-variant truncate min-w-0">
                      {user.displayName || 'You'} · {roleLabel(role)}
                    </span>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSend}
                      className="shrink-0 py-1.5 px-4 bg-primary text-on-primary font-semibold rounded-full text-[13px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default border-none cursor-pointer"
                    >
                      {phase === 'busy' ? 'Sending…' : 'Send'}
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
