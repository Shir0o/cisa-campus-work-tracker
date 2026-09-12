import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Send, ArrowRight, Loader2, Clock, CheckCircle, Ban, Sparkles } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { Translate } from '../components/Translate';
import { useTranslate } from '../hooks/useTranslate';
import { useNavigate } from 'react-router-dom';
import { roleLabel } from '../lib/permissions';
import { FEEDBACK_KINDS, kindMeta, kindToType, outcomeCopy, outcomeLabel, TONE_CLASSES } from '../lib/feedbackKinds';
import { capturePageScreenshot } from '../lib/feedbackScreenshot';
import { Feedback, FeedbackKind } from '../types';
import PageContainer from '../components/layout/PageContainer';


export default function SubmitFeedback() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [pastNotes, setPastNotes] = useState<Feedback[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const q = query(
      collection(db, 'feedback'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Feedback[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          items.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          } as Feedback);
        });
        setPastNotes(items);
      },
      (err) => {
        console.error('Failed to subscribe to user feedback:', err);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const activeMeta = kindMeta(kind);
  const { translatedText: activePlaceholder } = useTranslate(activeMeta.placeholder);
  const { translatedText: translatedRole } = useTranslate(roleLabel(role));
  const firstName = (user?.displayName || '').trim().split(/\s+/)[0] || t('common.you');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user || isSubmitting) return;

    setIsSubmitting(true);

    const type = kindToType(kind);
    const screenshot = await capturePageScreenshot();

    const payload = {
      userId: user.uid,
      userName: user.displayName || 'Anonymous User',
      type,
      kind,
      message: message.trim(),
      screenshot,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio})`,
    };

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

      await logActivity({
        action: 'submitted feedback',
        targetId: 'feedback_root',
        targetName: kindMeta(kind).label,
        targetType: 'contact',
        description: `User left a note (${kindMeta(kind).label}): "${message.slice(0, 40)}${message.length > 40 ? '...' : ''}"`,
        type: 'create',
      });

      setIsSubmitted(true);
      setMessage('');
    } catch (error) {
      console.error('Failed to submit feedback through page form:', error);
      try {
        handleFirestoreError(error, OperationType.WRITE, 'feedback');
      } catch (e) {
        // Fallback or warning
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <PageContainer variant="reading" className="max-w-2xl space-y-6" id="submit-feedback-page">
      <div>
        <h1 className="font-serif page-title font-medium tracking-tight text-on-background">{t('feedback.leave_a_note')}</h1>
        <p className="text-sm text-on-surface-variant max-w-prose">
          {t('feedback.all_welcome')} {t('feedback.goes_to_team')}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!isSubmitted ? (
          <motion.div
            key="feedback-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="bg-surface-container border border-outline-variant p-6 rounded-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Kind selection */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-3">
                  {t('feedback.what_kind_of_note')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {FEEDBACK_KINDS.map((k) => {
                    const Icon = k.icon;
                    const on = kind === k.id;
                    const tone = TONE_CLASSES[k.tone];
                    return (
                      <button
                        key={k.id}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setKind(k.id)}
                        className={`flex items-center gap-3 p-3.5 rounded border transition-all text-left cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                          on
                            ? `${tone.softBg} border-transparent ${tone.text} `
                            : 'bg-surface border-outline-variant text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        <div className={`p-2 rounded-sm shrink-0 ${on ? tone.chip : 'bg-surface-container text-on-surface-variant'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-sm"><Translate text={k.label} /></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Entry */}
              <div>
                <label htmlFor="form-message" className="block text-sm font-semibold text-on-surface mb-1.5">
                  {t('feedback.tell_us_more')}
                </label>
                <textarea
                  id="form-message"
                  required
                  disabled={isSubmitting}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={5000}
                  placeholder={activePlaceholder}
                  className="w-full bg-surface border border-outline-variant rounded-sm p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow resize-none disabled:opacity-60"
                />
                <div className="flex justify-between items-center mt-2 px-1 text-xs text-on-surface-variant">
                  <span>{user?.displayName || t('common.you')} · {translatedRole}</span>
                  <span>{t('feedback.cmd_to_send')} · {message.length} {t('feedback.characters')}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-outline-variant">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => navigate(-1)}
                  className="py-2.5 px-6 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  {t('actions.back')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="py-2.5 px-6 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('feedback.sending')}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{t('feedback.send')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="feedback-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface-container border border-outline-variant p-10 rounded-3xl text-center space-y-6 flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-primary/10 text-accent rounded-full flex items-center justify-center text-3xl">
              ✦
            </div>
            <div className="space-y-2">
              <h3 className="font-serif text-2xl font-medium text-on-surface">{t('feedback.we_got_your_note')}</h3>
              <p className="text-sm text-on-surface-variant max-w-md leading-relaxed mx-auto">
                {t('feedback.saved_body').replace('{name}', firstName)}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full justify-center">
              <button
                onClick={() => setIsSubmitted(false)}
                className="py-2.5 px-6 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors"
              >
                {t('feedback.send_another')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="py-2.5 px-6 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 justify-center transition-all"
              >
                {t('feedback.go_home')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pastNotes.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-outline-variant/60" aria-label={t('feedback.your_past_notes')}>
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-medium text-on-surface">
              {t('feedback.your_past_notes')}
            </h2>
            <span className="text-xs text-on-surface-variant font-mono">
              {pastNotes.length}
            </span>
          </div>

          <div className="space-y-3">
            {pastNotes.map((note) => {
              const meta = kindMeta(note.kind);
              const tone = TONE_CLASSES[meta.tone];
              const formattedDate = (() => {
                try {
                  return new Date(note.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                } catch {
                  return note.createdAt;
                }
              })();

              return (
                <div
                  key={note.id}
                  className="bg-surface-container border border-outline-variant p-4.5 rounded-xl space-y-3 relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${tone.bar}`} />

                  <div className="flex items-center justify-between gap-3 text-xs pl-1">
                    <span className={`inline-flex items-center gap-1 font-semibold py-0.5 px-2 rounded ${tone.chip}`}>
                      {meta.label}
                    </span>
                    <span className="text-on-surface-variant">{formattedDate}</span>
                  </div>

                  <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed pl-1">
                    {note.message}
                  </p>

                  <div className="pt-2 border-t border-outline-variant/40 flex items-start gap-2 pl-1 text-xs">
                    {note.outcome ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          {note.outcome === 'shipped' && (
                            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                              <Sparkles className="w-3.5 h-3.5" />
                              {outcomeLabel('shipped')}
                            </span>
                          )}
                          {note.outcome === 'not-planned' && (
                            <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                              <Ban className="w-3.5 h-3.5" />
                              {outcomeLabel('not-planned')}
                            </span>
                          )}
                          {note.outcome === 'already-there' && (
                            <span className="inline-flex items-center gap-1 text-accent">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {outcomeLabel('already-there')}
                            </span>
                          )}
                        </div>
                        <p className="text-on-surface-variant leading-relaxed">
                          {outcomeCopy(note.outcome)}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-on-surface-variant/80">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t('feedback.still_open')}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </PageContainer>
  );
}

