import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Heart, Sparkles, Calendar, Users, CheckCircle2, ArrowRight, AlertCircle, ChevronDown } from 'lucide-react';
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, updateDoc, deleteDoc, writeBatch, arrayUnion,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import { Notification } from '../../types';
import { cn, ntfWhen } from '../../lib/utils';
import { canSeeHistory } from '../../lib/permissions';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { motion, AnimatePresence } from 'motion/react';

import { useLanguage } from '../LanguageProvider';
import { Translate } from '../Translate';
import { PopupFrame } from '../ui/PopupFrame';

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

function ToneIcon({ tone, type, size = 15 }: { tone: Tone; type?: Notification['type']; size?: number }) {
  const cls = size === 12 ? 'w-[12px] h-[12px]' : 'w-[15px] h-[15px]';
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

export type NtfFeedItem =
  | { kind: 'single'; notif: Notification }
  | { kind: 'stack'; targetId: string; notifs: Notification[] };

export function groupNotificationsIntoStacks(items: Notification[]): NtfFeedItem[] {
  const targetMap = new Map<string, Notification[]>();
  const seenTargets = new Set<string>();
  const feedItems: NtfFeedItem[] = [];

  for (const item of items) {
    if (item.targetId) {
      const list = targetMap.get(item.targetId) || [];
      list.push(item);
      targetMap.set(item.targetId, list);
    }
  }

  for (const item of items) {
    if (item.targetId) {
      if (seenTargets.has(item.targetId)) continue;
      seenTargets.add(item.targetId);
      const list = targetMap.get(item.targetId)!;
      if (list.length > 1) {
        feedItems.push({ kind: 'stack', targetId: item.targetId, notifs: list });
      } else {
        feedItems.push({ kind: 'single', notif: list[0] });
      }
    } else {
      feedItems.push({ kind: 'single', notif: item });
    }
  }

  return feedItems;
}

export default function NotificationCenter() {
  const { role, effectiveUserId } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const currentUserId = effectiveUserId || auth.currentUser?.uid;
  const seesTeamBroadcasts = role === 'admin';
  // Under 768px the panel is a bottom sheet on a scrim, the same layer every
  // other dialog uses (PopupFrame), instead of a strip pinned under the header
  // with the page still live behind it (#1779).
  const isPhone = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (!currentUserId) return;

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
      where('userId', '==', currentUserId),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const mapDoc = (d: any): Notification => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        read: data.readBy?.includes(currentUserId) ?? data.read,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    };

    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      localNotifs = snap.docs
        .map(mapDoc)
        .filter((n: any) => !n.dismissedBy?.includes(currentUserId)) as Notification[];

      // No OS popup from here: every bell entry is pushed by the notification
      // function, and the service worker shows it — open tab or not.
      updateCombined();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    // ALL_ADMINS broadcasts (e.g. a new student sign-up) are the Full-timers'
    // alone — the same audience the push function fans them out to.
    const unsubGlobal = seesTeamBroadcasts
      ? onSnapshot(query(
          collection(db, 'notifications'),
          where('userId', '==', 'ALL_ADMINS'),
          orderBy('createdAt', 'desc'),
          limit(20),
        ), (snap) => {
          globalNotifs = snap.docs
            .map(mapDoc)
            .filter((n: any) => !n.dismissedBy?.includes(currentUserId)) as Notification[];
          updateCombined();
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'))
      : () => {};

    return () => { unsubPersonal(); unsubGlobal(); };
  }, [currentUserId, seesTeamBroadcasts]);


  useEffect(() => {
    if (!isOpen) return;
    // On a phone the sheet is modal: PopupFrame owns Escape, the scrim owns
    // click-away, and neither may also be handled here.
    if (isPhone) return;
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
  }, [isOpen, isPhone]);

  // While the phone sheet is open the shell behind it is out of reach: hidden
  // from the accessibility tree and inert for pointer and focus, so a swipe or
  // a Tab cannot land on the page under the scrim. The sheet itself is portalled
  // to the body, so it is never inside the subtree it covers.
  useEffect(() => {
    if (!isOpen || !isPhone) return;
    const shell = document.querySelector<HTMLElement>('[data-app-shell]');
    if (!shell) return;
    const bell = bellRef.current;
    shell.setAttribute('inert', '');
    shell.setAttribute('aria-hidden', 'true');
    return () => {
      shell.removeAttribute('inert');
      shell.removeAttribute('aria-hidden');
      // PopupFrame returns focus to its opener, but that focus call runs before
      // this cleanup and an inert subtree refuses it. Hand focus back here.
      bell?.focus();
    };
  }, [isOpen, isPhone]);

  // Focus follows the panel: into it when it opens, back to the bell when it
  // closes. Without this the panel opened under the reader's focus and Escape
  // closed a dialog they were never inside (#1775). The phone sheet is a
  // PopupFrame, which owns both moves itself.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isPhone) return;
    if (isOpen) {
      wasOpen.current = true;
      panelRef.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      wasOpen.current = false;
      bellRef.current?.focus();
    }
  }, [isOpen, isPhone]);

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

  const setAsideStack = async (notifList: Notification[]) => {
    if (!auth.currentUser) return;
    try {
      const adminNotifs = notifList.filter(n => n.userId === 'ALL_ADMINS');
      const userNotifs = notifList.filter(n => n.userId !== 'ALL_ADMINS');

      if (adminNotifs.length > 0) {
        const batch = writeBatch(db);
        for (const n of adminNotifs) {
          batch.update(doc(db, 'notifications', n.id), {
            dismissedBy: arrayUnion(auth.currentUser.uid),
          });
        }
        await batch.commit();
      }
      if (userNotifs.length > 0) {
        await Promise.all(userNotifs.map(n => deleteDoc(doc(db, 'notifications', n.id))));
      }
    } catch (e) { console.error('Error setting aside stack:', e); }
  };

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
      if (notif.type === 'assignment') {
        navigate('/coordination');
      } else {
        const titleLower = (notif.title || '').toLowerCase();
        if (titleLower.includes('question') || titleLower.includes('answer')) {
          navigate('/questions');
        } else if (
          titleLower.includes('logged time') ||
          titleLower.includes('contact') ||
          titleLower.includes('person') ||
          titleLower.includes('added')
        ) {
          navigate(`/people/${notif.targetId}`);
        } else {
          navigate(`/messages/${notif.targetId}`);
        }
      }
    }
  };

  const subtitle =
    unreadCount > 0
      ? unreadCount === 1
        ? t('notifications.one_thing_since')
        : t('notifications.things_since').replace('{n}', String(unreadCount))
      : t('notifications.caught_up');

  // The list is shared by the desktop popover and the phone sheet; only the
  // shell around it changes.
  const list = notifications.length === 0 ? (
    <div className="py-11 px-8 text-center">
      <div className="w-[46px] h-[46px] rounded-full bg-accent-soft text-accent grid place-items-center mx-auto mb-3.5">
        <Heart className="w-5 h-5" />
      </div>
      <div className="font-serif text-[17px] font-medium text-on-surface">
        {t('notifications.nothing_needs_you')}
      </div>
      <div className="text-[13px] text-on-surface-variant mt-1.5 leading-[1.55] [text-wrap:pretty]">
        {t('notifications.quiet_inbox')}
      </div>
    </div>
  ) : (
    <>
      {unread.length > 0 && (
        <NtfGroup
          label={t('notifications.worth_a_look')}
          items={unread}
          onSelect={handleSelectNotification}
          onSetAside={setAside}
          onSetAsideStack={setAsideStack}
        />
      )}
      {read.length > 0 && (
        <NtfGroup
          label={t('notifications.earlier')}
          items={read}
          onSelect={handleSelectNotification}
          onSetAside={setAside}
          onSetAsideStack={setAsideStack}
          bordered={unread.length > 0}
        />
      )}
    </>
  );

  const seesTheRecord = canSeeHistory(role);
  const openWholeRecord = () => { setIsOpen(false); navigate(seesTheRecord ? '/history' : '/prayer'); };
  const footerAction = notifications.length > 0 && (
    <button
      type="button"
      onClick={openWholeRecord}
      className="w-full flex-none flex items-center justify-center gap-[7px] p-[13px] bg-surface border-t border-outline-variant text-accent text-[13px] font-semibold hover:bg-accent-soft transition-colors"
    >
      {seesTheRecord ? t('notifications.see_whole_record') : t('notifications.open_prayer')}
      <ArrowRight className="w-[14px] h-[14px]" />
    </button>
  );

  return (
    <div className="relative flex-none inline-flex" ref={dropdownRef}>
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(o => !o)}
        className={cn(
          'relative w-11 h-11 grid place-items-center rounded-[10px] border transition-all duration-120',
          isOpen
            ? 'bg-primary text-on-primary border-primary'
            // `bg-surface` reads the same as transparent inside the top bar
            // (which is itself `bg-surface`) and gives the button a body of
            // its own on the rail shell's unfilled chrome strip.
            : 'bg-surface text-on-surface-variant border-transparent hover:bg-surface-container-high hover:text-on-surface',
        )}
        aria-label={unreadCount ? t('notifications.new_notifications').replace('{n}', String(unreadCount)) : t('notifications.notifications')}
      >
        <Bell className={cn('w-[17px] h-[17px] transition-transform duration-300', isOpen && 'rotate-[15deg]')} />
        {unreadCount > 0 && (
          <span className="absolute top-[-3px] right-[-3px] min-w-[16px] h-[16px] px-[4px] rounded-full bg-primary text-on-primary text-[10.5px] font-semibold leading-[16px] text-center border-2 border-surface-container box-content">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel — the anchored popover above the phone breakpoint */}
      <AnimatePresence>
        {isOpen && !isPhone && (
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ y: -6, scale: 0.985 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -6, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-label={t('notifications.notifications')}
            className={cn(
              'absolute right-0 top-[calc(100%+12px)] z-50 outline-none',
              'w-96 max-w-[calc(100vw-28px)]',
              'flex flex-col max-h-[min(640px,78vh)]',
              'bg-surface-container border border-outline-variant rounded-[16px] overflow-hidden',
              'shadow-xl',
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-[18px] py-4 border-b border-outline-variant flex-none">
              <div className="min-w-0">
                <div className="font-serif text-[19px] font-medium tracking-[-0.01em] text-on-surface leading-tight">
                  {t('notifications.whats_stirring')}
                </div>
                <div className="text-[12.5px] text-on-surface-variant mt-0.5">
                  {subtitle}
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex-none inline-flex items-center min-h-11 whitespace-nowrap text-accent text-[12.5px] font-semibold px-1.5 rounded-[7px] hover:bg-accent-soft transition-colors"
                >
                  {t('notifications.mark_all_read')}
                </button>
              )}
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 min-h-0">{list}</div>

            {footerAction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone (#1779) — the same list as the app's bottom sheet, on a scrim,
          with the shell behind it inert. Portalled to the body so the inert
          subtree is not this sheet's own ancestor. */}
      {isPhone && createPortal(
        <PopupFrame
          open={isOpen}
          onClose={() => setIsOpen(false)}
          title={t('notifications.whats_stirring')}
          subtitle={subtitle}
          primary={unreadCount > 0 ? {
            label: t('notifications.mark_all_read'),
            onClick: () => { void markAllAsRead(); },
            savingLabel: t('notifications.mark_all_read'),
          } : undefined}
        >
          <div className="pb-1">{list}</div>
          {footerAction}
        </PopupFrame>,
        document.body,
      )}
    </div>
  );
}

function NtfGroup({
  label,
  items,
  onSelect,
  onSetAside,
  onSetAsideStack,
  bordered = false,
}: {
  label: string;
  items: Notification[];
  onSelect: (notif: Notification) => void;
  onSetAside: (id: string) => void;
  onSetAsideStack: (notifs: Notification[]) => void;
  bordered?: boolean;
}) {
  const { t } = useLanguage();
  const feedItems = groupNotificationsIntoStacks(items);

  return (
    <div className={cn('py-1.5', bordered && 'border-t border-outline-variant')}>
      <div className="text-xs font-medium text-on-surface-variant px-[18px] pt-2.5 pb-1.5">
        {label}
      </div>
      {feedItems.map(item => {
        if (item.kind === 'stack') {
          return (
            <NtfStack
              key={`stack-${item.targetId}`}
              notifs={item.notifs}
              targetId={item.targetId}
              onSelect={onSelect}
              onSetAside={onSetAside}
              onSetAsideStack={onSetAsideStack}
            />
          );
        }
        return (
          <NtfItem
            key={item.notif.id}
            notif={item.notif}
            onSelect={onSelect}
            onSetAside={onSetAside}
          />
        );
      })}
    </div>
  );
}

function NtfStack({
  notifs,
  targetId: _targetId,
  onSelect,
  onSetAside,
  onSetAsideStack,
}: {
  notifs: Notification[];
  targetId: string;
  onSelect: (notif: Notification) => void;
  onSetAside: (id: string) => void;
  onSetAsideStack: (notifs: Notification[]) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const latest = notifs[0];
  const count = notifs.length;
  const tone: Tone = latest.tone ?? typeToTone(latest.type);
  const anyUnread = notifs.some(n => !n.read);

  return (
    <div className="group/stack relative">
      {/* Stack Header Row */}
      <div
        className="group relative flex gap-[13px] items-start px-[18px] py-3 cursor-pointer text-left transition-colors duration-110 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t('notifications.notifications_on').replace('{n}', String(count)).replace('{title}', latest.title)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(exp => !exp);
          }
        }}
      >
        {/* Tonal icon node */}
        <span
          className={cn(
            'w-[30px] h-[30px] flex-none rounded-[9px] grid place-items-center mt-px transition-opacity',
            TONE_CLASSES[tone],
            !anyUnread && 'opacity-[0.62]',
          )}
        >
          <ToneIcon tone={tone} type={latest.tone ? undefined : latest.type} />
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1 pr-[46px] sm:pr-[36px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-[14px] leading-[1.35]',
              anyUnread ? 'font-semibold text-on-surface' : 'font-medium text-on-surface-variant'
            )}>
              <Translate text={latest.title} />
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-accent-soft text-accent leading-none">
              {count} updates
            </span>
          </div>

          <div className="text-[13px] text-on-surface-variant leading-[1.5] mt-0.5 line-clamp-2 [text-wrap:pretty]">
            {latest.message || (latest as any).body}
          </div>

          <div className="flex items-center gap-3 text-[11.5px] text-on-surface-variant mt-1.5">
            <span>{ntfWhen(latest.createdAt)}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 -my-3 min-h-11 py-3 text-accent hover:underline font-medium cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setExpanded(exp => !exp);
              }}
            >
              {expanded ? t('notifications.hide_updates') : t('notifications.show_all').replace('{n}', String(count))}
              <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', expanded && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Unread dot */}
        {anyUnread && (
          <span className="absolute top-[17px] right-4 w-[7px] h-[7px] rounded-full bg-primary max-sm:hidden" aria-hidden />
        )}

        {/* Set-aside entire stack button */}
        <button
          className="absolute top-[8px] right-2 w-9 h-9 grid place-items-center rounded-[6px] bg-surface-container text-on-surface-variant opacity-100 sm:opacity-0 sm:group-hover/stack:opacity-100 after:absolute after:-inset-1 after:content-[''] hover:text-on-surface hover:bg-surface-container-high transition-all"
          title={t('notifications.set_stack_aside')}
          aria-label={t('notifications.set_stack_aside')}
          onClick={e => {
            e.stopPropagation();
            onSetAsideStack(notifs);
          }}
        >
          <X className="w-[13px] h-[13px]" />
        </button>
      </div>

      {/* Expanded Child Entries */}
      {expanded && (
        <div className="bg-surface-container-high/30 pl-5 border-l-2 border-accent/40 my-1 ml-6 mr-3 rounded-r-[8px] divide-y divide-outline-variant/30">
          {notifs.map(n => (
            <NtfItem
              key={n.id}
              notif={n}
              onSelect={onSelect}
              onSetAside={onSetAside}
              isChild
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NtfItem({
  notif,
  onSelect,
  onSetAside,
  isChild = false,
}: {
  notif: Notification;
  onSelect: (notif: Notification) => void;
  onSetAside: (id: string) => void;
  isChild?: boolean;
}) {
  const { t } = useLanguage();
  const tone: Tone = notif.tone ?? typeToTone(notif.type);

  return (
    <div className="group relative">
      {/* A real button (#1779), so Enter and Space both activate it natively
          and the rotor reads one control. The dismissal is its sibling, not a
          nested button, which is what flattened the row before. */}
      <button
        type="button"
        className={cn(
          "flex w-full gap-[13px] items-start cursor-pointer text-left transition-colors duration-110 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
          isChild ? "px-3 py-2.5" : "px-[18px] py-3"
        )}
        onClick={() => onSelect(notif)}
      >
        {/* Tonal icon node */}
        <span
          className={cn(
            'flex-none rounded-[9px] grid place-items-center mt-px transition-opacity',
            isChild ? 'w-[24px] h-[24px]' : 'w-[30px] h-[30px]',
            TONE_CLASSES[tone],
            notif.read && 'opacity-[0.62]',
          )}
        >
          <ToneIcon tone={tone} type={notif.tone ? undefined : notif.type} size={isChild ? 12 : 15} />
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1 pr-[46px] sm:pr-[18px]">
          <div className={cn(
            'leading-[1.35]',
            isChild ? 'text-[13px]' : 'text-[14px]',
            notif.read
              ? 'font-medium text-on-surface-variant'
              : 'font-semibold text-on-surface',
          )}>
            <Translate text={notif.title} />
          </div>
          <div className={cn(
            'text-on-surface-variant leading-[1.5] mt-0.5 [text-wrap:pretty]',
            isChild ? 'text-[12px]' : 'text-[13px]',
          )}>
            <Translate text={notif.message || (notif as any).body} />
          </div>
          <div className="text-[11.5px] text-on-surface-variant mt-1.5">
            {ntfWhen(notif.createdAt)}
          </div>
        </div>

        {/* Unread dot — absolute, so it hangs off the row rather than the
            button's content box */}
        {!notif.read && (
          <span className={cn(
            "absolute right-4 w-[7px] h-[7px] rounded-full bg-primary max-sm:hidden",
            isChild ? "top-[14px]" : "top-[17px]"
          )} aria-hidden />
        )}
      </button>

      {/* Set-aside button (hover-reveal, sits on top of unread dot) */}
      <button
        type="button"
        className={cn(
          "absolute right-2 w-9 h-9 grid place-items-center rounded-[6px] bg-surface-container text-on-surface-variant opacity-100 sm:opacity-0 sm:group-hover:opacity-100 after:absolute after:-inset-1 after:content-[''] hover:text-on-surface hover:bg-surface-container-high transition-all",
          isChild ? "top-[9px]" : "top-[11px]"
        )}
        title={t('notifications.set_aside')}
        aria-label={t('notifications.set_aside')}
        onClick={() => onSetAside(notif.id)}
      >
        <X className="w-[13px] h-[13px]" />
      </button>
    </div>
  );
}

