import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, Settings2, X, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact, Stage } from '../types';
import { Avatar } from '../components/landing/primitives';

type Touch = { ms: number; note: string };
type TouchMap = Map<string, Touch>;

interface OutreachBoardMobileProps {
  stages: Stage[];
  contacts: Contact[];
  unmappedContacts: Contact[];
  lastTouchByContact: TouchMap;
  onOpenContact: (contact: Contact) => void;
  onMove: (contactId: string, newStageLabel: string) => Promise<void>;
  onShapeJourney: () => void;
  isAdmin: boolean;
  onAddContact: (stageLabel: string) => void;
}

// Full static class strings for tone colors matching OutreachBoard.tsx TONE_CLASSES
const TONE_CLASSES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  accent: {
    dot: 'bg-primary',
    text: 'text-primary',
    bg: 'bg-stage-accent-soft',
    border: 'border-primary/20',
  },
  amber: {
    dot: 'bg-stage-amber',
    text: 'text-stage-amber',
    bg: 'bg-stage-amber-soft',
    border: 'border-stage-amber/20',
  },
  teal: {
    dot: 'bg-stage-teal',
    text: 'text-stage-teal',
    bg: 'bg-stage-teal-soft',
    border: 'border-stage-teal/20',
  },
  violet: {
    dot: 'bg-stage-violet',
    text: 'text-stage-violet',
    bg: 'bg-stage-violet-soft',
    border: 'border-stage-violet/20',
  },
};

type Tone = 'accent' | 'amber' | 'teal' | 'violet';
const toneFor = (color: string | undefined, index: number): Tone => {
  if (!color) return 'accent';
  const TONE_BY_COLOR: Record<string, Tone> = {
    'bg-board-indigo': 'accent',
    'bg-board-ocean': 'accent',
    'bg-primary': 'accent',
    'bg-primary-fixed-dim': 'accent',
    'bg-board-amber': 'amber',
    'bg-board-orange': 'amber',
    'bg-orange-500': 'amber',
    'bg-orange': 'amber',
    'orange': 'amber',
    'bg-board-teal': 'teal',
    'bg-board-emerald': 'teal',
    'bg-secondary': 'teal',
    'bg-board-plum': 'violet',
    'bg-board-crimson': 'violet',
    'bg-board-rose': 'violet',
  };
  return TONE_BY_COLOR[color] || (['accent', 'amber', 'teal', 'violet'][index % 4] as Tone);
};

const connectedLabel = (d: number) =>
  d === 0 ? 'Connected today' : d === 1 ? 'Last connected yesterday' : `Last connected ${d} days ago`;

const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

const DAY_MS = 86_400_000;
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));

