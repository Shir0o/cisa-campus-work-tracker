import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquareText, Bug, Sparkles, Send, CheckCircle2, ArrowRight } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useNavigate } from 'react-router-dom';

export default function SubmitFeedback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [feedbackType, setFeedbackType] = useState<'bug' | 'enhancement'>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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

    try {
      // 1. Save feedback record to firestore
      await addDoc(collection(db, 'feedback'), feedbackData);

      // 2. Log Activity
      await logActivity({
        action: 'submitted feedback',
        targetId: 'feedback_root',
        targetName: feedbackType === 'bug' ? 'Bug Report' : 'Enhancement Suggestion',
        targetType: 'contact',
        description: `User submitted ${feedbackType}: "${message.slice(0, 40)}${message.length > 40 ? '...' : ''}"`,
        type: 'create',
      });

      // 3. Dispatch Success Notification (triggers live toaster view)
      await sendNotification({
        userId: user.uid,
        title: feedbackType === 'bug' ? 'Bug Report Received' : 'Suggestion Received',
        message: 'Thank you! The application admins have been notified of your feedback.',
        type: 'success',
      });

      // Trigger submittal transition
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

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6" id="submit-feedback-page">
      <div>
        <h1 className="text-3xl font-regular tracking-tight text-on-background">Submit Feedback</h1>
        <p className="text-sm text-on-surface-variant">
          Spotted an issue or have an idea to make Campus Hub better? Send it directly to our administration team.
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
              {/* Type Category selection */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-3">
                  What kind of feedback do you have?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFeedbackType('bug')}
                    className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer h-24 ${
                      feedbackType === 'bug'
                        ? 'bg-error-container/15 border-error text-on-error-container shadow-xs'
                        : 'bg-surface border-outline-variant text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${
                      feedbackType === 'bug' ? 'bg-error text-on-error' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      <Bug className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">Report a Bug</div>
                      <p className="text-[11px] text-on-surface-variant opacity-90 mt-0.5 leading-normal">
                        Let us know if something isn't working as expected.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFeedbackType('enhancement')}
                    className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer h-24 ${
                      feedbackType === 'enhancement'
                        ? 'bg-primary-container/20 border-primary text-on-primary-container shadow-xs'
                        : 'bg-surface border-outline-variant text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${
                      feedbackType === 'enhancement' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">Request Enhancement</div>
                      <p className="text-[11px] text-on-surface-variant opacity-90 mt-0.5 leading-normal">
                        Suggest feature ideas, upgrades, or enhancements.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Message Entry */}
              <div>
                <label htmlFor="form-message" className="block text-sm font-semibold text-on-surface mb-1.5">
                  Describe Your Suggestion or Issue
                </label>
                <textarea
                  id="form-message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    feedbackType === 'bug'
                      ? "Please give enough details: e.g. steps taken, what failed, page name..."
                      : "Briefly explain the feature or change you have in mind and how it helps the hub..."
                  }
                  className="w-full bg-surface border border-outline-variant rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow resize-none"
                />
                <div className="flex justify-between items-center mt-2 px-1 text-xs text-on-surface-variant">
                  <span>Admins will receive your report with your user profile</span>
                  <span>{message.length} characters</span>
                </div>
              </div>

              {/* Actions submit */}
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
                  {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
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
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-on-surface">Feedback Received!</h3>
              <p className="text-sm text-on-surface-variant max-w-md leading-relaxed mx-auto">
                Thank you for contributing to the betterment of Campus Hub. Your feedback has been registered and 
                our administrators will review it shortly.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full justify-center">
              <button
                onClick={() => setIsSubmitted(false)}
                className="py-2.5 px-6 border border-outline text-on-surface bg-transparent font-semibold rounded-full text-xs hover:bg-surface-variant transition-colors"
              >
                Send Another Response
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
