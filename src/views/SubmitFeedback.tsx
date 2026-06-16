import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, ArrowRight } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { roleLabel } from '../lib/permissions';
import { FEEDBACK_KINDS, kindMeta, kindToType, TONE_CLASSES } from '../lib/feedbackKinds';
import { FeedbackKind } from '../types';

export default function SubmitFeedback() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const activeMeta = kindMeta(kind);
  const firstName = (user?.displayName || '').trim().split(/\s+/)[0] || 'friend';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user || isSubmitting) return;

    setIsSubmitting(true);

    const type = kindToType(kind);

    // Auto-capture screenshot and diagnostic information
    let screenshot = '';
    try {
      const fabBtn = document.getElementById('feedback-fab-btn');
      if (fabBtn) (fabBtn as HTMLElement).style.visibility = 'hidden';

      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: 0.75,
      });

      if (fabBtn) (fabBtn as HTMLElement).style.visibility = 'visible';

      let finalCanvas = canvas;
      const maxDim = 1000;
      if (canvas.width > maxDim || canvas.height > maxDim) {
        const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width * scale;
        tempCanvas.height = canvas.height * scale;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
          finalCanvas = tempCanvas;
        }
      }
      screenshot = finalCanvas.toDataURL('image/jpeg', 0.6);
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
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

      await sendNotification({
        userId: user.uid,
        title: 'We got your note',
        message: 'Thank you! The application admins have been notified.',
        type: 'success',
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
    <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6" id="submit-feedback-page">
      <div>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-on-background">Leave a note</h1>
        <p className="text-sm text-on-surface-variant max-w-prose">
          Ideas, friction, appreciation — all welcome. Your note goes straight to the team.
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
            className="bg-surface-container border border-outline-variant p-6 rounded-3xl shadow-sm"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Kind selection */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-3">
                  What kind of note is it?
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
                        onClick={() => setKind(k.id)}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                          on
                            ? `${tone.softBg} border-transparent ${tone.text} shadow-xs`
                            : 'bg-surface border-outline-variant text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        <div className={`p-2 rounded-xl shrink-0 ${on ? tone.chip : 'bg-surface-container text-on-surface-variant'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-sm">{k.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Entry */}
              <div>
                <label htmlFor="form-message" className="block text-sm font-semibold text-on-surface mb-1.5">
                  Tell us more
                </label>
                <textarea
                  id="form-message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={5000}
                  placeholder={activeMeta.placeholder}
                  className="w-full bg-surface border border-outline-variant rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow resize-none"
                />
                <div className="flex justify-between items-center mt-2 px-1 text-xs text-on-surface-variant">
                  <span>{user?.displayName || 'You'} · {roleLabel(role)}</span>
                  <span>⌘↵ to send · {message.length} characters</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="py-2.5 px-6 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="py-2.5 px-6 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Sending…' : 'Send'}
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
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center text-3xl">
              ✦
            </div>
            <div className="space-y-2">
              <h3 className="font-serif text-2xl font-medium text-on-surface">We got your note.</h3>
              <p className="text-sm text-on-surface-variant max-w-md leading-relaxed mx-auto">
                Thank you for taking the time, {firstName}. Your note has been saved and our
                administrators will read it soon.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full justify-center">
              <button
                onClick={() => setIsSubmitted(false)}
                className="py-2.5 px-6 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors"
              >
                Send another
              </button>
              <button
                onClick={() => navigate('/')}
                className="py-2.5 px-6 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 justify-center transition-all"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