export default function OutreachBoardMobile({
  stages,
  contacts,
  unmappedContacts,
  lastTouchByContact,
  onOpenContact,
  onMove,
  onShapeJourney,
  isAdmin,
  onAddContact,
}: OutreachBoardMobileProps) {
  // Let's create a combined list of stages where "Unassigned" is the first stage if there are unassigned contacts.
  // In the desktop board, unassigned contacts appear in a column. On mobile, we can add it as the first tab!
  const hasUnassigned = unmappedContacts.length > 0;
  const mobileStages = useMemo(() => {
    const list = [...stages];
    if (hasUnassigned) {
      list.unshift({
        id: 'uncategorized',
        label: 'Unassigned',
        color: 'bg-surface-variant',
        order: -1,
      });
    }
    return list;
  }, [stages, hasUnassigned]);

  const [active, setActive] = useState(0);
  const [movingContact, setMovingContact] = useState<Contact | null>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const idx = Math.min(active, mobileStages.length - 1);
  const stage = mobileStages[idx] || { id: 'uncategorized', label: 'Unassigned', color: 'bg-surface-variant' };
  const tone = stage.id === 'uncategorized' ? 'accent' : toneFor(stage.color, idx);
  const toneCx = TONE_CLASSES[tone];

  const getStageContacts = (stageLabel: string) => {
    if (stageLabel === 'Unassigned') return unmappedContacts;
    return contacts.filter((c) => c.stage === stageLabel);
  };

  const items = getStageContacts(stage.label);

  useEffect(() => {
    const sw = switchRef.current;
    if (!sw) return;
    const seg = sw.children[idx] as HTMLElement;
    if (!seg) return;
    const target = seg.offsetLeft - (sw.clientWidth - seg.clientWidth) / 2;
    sw.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [idx]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0 && idx < mobileStages.length - 1) setActive(idx + 1);
      if (dx > 0 && idx > 0) setActive(idx - 1);
    }
    touchX.current = null;
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page jrn jrnm">
      <header className="px-5 pt-8 pb-4 bg-surface jrnm-hero">
        <div className="text-xs uppercase tracking-wider text-on-surface-variant/80 font-semibold mb-1 jrn-eyebrow">
          the journey
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface jrn-h1">Stages</h1>
        <p className="text-[14.5px] text-on-surface-variant/90 leading-relaxed mt-2 jrnm-state">
          <b className="font-semibold text-on-surface">{contacts.length} students</b>, moving from a first hello toward a church family.
        </p>
        {isAdmin && (
          <button
            className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-variant transition-all jrnm-shape"
            onClick={onShapeJourney}
          >
            <Settings2 className="w-3.5 h-3.5" /> Shape the journey
          </button>
        )}
      </header>

      {/* Switcher tabs */}
      <div
        className="flex gap-2 overflow-x-auto px-5 py-4 border-b border-outline-variant/30 scrollbar-none whitespace-nowrap jrnm-switch bg-surface"
        ref={switchRef}
      >
        {mobileStages.map((s, i) => {
          const sTone = s.id === 'uncategorized' ? 'accent' : toneFor(s.color, i);
          const sToneCx = TONE_CLASSES[sTone];
          const count = getStageContacts(s.label).length;
          const activeTab = i === idx;
          return (
            <button
              key={s.id}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold border transition-all jrnm-seg shrink-0",
                activeTab
                  ? cn(sToneCx.bg, sToneCx.border, sToneCx.text, "is-on font-bold border-primary/30 shadow-sm")
                  : "bg-surface border-outline-variant/50 text-on-surface-variant hover:bg-surface-variant/55"
              )}
              onClick={() => setActive(i)}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full jrnm-seg-dot", sToneCx.dot)} aria-hidden />
              <span className="jrnm-seg-name">{s.label}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant/80 font-medium jrnm-seg-count", activeTab && "bg-surface/80 text-primary font-bold")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* List content panel */}
      <section
        className={cn("flex-1 px-5 pt-6 pb-2 jrnm-panel transition-all", toneCx.bg)}
        key={stage.id}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mb-4 flex flex-col gap-0.5 jrnm-panel-head">
          <span className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant/80 jrnm-panel-count">
            {items.length === 0 ? "no one here yet" : items.length === 1 ? "1 person" : `${items.length} people`}
          </span>
          {stage.id !== 'uncategorized' && stage.label && (
            <p className="text-xs text-on-surface-variant/90 leading-relaxed max-w-sm mt-1 jrnm-panel-caption">
              {stage.label.toLowerCase() === 'first contact' ? "We've only just met — a name, a face, a first hello." :
               stage.label.toLowerCase() === 'second contact' ? "Following up — a coffee, a text, learning who they are." :
               stage.label.toLowerCase() === 'regular' ? "Part of the rhythm now, around most weeks." :
               stage.label.toLowerCase() === 'church' ? "Finding a church family to belong to." : ""}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 jrnm-empty shadow-inner">
            No one at this step just now.
          </div>
        ) : (
          <div className="space-y-2.5 jrnm-list">
            {items.map((c) => {
              const touch = lastTouchByContact.get(c.id);
              const ms = touch?.ms ?? parseMs(c.createdAt);
              const days = ms != null ? daysSince(ms) : null;
              const overdue = days != null && days >= 7;
              const note = (touch?.note || c.notes || '').trim();
              const sub = [c.role, c.location].filter(Boolean).join(' · ');

              return (
                <article
                  className="flex items-start gap-3.5 p-4 bg-surface rounded-2xl border border-outline-variant/40 active:bg-surface-variant/30 transition-all jrnm-person shadow-sm cursor-pointer"
                  key={c.id}
                  onClick={() => onOpenContact(c)}
                >
                  <Avatar contact={c} size="md" />
                  <div className="min-w-0 flex-1 jrnm-p-body">
                    <div className="font-serif font-semibold text-[16px] text-on-surface truncate jrnm-p-name">
                      {c.name}
                    </div>
                    {sub && <div className="text-xs text-on-surface-variant mt-0.5 truncate jrnm-p-sub">{sub}</div>}
                    {days != null ? (
                      <div className={cn("text-xs text-on-surface-variant mt-1.5 flex items-center gap-1.5 jrnm-p-since", overdue && "text-stage-amber font-medium is-overdue")}>
                        {overdue && <span className="w-1.5 h-1.5 rounded-full bg-stage-amber shrink-0 jrn-since-dot" aria-hidden />}
                        {connectedLabel(days)}
                      </div>
                    ) : (
                      <div className="text-xs text-on-surface-variant mt-1.5 italic jrnm-p-since">No contact logged.</div>
                    )}
                    {note && (
                      <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 leading-relaxed opacity-95">
                        <span className="font-medium text-on-surface-variant/70">Last:</span> {note}
                      </p>
                    )}
                  </div>
                  <button
                    className="p-2.5 bg-surface-container border border-outline-variant/65 text-on-surface rounded-xl active:scale-95 transition-all jrnm-p-move shrink-0 self-center"
                    aria-label={`Move ${c.name.split(" ")[0]} to another step`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMovingContact(c);
                    }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <button
          onClick={() => onAddContact(stage.label)}
          className="mt-4 w-full py-3.5 text-center text-sm bg-surface border border-outline-variant/70 text-primary font-semibold rounded-2xl active:brightness-95 transition-all shadow-sm jrnm-add"
        >
          {stage.id === 'uncategorized' || (stages[0] && stage.label === stages[0].label)
            ? "Welcome someone new"
            : `Add to ${stage.label}`}
        </button>
      </section>

      {/* MoveSheet dialog bottom sheet */}
      {movingContact && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
          onClick={() => setMovingContact(null)}
        >
          <div
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
            <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
              <div className="ibxs-headtext">
                <h3 className="font-serif text-lg text-on-surface ibxs-title">
                  Where is {movingContact.name.split(" ")[0]} now?
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">
                  Move them to the step that fits today.
                </p>
              </div>
              <button
                onClick={() => setMovingContact(null)}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-8 pt-4 flex flex-col gap-2 mds-body">
              <div className="flex flex-col gap-2 jrnm-move-list">
                {mobileStages.map((s, i) => {
                  const sTone = s.id === 'uncategorized' ? 'accent' : toneFor(s.color, i);
                  const sToneCx = TONE_CLASSES[sTone];
                  const here = s.label === movingContact.stage || (s.id === 'uncategorized' && !movingContact.stage);

                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (!here) onMove(movingContact.id, s.label === 'Unassigned' ? '' : s.label);
                        setMovingContact(null);
                      }}
                      className={cn(
                        "flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all jrnm-move-opt w-full",
                        here ? cn(sToneCx.bg, sToneCx.border, sToneCx.text, "is-here border-primary/30") : "bg-surface border-outline-variant hover:bg-surface-variant"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full jrnm-move-dot", sToneCx.dot)} />
                      <div className="flex-1 min-w-0 jrnm-move-text">
                        <div className="font-medium text-[15px] jrnm-move-name">{s.label}</div>
                      </div>
                      {here ? (
                        <span className="text-xs font-bold uppercase tracking-wider text-primary jrnm-move-here">here now</span>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-on-surface-variant/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
