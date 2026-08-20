import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { doc, collection, onSnapshot, getDoc } from 'firebase/firestore';
import { User } from 'lucide-react';
import { db } from '../../lib/firebase';
import { Contact, Stage } from '../../types';
import { cn, getUserInitials } from '../../lib/utils';
import { StageChip } from '../landing/primitives';
import { parseMs, daysSince } from '../landing/helpers';

export interface ContactPillProps {
  contactId: string;
  fallbackName?: string;
  fallbackSubtitle?: string;
  onOpenContact?: (contact: Contact) => void;
  hideStage?: boolean;
  className?: string;
}

export default function ContactPill({
  contactId,
  fallbackName,
  fallbackSubtitle,
  onOpenContact,
  hideStage = false,
  className,
}: ContactPillProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to live contact document
  useEffect(() => {
    if (!contactId) return;
    const unsub = onSnapshot(
      doc(db, 'contacts', contactId),
      (snap: any) => {
        if (!snap) {
          setContact(null);
          return;
        }
        const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
        if (exists) {
          const data = typeof snap.data === 'function' ? snap.data() : snap.data || snap;
          setContact({ id: snap.id || contactId, ...data } as Contact);
        } else {
          setContact(null);
        }
      },
      (err) => console.error('ContactPill contact listener error:', err)
    );
    return () => unsub();
  }, [contactId]);

  // Subscribe to stages for live stage color
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'stages'),
      (snap: any) => {
        const docs = snap?.docs || [];
        setStages(
          docs.map((d: any) => ({
            id: d.id,
            ...(typeof d.data === 'function' ? d.data() : d),
          })) as Stage[]
        );
      },
      (err) => console.error('ContactPill stages listener error:', err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const place = () => {
    const el = btnRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const W = 268;
    const H = 220;
    const M = 10;
    const below = window.innerHeight - r.bottom;
    const top =
      below >= H + M || r.top < H + M
        ? Math.min(r.bottom + 6, window.innerHeight - H - M)
        : r.top - H - 6;
    const left = Math.max(M, Math.min(r.left, window.innerWidth - W - M));
    setCoords({ top: Math.max(M, top), left });
  };

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    place();
    setOpen(true);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), 140);
  };

  const handleOpen = async () => {
    setOpen(false);
    if (!onOpenContact) return;
    if (contact) {
      onOpenContact(contact);
      return;
    }
    try {
      const snap: any = await getDoc(doc(db, 'contacts', contactId));
      const exists = typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;
      if (exists) {
        const data = typeof snap.data === 'function' ? snap.data() : snap.data || snap;
        onOpenContact({ id: snap.id || contactId, ...data } as Contact);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    onOpenContact({
      id: contactId,
      name: fallbackName || 'Someone',
    } as Contact);
  };

  const currentContact = contact || (fallbackName ? ({ id: contactId, name: fallbackName } as Contact) : null);

  if (!currentContact) {
    return (
      <span
        className={cn(
          'rounded-xl inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-on-surface-variant/70 border border-dashed border-outline-variant bg-surface-container-low cursor-default select-none',
          className
        )}
        title="Contact not found"
      >
        <User className="w-3 h-3 text-on-surface-variant/50" />
        <span>{fallbackName || 'Someone'}</span>
      </span>
    );
  }

  const name = currentContact.name || fallbackName || 'Someone';
  const firstName = name.split(' ')[0];
  const initials = getUserInitials(name);

  // Compute live last spoken fact
  const rawDate = currentContact.lastContactedDate || currentContact.lastSeen;
  const ms = parseMs(rawDate);
  const days = ms == null ? null : daysSince(ms);
  const seenText =
    days == null
      ? 'no recent contact'
      : days === 0
      ? 'spoke today'
      : days === 1
      ? 'spoke yesterday'
      : `last spoke ${days} days ago`;

  const sub =
    [currentContact.year, currentContact.major].filter(Boolean).join(' · ') ||
    fallbackSubtitle ||
    'no details yet';

  const caregiver = currentContact.createdByName || currentContact.lastContactedBy || currentContact.owner || null;

  const previewCard = (
    <div
      className="w-[268px] flex flex-col gap-2.5 p-4 bg-surface-container-high rounded-2xl border border-outline-variant shadow-2xl text-on-surface text-left animate-in fade-in zoom-in-95 duration-100"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container font-semibold text-xs flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-on-surface truncate">{name}</div>
          <div className="text-xs text-on-surface-variant truncate">{sub}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {currentContact.stage && <StageChip stage={currentContact.stage} stages={stages} />}
        <span className="text-xs text-on-surface-variant">{seenText}</span>
      </div>

      {caregiver && (
        <div className="text-xs text-on-surface-variant/80">
          Cared for by <span className="font-medium text-on-surface">{caregiver}</span>
        </div>
      )}

      {onOpenContact && (
        <button
          type="button"
          onClick={handleOpen}
          className="mt-1 inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 transition-colors self-start cursor-pointer"
        >
          Open {firstName}&apos;s page
        </button>
      )}
    </div>
  );

  return (
    <span className={cn('relative inline-flex max-w-full rounded-xl', className)}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
          if (isTouch) {
            place();
            setOpen((o) => !o);
          } else if (onOpenContact) {
            handleOpen();
          }
        }}
        className={cn(
          'rounded-xl inline-flex items-center gap-1.5 max-w-full pl-1.5 pr-2.5 py-1 border border-outline-variant bg-surface text-on-surface text-xs font-medium cursor-pointer transition-colors text-left',
          open ? 'border-primary bg-surface-container-high' : 'hover:border-outline hover:bg-surface-container'
        )}
      >
        <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container font-semibold text-[10px] flex items-center justify-center shrink-0">
          {initials}
        </span>
        <span className="truncate max-w-[140px] sm:max-w-[200px]">{name}</span>
        {!hideStage && currentContact.stage && <StageChip stage={currentContact.stage} stages={stages} />}
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
            }}
          >
            {previewCard}
          </div>,
          document.body
        )}
    </span>
  );
}
