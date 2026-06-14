import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Heart, Sparkles, Calendar, Users, CheckCircle2, ArrowRight } from 'lucide-react';
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

type Tone = 'accent' | 'violet' | 'amber' | 'teal' | 'sage';

function typeToTone(type: Notification['type']): Tone {
  switch (type) {
    case 'assignment': return 'accent';
    case 'event':      return 'amber';
    case 'success':    return 'sage';
    case 'warning':    return 'amber';
    case 'error':      return 'teal';
    default:           return 'accent';
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  accent: 'text-[var(--accent)] bg-[var(--accent-soft)]',
  violet: 'text-[var(--violet)] bg-[var(--violet-soft)]',
  amber:  'text-[var(--amber)]  bg-[var(--amber-soft)]',
  teal:   'text-[var(--teal)]   bg-[var(--teal-soft)]',
  sage:   'text-[var(--success)] bg-[var(--success-soft)]',
};

function ToneIcon({ tone }: { tone: Tone }) {
  const cls = 'w-[15px] h-[15px]';
  switch (tone) {
    case 'violet': return <Sparkles className={cls} />;
    case 'amber':  return <Calendar  className={cls} />;
    case 'teal':   return <Users     className={cls} />;
    case 'sage':   return <CheckCircle2 className={cls} />;
    default:       return <Heart     className={cls} />;
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

  return (
    <div className="relative flex-none inline-flex" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={cn(
          'relative w-[38px] h-[38px] grid place-items-center rounded-[10px] border transition-all duration-120',
          isOpen
            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-line)]'
            : 'bg-transparent text-[var(--text-dim)] border-transparent hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
        )}
        aria-label={unreadCount ? `${unreadCount} new notifications` : 'Notifications'}
      >
        <Bell className={cn('w-[17px] h-[17px] transition-transform duration-300', isOpen && 'rotate-[15deg]')} />
        {unreadCount > 0 && (
          <span className="absolute top-[4px] right-[4px] min-w-[16px] h-[16px] px-[4px] rounded-full bg-[var(--accent)] text-white text-[10.5px] font-bold leading-[16px] text-center border-2 border-[var(--bg-elev)] box-content">
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
              'bg-[var(--bg-elev)] border border-[var(--border)] rounded-[16px] overflow-hidden',
              'shadow-[var(--shadow-pop)]',
              // mobile: fixed full-width strip
              'max-sm:fixed max-sm:top-16 max-sm:right-3 max-sm:left-3 max-sm:w-auto',
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-[18px] py-4 border-b border-[var(--border-soft)] flex-none">
              <div className="min-w-0">
                <div className="font-serif text-[19px] font-medium tracking-[-0.01em] text-[var(--text)] leading-tight">
                  What's stirring
                </div>
                <div className="text-[12.5px] text-[var(--text-mute)] mt-0.5">
                  {unreadCount > 0
                    ? `${unreadCount} ${unreadCount === 1 ? 'thing' : 'things'} since you last looked`
                    : "You're all caught up"}
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex-none whitespace-nowrap text-[var(--accent)] text-[12.5px] font-semibold px-1.5 py-1 rounded-[7px] hover:bg-[var(--accent-soft)] transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {notifications.length === 0 ? (
                <div className="py-11 px-8 text-center">
                  <div className="w-[46px] h-[46px] rounded-full bg-[var(--accent-soft)] text-[var(--accent)] grid place-items-center mx-auto mb-3.5">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="font-serif text-[17px] font-medium text-[var(--text)]">
                    Nothing needs you right now
                  </div>
                  <div className="text-[13px] text-[var(--text-mute)] mt-1.5 leading-[1.55]">
                    A quiet inbox is a kind of grace. We'll let you know when something stirs.
                  </div>
                </div>
              ) : (
                <>
                  {unread.length > 0 && (
                    <NtfGroup label="Worth a look" items={unread} onRead={markAsRead} onSetAside={setAside} />
                  )}
                  {read.length > 0 && (
                    <NtfGroup
                      label="Earlier"
                      items={read}
                      onRead={markAsRead}
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
                className="flex-none flex items-center justify-center gap-[7px] p-[13px] bg-[var(--panel)] border-t border-[var(--border-soft)] text-[var(--accent)] text-[13px] font-semibold hover:bg-[var(--accent-soft)] transition-colors"
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
  onRead,
  onSetAside,
  bordered = false,
}: {
  label: string;
  items: Notification[];
  onRead: (id: string) => void;
  onSetAside: (id: string) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn('py-1.5', bordered && 'border-t border-[var(--border-soft)]')}>
      <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-mute)] px-[18px] pt-2.5 pb-1.5">
        {label}
      </div>
      {items.map(n => <NtfItem key={n.id} notif={n} onRead={onRead} onSetAside={onSetAside} />)}
    </div>
  );
}

function NtfItem({
  notif,
  onRead,
  onSetAside,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  onSetAside: (id: string) => void;
}) {
  const tone: Tone = notif.tone ?? typeToTone(notif.type);

  return (
    <div
      className="group relative flex gap-[13px] items-start px-[18px] py-3 cursor-pointer text-left transition-colors duration-110 hover:bg-[var(--panel)]"
      onClick={() => !notif.read && onRead(notif.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') !notif.read && onRead(notif.id); }}
    >
      {/* Tonal icon node */}
      <span
        className={cn(
          'w-[30px] h-[30px] flex-none rounded-[9px] grid place-items-center mt-px transition-opacity',
          TONE_CLASSES[tone],
          notif.read && 'opacity-[0.62]',
        )}
      >
        <ToneIcon tone={tone} />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-[18px]">
        <div className={cn(
          'text-[14px] leading-[1.35]',
          notif.read
            ? 'font-medium text-[var(--text-dim)]'
            : 'font-semibold text-[var(--text)]',
        )}>
          {notif.title}
        </div>
        <div className="text-[13px] text-[var(--text-dim)] leading-[1.5] mt-0.5">
          {notif.message}
        </div>
        <div className="text-[11.5px] text-[var(--text-mute)] mt-1.5">
          {ntfWhen(notif.createdAt)}
        </div>
      </div>

      {/* Unread dot */}
      {!notif.read && (
        <span className="absolute top-[17px] right-4 w-[7px] h-[7px] rounded-full bg-[var(--accent)]" aria-hidden />
      )}

      {/* Set-aside button (hover-reveal, sits on top of unread dot) */}
      <button
        className="absolute top-[11px] right-3 w-[22px] h-[22px] grid place-items-center rounded-[6px] bg-[var(--bg-elev)] text-[var(--text-mute)] opacity-0 group-hover:opacity-100 hover:!text-[var(--text)] hover:bg-[var(--panel-2)] transition-all"
        title="Set aside"
        aria-label="Set aside"
        onClick={e => { e.stopPropagation(); onSetAside(notif.id); }}
      >
        <X className="w-[13px] h-[13px]" />
      </button>
    </div>
  );
}
