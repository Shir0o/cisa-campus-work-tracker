// One visit, closed or open. Shared by the desktop page and the phone layout —
// a visit reads the same on both; only the space around it changes.
import React, { useState } from 'react';
import { Check, HeartHandshake, House, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { andList, initialsOf, visitDayNum, visitMonth, visitWhen } from '../../lib/visits';
import { cn } from '../../lib/utils';
import type { Visit } from '../../types';

interface VisitGroupProps {
  title: string;
  sub?: string;
  list: Visit[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpenContact: (contactId: string) => void;
  onEdit: (visit: Visit) => void;
  onRemove: (visit: Visit) => void;
  compact?: boolean;
}

/** One of the page's three sections — This week, Last week, Earlier. An empty
 *  stretch says nothing at all rather than showing an empty heading. */
export function VisitGroup({
  title,
  sub,
  list,
  openId,
  setOpenId,
  onOpenContact,
  onEdit,
  onRemove,
  compact = false,
}: VisitGroupProps) {
  if (list.length === 0) return null;
  return (
    <section className={compact ? 'px-5 mt-8' : 'mt-10'}>
      {compact ? (
        <>
          <h2 className="font-serif text-xl text-on-surface">{title}</h2>
          {sub && <p className="text-[13px] text-on-surface-variant mt-0.5">{sub}</p>}
        </>
      ) : (
        <div className="flex items-baseline gap-4 flex-wrap mb-4">
          <h2 className="font-serif text-[23px] text-on-surface">{title}</h2>
          {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
        </div>
      )}
      <div className={cn('flex flex-col gap-3', compact && 'mt-3')}>
        {list.map((v) => (
          <VisitCard
            key={v.id}
            visit={v}
            compact={compact}
            open={openId === v.id}
            onToggle={() => setOpenId(openId === v.id ? null : v.id)}
            onOpenContact={onOpenContact}
            onEdit={() => onEdit(v)}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}

interface VisitCardProps {
  visit: Visit;
  open: boolean;
  onToggle: () => void;
  onOpenContact: (contactId: string) => void;
  onEdit: () => void;
  onRemove: (visit: Visit) => void;
  /** Tighter padding for the phone layout. */
  compact?: boolean;
}

const Face = ({ name, className }: { name: string; className?: string }) => (
  <span
    title={name}
    className={cn(
      'w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0',
      'bg-primary/10 text-primary',
      className,
    )}
  >
    {initialsOf(name)}
  </span>
);

const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">{label}</div>
    {children}
  </div>
);

export default function VisitCard({
  visit,
  open,
  onToggle,
  onOpenContact,
  onEdit,
  onRemove,
  compact = false,
}: VisitCardProps) {
  const [confirming, setConfirming] = useState(false);
  const names = visit.contactNames || [];
  const wentNames = visit.wentNames || [];
  const photos = visit.photos || [];

  return (
    <article
      className={cn(
        'rounded-2xl border bg-surface transition-colors',
        open ? 'border-primary/30' : 'border-outline-variant hover:border-primary/20',
      )}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={cn('w-full flex items-start gap-4 text-left', compact ? 'p-4' : 'p-5')}
      >
        <div className="w-12 shrink-0 text-center">
          <div className="font-serif text-2xl leading-none text-on-surface">{visitDayNum(visit.date)}</div>
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
            {visitMonth(visit.date)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg text-on-surface leading-snug">{andList(names)}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-on-surface-variant mt-1">
            <span className="inline-flex items-center gap-1.5">
              <House className="w-3.5 h-3.5 shrink-0" />
              {visit.where || 'no address noted'}
            </span>
            <span aria-hidden>·</span>
            <span>{visitWhen(visit.date)}</span>
          </div>
          {!open && visit.how && (
            <p className="text-sm text-on-surface-variant/90 leading-relaxed mt-2 line-clamp-2">{visit.how}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex -space-x-2">
            {wentNames.map((n, i) => (
              <Face key={`${n}-${i}`} name={n} className="ring-2 ring-surface" />
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            {visit.followUp && (
              <span title={`Follow-up: ${visit.followUp}`} className="text-stage-teal">
                <Check className="w-3.5 h-3.5" />
              </span>
            )}
            {visit.prayerId && (
              <span title="A prayer came out of this" className="text-stage-violet">
                <HeartHandshake className="w-3.5 h-3.5" />
              </span>
            )}
            {photos.length > 0 && (
              <span title={`${photos.length} photos`} className="inline-flex items-center gap-0.5 text-[11px]">
                <ImageIcon className="w-3.5 h-3.5" />
                {photos.length}
              </span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className={cn('border-t border-outline-variant space-y-5', compact ? 'p-4' : 'p-5')}>
          {visit.purpose && (
            <Block label="Why we went">
              <p className="text-sm text-on-surface-variant leading-relaxed">{visit.purpose}</p>
            </Block>
          )}

          <Block label="How it went">
            {visit.how ? (
              <p className="text-[15px] text-on-surface leading-relaxed whitespace-pre-line">{visit.how}</p>
            ) : (
              <p className="text-sm text-on-surface-variant/70 italic">Nothing written down yet.</p>
            )}
          </Block>

          <div className={cn('grid gap-5', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            <Block label="Who went">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {wentNames.map((n, i) => (
                  <span key={`${n}-${i}`} className="inline-flex items-center gap-2 text-sm text-on-surface">
                    <Face name={n} />
                    {n}
                  </span>
                ))}
              </div>
            </Block>

            <Block label="Who we saw">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {names.map((n, i) => (
                  <button
                    key={`${n}-${i}`}
                    onClick={() => onOpenContact(visit.contactIds[i])}
                    className="inline-flex items-center gap-2 text-sm text-on-surface hover:text-primary transition-colors"
                  >
                    <Face name={n} />
                    {n}
                  </button>
                ))}
              </div>
            </Block>
          </div>

          {(visit.followUp || visit.prayerId) && (
            <div className="flex flex-col gap-2">
              {visit.followUp && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-stage-teal-soft text-sm text-on-surface">
                  <Check className="w-4 h-4 text-stage-teal shrink-0" />
                  <span className="min-w-0">{visit.followUp}</span>
                  <span className="ml-auto text-xs text-on-surface-variant shrink-0">on someone's plate</span>
                </div>
              )}
              {visit.prayerId && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-stage-violet-soft text-sm text-on-surface">
                  <HeartHandshake className="w-4 h-4 text-stage-violet shrink-0" />
                  <span className="min-w-0">A prayer came out of this visit</span>
                  <span className="ml-auto text-xs text-on-surface-variant shrink-0">now on our hearts</span>
                </div>
              )}
            </div>
          )}

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <img
                  key={p.path}
                  src={p.url}
                  alt={p.name || 'A photo from the visit'}
                  className="w-24 h-24 object-cover rounded-xl border border-outline-variant"
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[13px]">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit this visit
            </button>
            {confirming ? (
              <span className="inline-flex items-center gap-3">
                <span className="text-on-surface-variant">Remove it from the record?</span>
                <button
                  onClick={() => onRemove(visit)}
                  className="px-3 py-1.5 rounded-full bg-error text-on-error text-xs font-medium"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-error transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
