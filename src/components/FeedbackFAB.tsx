import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquareText, Bug, Sparkles, X, Send } from 'lucide-react';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, logActivity, sendNotification } from '../lib/firebase';
import { useAuth } from './AuthProvider';

export default function FeedbackFAB() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'enhancement'>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user) return;

    setIsSubmitting(true);

    const feedbackData = {
      userId: user.uid,
      userEmail: user.email?.toLowerCase() || 'anonymous',
      userName: user.displayName || 'Anonymous User',
      type: feedbackType,
      message: message.trim(),
      status: 'new' as const,
      createdAt: serverTimestamp(),
    };

    // Optimistic flow: immediately close, reset, and show a beautiful toast
    setIsOpen(false);
    setMessage('');
    setFeedbackType('bug');
    setIsSubmitting(false);

    try {
      // 1. Write feedback record
      await addDoc(collection(db, 'feedback'), feedbackData);

      // 2. Log System Activity
      await logActivity({
        action: 'submitted feedback',
        targetId: 'feedback_root',
        targetName: feedbackType === 'bug' ? 'Bug Report' : 'Enhancement Suggestion',
        targetType: 'contact', // nearest targetType in schema
        description: `User submitted a ${feedbackType} feedback: "${message.slice(0, 40)}${message.length > 40 ? '...' : ''}"`,
        type: 'create',
      });

      // 3. Dispatch Notification for feedback confirmation (triggers Toaster toast)
      await sendNotification({
        userId: user.uid,
        title: feedbackType === 'bug' ? 'Bug Report Submitted' : 'Enhancement Suggested',
        message: 'Thank you! Your feedback has been saved and our admins have been notified.',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      // Try to report the issue using standard Firestore logger
      try {
        handleFirestoreError(error, OperationType.WRITE, 'feedback');
      } catch (e) {
        // Fallback for user view
      }
    }
  };

  if (!user) return null;

  return (
    <>
      {/* FAB Button */}
      <button
        id="feedback-fab-btn"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[100] w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center p-3 sm:p-4 border-none cursor-pointer"
        title="Leave Feedback"
      >
        <MessageSquareText className="w-6 h-6 animate-pulse" />
      </button>

      {/* Backdrop & Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[110]"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed inset-x-4 top-[15%] mx-auto max-w-md bg-surface-container border border-outline-variant rounded-3xl p-6 shadow-2xl z-[120] focus:outline-none"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-xl font-bold text-on-surface">Leave Feedback</h3>
                  <p className="text-xs text-on-surface-variant">Help us improve the Campus Hub experience</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors border-none"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type segment selector */}
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">
                    Feedback Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-surface p-1 rounded-2xl border border-outline-variant">
                    <button
                      type="button"
                      onClick={() => setFeedbackType('bug')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-semibold text-xs transition-all border-none ${
                        feedbackType === 'bug'
                          ? 'bg-error-container text-on-error-container shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      <Bug className="w-4 h-4" />
                      Bug Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedbackType('enhancement')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-semibold text-xs transition-all border-none ${
                        feedbackType === 'enhancement'
                          ? 'bg-primary-container text-on-primary-container shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      Enhancement Needed
                    </button>
                  </div>
                </div>

                {/* Message input */}
                <div>
                  <label htmlFor="feedback-message" className="block text-sm font-medium text-on-surface mb-1">
                    Describe details below
                  </label>
                  <textarea
                    id="feedback-message"
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      feedbackType === 'bug'
                        ? "What went wrong? E.g., clicking the 'attendance' page freezes the browser..."
                        : "What details would you like us to add or improve? E.g., I'd love a search filter in history..."
                    }
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow duration-200 resize-none"
                  />
                </div>

                {/* Submit Panel */}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="py-2.5 px-5 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Feedback
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
