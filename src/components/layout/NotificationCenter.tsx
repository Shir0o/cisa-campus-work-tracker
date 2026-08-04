import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Heart, Sparkles, Calendar, Users, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, updateDoc, deleteDoc, writeBatch, arrayUnion,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import { Notification } from '../../types';
import { cn, ntfWhen } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { showWebPushNotification } from '../../lib/webPush';

type Tone = 'accent' | 'violet' | 'amber' | 'teal' | 'sage';

function typeToTone(type: Notification['type']): Tone {
  switch (type) {
    case 'assignment': return 'teal';   // new person / relationship
    case 'event':      return 'amber';  // calendar / gathering
    case 'success':    return 'sage';   // answered prayer / success
    case 'warning':    return 'amber';  // caution
    case 'error':      return 'amber';  // caution (not relationship)
    default:           return 'accent';
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  accent: 'text-stage-accent bg-stage-accent-soft',
  violet: 'text-stage-violet bg-stage-violet-soft',
  amber:  'text-stage-amber  bg-stage-amber-soft',
  teal:   'text-stage-teal   bg-stage-teal-soft',
  sage:   'text-success bg-success/10',
};

function ToneIcon({ tone, type }: { tone: Tone; type?: Notification['type'] }) {
  const cls = 'w-[15px] h-[15px]';
  // Use type to disambiguate within a tone (e.g. amber can be calendar or caution)
  if (type === 'warning' || type === 'error') return <AlertCircle className={cls} />;
  if (type === 'assignment') return <Users className={cls} />;
  switch (tone) {
    case 'violet': return <Sparkles    className={cls} />;
    case 'amber':  return <Calendar    className={cls} />;
    case 'teal':   return <Users       className={cls} />;
    case 'sage':   return <CheckCircle2 className={cls} />;
    default:       return <Heart       className={cls} />;
  }
}

export default function NotificationCenter() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    let localNotifs: Notification[] = [];
    let globalNotifs: Notification[] = [];
    let isInitialPersonal = true;

    const updateCombined = () => {
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
      limit(20),
    );

    const qGlobal = query(
      collection(db, 'notifications'),
      where('userId', '==', 'ALL_ADMINS'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const mapDoc = (d: any): Notification => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        read: data.readBy?.includes(auth.currentUser?.uid) ?? data.read,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    };

    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      localNotifs = snap.docs
        .map(mapDoc)
        .filter((n: any) => !n.dismissedBy?.includes(auth.currentUser?.uid)) as Notification[];

      if (!isInitialPersonal) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const notif = mapDoc(change.doc);
            if (!notif.read && auth.currentUser && notif.userId === auth.currentUser.uid) {
              void showWebPushNotification(notif.title, {
                body: notif.message,
                data: { link: notif.link || '/', targetId: notif.targetId },
              });
            }
          }
        });
      }
      isInitialPersonal = false;
      updateCombined();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    const unsubGlobal = onSnapshot(qGlobal, (snap) => {
      globalNotifs = snap.docs
        .map(mapDoc)
        .filter((n: any) => !n.dismissedBy?.includes(auth.currentUser?.uid)) as Notification[];
      updateCombined();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    return () => { unsubPersonal(); unsubGlobal(); };
  }, []);


  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const markAsRead = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true,
        readBy: arrayUnion(auth.currentUser.uid),
      });
    } catch (e) { console.error('Error marking as read:', e); }
  };

  const markAllAsRead = async () => {
    if (!auth.currentUser) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), {
        read: true,
        readBy: arrayUnion(auth.currentUser!.uid),
      });
    });
    await batch.commit();
  };

  const setAside = async (id: string) => {
    if (!auth.currentUser) return;
    const notif = notifications.find(n => n.id === id);
    if (!notif) return;
    try {
      if (notif.userId === 'ALL_ADMINS') {
        await updateDoc(doc(db, 'notifications', id), {
          dismissedBy: arrayUnion(auth.currentUser.uid),
        });
      } else {
        await deleteDoc(doc(db, 'notifications', id));
      }
    } catch (e) { console.error('Error setting aside:', e); }
  };

  const isStaff = role === 'admin' || role === 'manager';

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);

    const handleSelectNotification = (notif: Notification) => {
      if (!notif.read) {
        void markAsRead(notif.id);
      }
      setIsOpen(false);
      if (notif.link) {
        navigate(notif.link);
      } else if (notif.targetId) {
        if (notif.title?.toLowerCase().includes('message')) {
          navigate(`/messages/${notif.targetId}`);
        } else if (notif.type === 'assignment') {
          navigate('/coordination');
        }
      }
    };

    return (
      <div className="relative flex-none inline-flex" ref={dropdownRef}>
        {/* Bell button */}
        <button
          onClick={() => setIsOpen(o => !o)}
          className={cn(
            'relative w-[38px] h-[38px] grid place-items-center rounded-[10px] border transition-all duration-120',
            isOpen
              ? 'bg-stage-accent-soft text-primary border-primary/30'
              : 'bg-transparent text-on-surface-variant border-transparent hover:bg-surface-container-high hover:text-on-surface',
          )}
          aria-label={unreadCount ? `${unreadCount} new notifications` : 'Notifications'}
        >
          <Bell className={cn('w-[17px] h-[17px] transition-transform duration-300', isOpen && 'rotate-[15deg]')} />
          {unreadCount > 0 && (
            <span className="absolute top-[-3px] right-[-3px] min-w-[16px] h-[16px] px-[4px] rounded-full bg-primary text-white text-[10.5px] font-bold leading-[16px] text-center border-2 border-surface-container box-content">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ y: -6, scale: 0.985 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -6, scale: 0.985 }}
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-label="Notifications"
              className={cn(
                'absolute right-0 top-[calc(100%+12px)] z-50',
                'w-96 max-w-[calc(100vw-28px)]',
                'flex flex-col max-h-[min(640px,78vh)]',
                'bg-surface-container border border-outline-variant rounded-[16px] overflow-hidden',
                'shadow-xl',
                // mobile: fixed full-width strip
                'max-sm:fixed max-sm:top-16 max-sm:right-3 max-sm:left-3 max-sm:w-auto',
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-[18px] py-4 border-b border-outline-variant flex-none">
                <div className="min-w-0">
                  <div className="font-serif text-[19px] font-medium tracking-[-0.01em] text-on-surface leading-tight">
                    What's stirring
                  </div>
                  <div className="text-[12.5px] text-outline mt-0.5">
                    {unreadCount > 0
                      ? `${unreadCount} ${unreadCount === 1 ? 'thing' : 'things'} since you last looked`
                      : "You're all caught up"}
                  </div>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex-none whitespace-nowrap text-primary text-[12.5px] font-semibold px-1.5 py-1 rounded-[7px] hover:bg-stage-accent-soft transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 min-h-0">
                {notifications.length === 0 ? (
                  <div className="py-11 px-8 text-center">
                    <div className="w-[46px] h-[46px] rounded-full bg-stage-accent-soft text-primary grid place-items-center mx-auto mb-3.5">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div className="font-serif text-[17px] font-medium text-on-surface">
                      Nothing needs you right now
                    </div>
                    <div className="text-[13px] text-outline mt-1.5 leading-[1.55] [text-wrap:pretty]">
                      A quiet inbox is a kind of grace. We'll let you know when something stirs.
                    </div>
                  </div>
                ) : (
                  <>
                    {unread.length > 0 && (
                      <NtfGroup label="Worth a look" items={unread} onSelect={handleSelectNotification} onSetAside={setAside} />
                    )}
                    {read.length > 0 && (
                      <NtfGroup
                        label="Earlier"
                        items={read}
                        onSelect={handleSelectNotification}
                        onSetAside={setAside}
                        bordered={unread.length > 0}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <button
                  onClick={() => { setIsOpen(false); navigate(isStaff ? '/history' : '/prayer'); }}
                  className="flex-none flex items-center justify-center gap-[7px] p-[13px] bg-surface border-t border-outline-variant text-primary text-[13px] font-semibold hover:bg-stage-accent-soft transition-colors"
                >
                  {isStaff ? 'See the whole record in History' : 'Open Prayer'}
                  <ArrowRight className="w-[14px] h-[14px]" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  function NtfGroup({
    label,
    items,
    onSelect,
    onSetAside,
    bordered = false,
  }: {
    label: string;
    items: Notification[];
    onSelect: (notif: Notification) => void;
    onSetAside: (id: string) => void;
    bordered?: boolean;
  }) {
    return (
      <div className={cn('py-1.5', bordered && 'border-t border-outline-variant')}>
        <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-outline px-[18px] pt-2.5 pb-1.5">
          {label}
        </div>
        {items.map(n => <NtfItem key={n.id} notif={n} onSelect={onSelect} onSetAside={onSetAside} />)}
      </div>
    );
  }

  function NtfItem({
    notif,
    onSelect,
    onSetAside,
  }: {
    notif: Notification;
    onSelect: (notif: Notification) => void;
    onSetAside: (id: string) => void;
  }) {
    const tone: Tone = notif.tone ?? typeToTone(notif.type);

    return (
      <div
        className="group relative flex gap-[13px] items-start px-[18px] py-3 cursor-pointer text-left transition-colors duration-110 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        onClick={() => onSelect(notif)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') onSelect(notif); }}
      >
        {/* Tonal icon node */}
        <span
          className={cn(
            'w-[30px] h-[30px] flex-none rounded-[9px] grid place-items-center mt-px transition-opacity',
            TONE_CLASSES[tone],
            notif.read && 'opacity-[0.62]',
          )}
        >
          <ToneIcon tone={tone} type={notif.tone ? undefined : notif.type} />
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1 pr-[18px]">
          <div className={cn(
            'text-[14px] leading-[1.35]',
            notif.read
              ? 'font-medium text-on-surface-variant'
              : 'font-semibold text-on-surface',
          )}>
            {notif.title}
          </div>
          <div className="text-[13px] text-on-surface-variant leading-[1.5] mt-0.5 [text-wrap:pretty]">
            {notif.message}
          </div>
          <div className="text-[11.5px] text-outline mt-1.5">
            {ntfWhen(notif.createdAt)}
          </div>
        </div>

        {/* Unread dot */}
        {!notif.read && (
          <span className="absolute top-[17px] right-4 w-[7px] h-[7px] rounded-full bg-primary" aria-hidden />
        )}

        {/* Set-aside button (hover-reveal, sits on top of unread dot) */}
        <button
          className="absolute top-[11px] right-3 w-[22px] h-[22px] grid place-items-center rounded-[6px] bg-surface-container text-outline opacity-0 group-hover:opacity-100 hover:text-on-surface hover:bg-surface-container-high transition-all"
          title="Set aside"
          aria-label="Set aside"
          onClick={e => { e.stopPropagation(); onSetAside(notif.id); }}
        >
          <X className="w-[13px] h-[13px]" />
        </button>
      </div>
    );
  }
