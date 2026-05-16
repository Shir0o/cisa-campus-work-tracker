import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, X, AlertCircle, Info, CheckCircle2, UserPlus, Calendar as CalendarIcon, MessageSquare } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Notification } from '../../types';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    let localNotifs: Notification[] = [];
    let globalNotifs: Notification[] = [];

    const updateCombined = () => {
      // Merge, sort by date descending, take top 20
      const combined = [...localNotifs, ...globalNotifs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
      
      setNotifications(combined);
      setUnreadCount(combined.filter(n => !n.read).length);
    };

    const qPersonal = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const qGlobal = query(
      collection(db, 'notifications'),
      where('userId', '==', 'ALL_ADMINS'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubPersonal = onSnapshot(qPersonal, (snapshot) => {
      localNotifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as Notification[];
      updateCombined();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    const unsubGlobal = onSnapshot(qGlobal, (snapshot) => {
      globalNotifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as Notification[];
      updateCombined();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => {
      unsubPersonal();
      unsubGlobal();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!auth.currentUser) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'assignment': return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'event': return <CalendarIcon className="w-4 h-4 text-purple-500" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'error': return <X className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2.5 rounded-full transition-all group hover:bg-surface-container-highest",
          isOpen ? "bg-surface-container-highest text-primary" : "text-on-surface-variant"
        )}
        aria-label="Notifications"
      >
        <Bell className={cn("w-5 h-5 transition-transform duration-300", isOpen && "rotate-[15deg]")} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-4 h-4 bg-error text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-background animate-in zoom-in duration-300">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute right-0 mt-3 w-80 sm:w-96 bg-surface-container-high rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden z-50 flex flex-col max-h-[600px]"
          >
            <div className="px-6 py-5 flex items-center justify-between border-b border-outline-variant bg-surface/50 backdrop-blur-md">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Notifications</h3>
                <p className="text-xs text-on-surface-variant font-medium">You have {unreadCount} unread messages</p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
              {notifications.length === 0 ? (
                <div className="py-16 text-center px-6">
                  <div className="w-16 h-16 bg-surface-container-highest rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-8 h-8 text-on-surface-variant/40" />
                  </div>
                  <h4 className="text-on-surface font-bold">All caught up!</h4>
                  <p className="text-xs text-on-surface-variant mt-1">No new notifications at the moment.</p>
                </div>
              ) : (
                <div className="space-y-1 px-2">
                  {notifications.map((notification) => (
                    <motion.div
                      layout
                      key={notification.id}
                      className={cn(
                        "group relative flex gap-4 p-4 rounded-2xl transition-all cursor-pointer",
                        notification.read 
                          ? "hover:bg-surface-container-highest/50" 
                          : "bg-surface-container-highest/50 hover:bg-surface-container-highest"
                      )}
                      onClick={() => !notification.read && markAsRead(notification.id)}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border",
                        notification.read ? "bg-surface border-outline-variant" : "bg-primary-container border-primary/20 shadow-sm"
                      )}>
                        {getIcon(notification.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className={cn(
                            "text-sm truncate",
                            notification.read ? "font-medium text-on-surface-variant" : "font-bold text-on-surface"
                          )}>
                            {notification.title}
                          </p>
                          <span className="text-[10px] text-on-surface-variant whitespace-nowrap">
                            {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                      </div>

                      {!notification.read && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full" />
                      )}

                      <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="p-1.5 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-4 bg-surface-container-highest/30 border-t border-outline-variant/30">
                <button className="w-full py-2 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors">
                  View all activity
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
