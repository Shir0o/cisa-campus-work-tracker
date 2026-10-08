// The "Who are we praying for?" picker, in the shared popup frame (spec #1444,
// ticket #1450). Search the roster and tick who should show up on On our hearts.
// People already on the list are greyed, labelled "already on our prayer list",
// and can't be ticked again — the picker only adds; taking someone off stays the
// card's own affordance (CONTEXT.md, "Remove from prayer list"). The footer
// counts what you've added and the total on our hearts, and the frame turns the
// whole thing into a bottom sheet on a phone.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Heart, Search } from 'lucide-react';
import { Contact } from '../../types';
import { cn } from '../../lib/utils';
import { contactKind, kindLabelKey } from '../../lib/contactKind';
import { useLanguage } from '../LanguageProvider';
import { avatarTint, PopupFrame } from '../ui/PopupFrame';

interface PickHeldModalProps {
  open: boolean;
  contacts: Contact[];
  heldIds: string[];
  onClose: () => void;
  /** The newly ticked ids (never anyone already held). */
  onApply: (added: string[]) => void;
}

export default function PickHeldModal({ open, contacts, heldIds, onClose, onApply }: PickHeldModalProps) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel([]);
    }
  }, [open]);

  const held = useMemo(() => new Set(heldIds), [heldIds]);

  const list = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((c) =>
      `${c.name} ${(c.tags || []).join(' ')}`.toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const added = useMemo(() => sel.filter((id) => !held.has(id)), [sel, held]);
  const total = heldIds.length + added.length;

  const toggle = (id: string) => {
    if (held.has(id)) return;
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const close = () => {
    setQ('');
    setSel([]);
    onClose();
  };
  const apply = () => {
    const picked = added;
    setQ('');
    setSel([]);
    onApply(picked);
  };

  return (
    <PopupFrame
      open={open}
      onClose={close}
      size="sm"
      eyebrow={t('prayers.eyebrow')}
      title={t('prayers.who_are_we_holding')}
      subtitle={t('prayers.tick_people_you_want')}
      dirty={added.length > 0}
      discardQuestion={t('prayers.discard_picks')}
      footerHint={
        <>
          <Heart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <b className="font-semibold text-on-surface">
            {t('prayers.added_count').replace('{n}', String(added.length))}
          </b>
          <span>
            {' · '}
            {t('prayers.people_on_our_hearts')
              .replace('{count}', String(total))
              .replace('{unit}', total === 1 ? t('prayers.person') : t('prayers.people'))}
          </span>
        </>
      }
      primary={{
        label: t('actions.done'),
        onClick: apply,
        disabled: added.length === 0,
        savingLabel: t('prayers.saving'),
      }}
    >
      <div className="px-7 pb-1 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mute)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('prayers.search_people_you_know')}
            aria-label={t('prayers.search_people_you_know')}
            className="w-full rounded-sm border border-transparent bg-surface-container-low py-2.5 pl-10 pr-3.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] transition-colors focus:border-outline focus:outline-none"
          />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 border-t border-outline-variant px-3 py-3">
        {list.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--text-mute)]">
            {q ? t('prayers.no_one_matches_that') : t('prayers.everyone_already_here')}
          </p>
        ) : (
          list.map((c) => {
            const isHeld = held.has(c.id);
            const checked = isHeld || sel.includes(c.id);
            const sub = isHeld ? t('prayers.already_held') : t(kindLabelKey(contactKind(c)));
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                disabled={isHeld}
                aria-pressed={checked}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors',
                  isHeld
                    ? 'cursor-default text-[var(--text-mute)]'
                    : 'text-on-surface hover:bg-surface-container',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors',
                    isHeld
                      ? 'border-outline-variant bg-surface-container-low'
                      : checked
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-outline',
                  )}
                >
                  {checked && !isHeld && <Check className="h-3 w-3" />}
                </span>
                <span
                  style={avatarTint(c.id)}
                  aria-hidden="true"
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                    isHeld && 'opacity-50',
                  )}
                >
                  {c.initials || c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', checked && !isHeld && 'font-semibold')}>
                    {c.name}
                  </span>
                  {sub && (
                    <span className="block truncate text-[12px] text-[var(--text-mute)]">{sub}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </PopupFrame>
  );
}
