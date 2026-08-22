import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Notification } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell, Info, CheckCircle2, AlertCircle, UserPlus, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { Translate } from './Translate';

export default function Toaster() {
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for NEW unread notifications
    // We only want to show toasts for notifications created AFTER the session started
    const sessionStartTime = new Date();

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const notification = { id: change.doc.id, ...data } as Notification;
          
          // Check if it's a recent notification (not an old unread one)
          // serverTimestamp() is null in the initial local snapshot, treat as "now"
          const createdAt = data.createdAt?.toDate?.() || new Date();
          if (createdAt >= sessionStartTime) {
            showToast(notification);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, []);

  const showToast = (notification: Notification) => {
    setActiveToasts(prev => {
      // Don't add if already there
      if (prev.find(t => t.id === notification.id)) return prev;
      return [...prev, notification];
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        removeToast(notification.id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'assignment': return <UserPlus className="w-5 h-5 text-blue-500" />;
      case 'event': return <Calendar className="w-5 h-5 text-purple-500" />;
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'error': return <X className="w-5 h-5 text-red-500" />;
      default: return <Info className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
      <AnimatePresence>
        {activeToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="pointer-events-auto"
          >
            <div className="bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant rounded-2xl shadow-2xl p-4 flex gap-4 w-full group relative overflow-hidden ring-1 ring-white/10">
              {/* Progress bar */}
              <motion.div 
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 5, ease: "linear" }}
                className={cn(
                    "absolute bottom-0 left-0 h-1 bg-primary/20",
                    toast.type === 'success' && "bg-green-500/20",
                    toast.type === 'error' && "bg-red-500/20",
                    toast.type === 'warning' && "bg-amber-500/20"
                )}
              />

              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border",
                "bg-surface border-outline-variant "
              )}>
                {getIcon(toast.type)}
              </div>
              
              <div className="flex-1 min-w-0 py-0.5">
                <p className="text-sm font-semibold text-on-surface mb-0.5"><Translate text={toast.title} /></p>
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                  <Translate text={toast.message} />
                </p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-full hover:bg-surface-variant text-on-surface-variant self-start transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
