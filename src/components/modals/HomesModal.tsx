// Homes — the roster behind "Who we haven't seen". A home is a household, not
// an address: it keeps its identity (and its visits) when it moves, and goes
// inactive rather than being deleted when the last person leaves. Homes are
// suggested, never derived — every proposal is confirmed and editable before
// it saves, so a wrong home is harder to notice than a missing one.
//
// The list, the editor and the Combine step are three views of ONE shared popup
// frame (spec #1444, #1448), so switching between them keeps the dialog mounted:
// no open animation replaying, focus not sent back to the opener. Delete and
// Combine are #1408 / ADR 0040; this restyles them in the frame rather than
// inventing them.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronRight, House, MapPin, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  addHome,
  combineHomes,
  deleteHome,
  homedMemberIds,
  isHomeUnvisited,
  restoreHome,
  suggestHomesByCoVisit,
  suggestHomesBySurname,
  updateHome,
  type HomeProposal,
} from '../../lib/homes';
import { handleFirestoreError, logActivity, OperationType } from '../../lib/firebase';
import { useUndoSnack } from '../../hooks/useUndoSnack';
import { UndoSnackbar } from '../UndoSnackbar';
import { initialsOf } from '../../lib/visits';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { pickableContacts } from '../../lib/permissions';
import { PopupField, PopupFrame, PopupSection, avatarTint, type PopupFrameProps } from '../ui/PopupFrame';
import { Switch } from '../ui/Switch';
import type { Contact, Home, Visit } from '../../types';

interface HomesModalProps {
  isOpen: boolean;
  onClose: () => void;
  homes: Home[];
  contacts: Contact[];
  visits: Visit[];
  onHomeSaved: (home: Home) => void;
  /** People to prefill a brand-new Home with (e.g. "Add one" from Log a visit). */
  initialMembers?: string[];
}

interface Draft {
  id?: string;
  label: string;
  place: string;
  notes: string;
  memberIds: string[];
  active: boolean;
}

const emptyDraft = (): Draft => ({ label: '', place: '', notes: '', memberIds: [], active: true });

/** Alphabetical ignoring a leading "the", so "the Oseis" files under O (ADR 0031 §4). */
const homeSortKey = (label: string): string => label.toLowerCase().replace(/^the\s+/, '').trim();

const byHomeLabel = (a: Home, b: Home): number => {
  const ka = homeSortKey(a.label);
  const kb = homeSortKey(b.label);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/** A small overlapping stack of member avatars for a list row. */
function MemberStack({ memberIds, contacts }: { memberIds: string[]; contacts: Contact[] }) {
  if (!memberIds.length) return null;
  return (
    <span className="flex shrink-0">
      {memberIds.slice(0, 3).map((id) => {
        const c = contacts.find((x) => x.id === id);
        return (
          <span
            key={id}
            style={avatarTint(id)}
            aria-hidden="true"
            className="-mr-2.5 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg-elev)] text-[10px] font-semibold last:mr-0"
          >
            {initialsOf(c?.name ?? '?')}
          </span>
        );
      })}
    </span>
  );
}

export default function HomesModal({
  isOpen,
  onClose,
  homes,
  contacts,
  visits,
  onHomeSaved,
  initialMembers,
}: HomesModalProps) {
  const { t } = useLanguage();
  const { user, effectiveUserId } = useAuth();
  const me = effectiveUserId || user?.uid || '';
  const myName = user?.displayName || 'A full-timer';

  const [editing, setEditing] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [combining, setCombining] = useState<{ source: Home; target: Home | null } | null>(null);
  // A rejected Delete (editor footer) or Combine (Combine step footer), kept
  // until the person retries or leaves that view.
  const [actionError, setActionError] = useState<'delete' | 'combine' | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  const realContacts = useMemo(() => pickableContacts(contacts), [contacts]);
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? '?';

  const excluded = useMemo(() => homedMemberIds(homes), [homes]);
  const suggestions = useMemo<HomeProposal[]>(() => {
    const coVisit = suggestHomesByCoVisit(visits, realContacts, excluded);
    const covered = new Set(coVisit.flatMap((p) => p.memberIds));
    const surname = suggestHomesBySurname(realContacts, [...excluded, ...covered]);
    return [...coVisit, ...surname];
  }, [visits, realContacts, excluded]);

  const sortedHomes = useMemo(() => homes.slice().sort(byHomeLabel), [homes]);
  const activeHomes = useMemo(() => sortedHomes.filter((h) => h.active), [sortedHomes]);
  const inactiveHomes = useMemo(() => sortedHomes.filter((h) => !h.active), [sortedHomes]);
  const visitCount = (homeId: string) => visits.filter((v) => v.homeId === homeId).length;
  const visitCountLabel = (n: number) =>
    n === 1 ? t('homes.visit_one') : t('homes.visit_many').replace('{count}', String(n));

  const beginEdit = (draft: Draft) => {
    setActionError(null);
    setEditing(draft);
    setBaseline(draft);
  };
  const startNew = () => beginEdit(emptyDraft());
  const startEdit = (home: Home) =>
    beginEdit({
      id: home.id,
      label: home.label,
      place: home.place ?? '',
      notes: home.notes ?? '',
      memberIds: home.members.slice(),
      active: home.active,
    });
  const startSuggestion = (proposal: HomeProposal) =>
    beginEdit({ ...emptyDraft(), label: proposal.label, memberIds: proposal.memberIds.slice() });

  // Reset on open, and seed a new Home from the people handed in ("Add one"
  // from Log a visit) so the editor opens prefilled.
  useEffect(() => {
    if (!isOpen) {
      setEditing(null);
      setBaseline(null);
      setCombining(null);
      setActionError(null);
      setShowInactive(false);
      seededRef.current = null;
      return;
    }
    const seedKey = initialMembers?.length ? initialMembers.join('\u0000') : '';
    if (seedKey && seededRef.current !== seedKey) {
      seededRef.current = seedKey;
      const memberIds = initialMembers!.filter((id) => realContacts.some((c) => c.id === id));
      setEditing({ ...emptyDraft(), memberIds });
      setBaseline({ ...emptyDraft(), memberIds });
    }
  }, [isOpen, initialMembers, realContacts]);

  const editingHome = editing?.id ? homes.find((h) => h.id === editing.id) ?? null : null;
  const canDelete = !!editingHome && isHomeUnvisited(editingHome.id, visits);
  const canCombine = !!editingHome && homes.length > 1;

  const dirty =
    !!editing &&
    !!baseline &&
    (editing.label !== baseline.label ||
      editing.place !== baseline.place ||
      editing.notes !== baseline.notes ||
      editing.memberIds.join('\u0000') !== baseline.memberIds.join('\u0000') ||
      editing.active !== baseline.active);

  const leaveEditor = () => {
    setActionError(null);
    setEditing(null);
    setBaseline(null);
  };
  const startCombine = (source: Home) => {
    setActionError(null);
    setCombining({ source, target: null });
  };
  const leaveCombine = () => {
    setActionError(null);
    setCombining(null);
  };

  const toggleMember = (id: string) => {
    if (!editing) return;
    const memberIds = editing.memberIds.includes(id)
      ? editing.memberIds.filter((x) => x !== id)
      : [...editing.memberIds, id];
    // A home with nobody left in it goes inactive, not away — its visits keep
    // their meaning.
    setEditing({ ...editing, memberIds, active: memberIds.length > 0 ? editing.active : false });
  };

  /** Delete a Home made by mistake (ADR 0040 §1) — immediate, with Undo. */
  const remove = async () => {
    const home = editingHome;
    if (!home || busy) return;
    setActionError(null);
    setBusy(true);
    try {
      await deleteHome(home.id);
      void logActivity({
        action: 'deleted a home',
        targetId: home.id,
        targetName: home.label,
        targetType: 'home',
        type: 'edit',
        description: `Deleted the home "${home.label}".`,
      });
      leaveEditor();
      showUndoSnack(t('homes.deleted_snack'), () => {
        void restoreHome(home, { uid: me, name: myName }).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, `homes/${home.id}`),
        );
      });
    } catch (e) {
      setActionError('delete');
      // handleFirestoreError records and rethrows; the footer is where the
      // person hears about it, so keep the throw from escaping the handler.
      try {
        handleFirestoreError(e, OperationType.DELETE, `homes/${home.id}`);
      } catch {
        /* already surfaced above */
      }
    } finally {
      setBusy(false);
    }
  };

  /** Combine the Home entered twice into the Home to keep (ADR 0040 §2). */
  const confirmCombine = async () => {
    if (!combining?.target || busy) return;
    const { source, target } = combining;
    setActionError(null);
    setBusy(true);
    try {
      await combineHomes(target, source, visits, { uid: me, name: myName });
      void logActivity({
        action: 'combined a home into',
        targetId: target.id,
        targetName: target.label,
        targetType: 'home',
        type: 'edit',
        description: `Combined "${source.label}" (${source.id}) into "${target.label}" (${target.id}).`,
      });
      leaveCombine();
      leaveEditor();
      onHomeSaved(target);
    } catch (e) {
      setActionError('combine');
      try {
        handleFirestoreError(e, OperationType.WRITE, `homes/${target.id}`);
      } catch {
        /* already surfaced above */
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const input = {
        label: editing.label,
        place: editing.place,
        notes: editing.notes,
        members: editing.memberIds,
        active: editing.active,
      };
      if (editing.id) {
        await updateHome(editing.id, input, { uid: me, name: myName });
        onHomeSaved({ id: editing.id, ...input });
      } else {
        const id = await addHome(input, { uid: me, name: myName });
        onHomeSaved({ id, ...input });
      }
      leaveEditor();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'homes');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors';

  // ── views ──────────────────────────────────────────────────────────────────

  const listBody = (
    <div className="text-on-surface">
      {homes.length === 0 ? (
        <div className="px-7 py-8 text-center">
          <div className="mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-2xl bg-surface-container-low text-on-surface-variant">
            <House className="h-5 w-5" />
          </div>
          <p className="text-[15px] font-semibold">{t('homes.no_homes_yet_title')}</p>
          <p className="mt-1 text-[13px] text-[var(--text-mute)]">
            {t('homes.suggestions_found').replace('{count}', String(suggestions.length))}
          </p>
          <div className="mt-3.5 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={() => suggestionsRef.current?.scrollIntoView?.({ block: 'nearest' })}
              className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
            >
              {t('homes.review_suggestions')}
            </button>
            <button
              type="button"
              onClick={startNew}
              className="inline-flex h-10 items-center rounded-full border border-outline-variant bg-[var(--bg-elev)] px-4 text-sm font-medium text-on-surface"
            >
              {t('homes.add_home')}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-outline-variant px-7 py-5">
          <div className="flex items-center gap-3 pb-1.5">
            <p className="flex-1 text-[13px] font-semibold">
              {t('homes.our_homes')}{' '}
              <span className="font-medium text-[var(--text-mute)]">· {homes.length}</span>
            </p>
            <button
              type="button"
              onClick={startNew}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
            >
              <Plus className="h-4 w-4" /> {t('homes.add_home')}
            </button>
          </div>
          <div>
            {activeHomes.map((home) => (
              <div
                key={home.id}
                className="flex items-center gap-3 border-b border-outline-variant px-1 py-3 last:border-b-0"
              >
                <MemberStack memberIds={home.members} contacts={contacts} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{home.label}</p>
                  <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                    {[home.place, home.members.map(nameOf).join(', ')].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(home)}
                  aria-label={`${t('homes.edit_home')}: ${home.label}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-variant"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {inactiveHomes.length > 0 && (
            <div className="mt-1 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className="flex w-full items-center gap-2 py-3 text-left text-[13px] text-on-surface-variant"
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', showInactive && 'rotate-90')} />
                {t('homes.inactive_section')}{' '}
                <span className="text-[var(--text-mute)]">
                  · {inactiveHomes.length} {t('homes.households_moved_on')}
                </span>
              </button>
              {showInactive &&
                inactiveHomes.map((home) => (
                  <div key={home.id} className="flex items-center gap-3 px-1 py-3 opacity-60">
                    <MemberStack memberIds={home.members} contacts={contacts} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{home.label}</p>
                      <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                        {[home.place, home.members.map(nameOf).join(', '), visitCountLabel(visitCount(home.id))]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div ref={suggestionsRef} className="border-t border-outline-variant px-7 py-5">
          <p className="text-[13px] font-semibold">{t('homes.suggestions')}</p>
          <p className="mt-1 text-xs text-[var(--text-mute)]">{t('homes.suggestions_hint')}</p>
          <div className="mt-3 flex flex-col gap-2">
            {suggestions.map((p, i) => {
              const names = p.memberIds.map(nameOf).filter(Boolean);
              return (
                <div
                  key={`${p.source}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-outline-variant px-3.5 py-3"
                >
                  <MemberStack memberIds={p.memberIds} contacts={contacts} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {p.label || t('homes.unnamed_home')}
                      <span className="ml-1.5 rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                        {p.source === 'co-visit' ? t('homes.from_visits') : t('homes.from_surnames')}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-variant">{names.join(', ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startSuggestion(p)}
                    className="inline-flex h-9 shrink-0 items-center rounded-full border border-outline-variant bg-[var(--bg-elev)] px-4 text-sm font-medium text-on-surface"
                  >
                    {t('homes.confirm')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const isNew = !editing?.id;
  const editorBody = editing && (
    <>
      <PopupSection label={t('homes.section_the_home')}>
        <div className="flex flex-col gap-4">
          <PopupField label={t('homes.label')} htmlFor="home-label">
            <input
              id="home-label"
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder={t('homes.label_placeholder')}
              className={inputCls}
            />
          </PopupField>
          <PopupField label={t('homes.place')} htmlFor="home-place" hint={t('homes.where_hint')}>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mute)]" />
              <input
                id="home-place"
                value={editing.place}
                onChange={(e) => setEditing({ ...editing, place: e.target.value })}
                placeholder={t('homes.place_placeholder')}
                className={cn(inputCls, 'pl-10')}
              />
            </div>
          </PopupField>
        </div>
      </PopupSection>

      <PopupSection label={t('homes.who_lives_here')}>
        <div className="flex flex-wrap gap-2">
          {realContacts.map((c) => {
            const on = editing.memberIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMember(c.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-full border pl-1 pr-2.5 text-[13px] transition-colors',
                  on
                    ? 'border-accent-line bg-primary/10 text-accent'
                    : 'border-outline-variant bg-[var(--bg-elev)] text-on-surface',
                )}
              >
                <span
                  style={avatarTint(c.id)}
                  aria-hidden="true"
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold"
                >
                  {initialsOf(c.name)}
                </span>
                {c.name}
              </button>
            );
          })}
        </div>
      </PopupSection>

      {!isNew && (
        <PopupSection label={t('homes.section_status')}>
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px]">{t('homes.active_home')}</span>
            <Switch
              checked={editing.active}
              onChange={(v) => setEditing({ ...editing, active: v })}
              aria-label={t('homes.active_home')}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-mute)]">{t('homes.active_hint')}</p>
        </PopupSection>
      )}

      <PopupSection label={t('homes.notes')}>
        <textarea
          id="home-notes"
          rows={3}
          value={editing.notes}
          onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
          placeholder={t('homes.notes_placeholder')}
          className={cn(inputCls, 'resize-y')}
        />
      </PopupSection>

      {!isNew && canCombine && (
        <div className="border-t border-outline-variant px-7 py-4">
          {/* Combine leaves the editor, so unsaved edits would be dropped
              unasked. Saving first is simpler than a second discard question. */}
          <button
            type="button"
            disabled={dirty}
            onClick={() => editingHome && startCombine(editingHome)}
            className="inline-flex h-11 items-center gap-2 text-sm font-medium text-on-surface transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-on-surface"
          >
            <ArrowRightLeft className="h-4 w-4" /> {t('homes.combine_into')}
          </button>
          {dirty && <p className="text-xs text-[var(--text-mute)]">{t('homes.combine_save_first')}</p>}
        </div>
      )}
    </>
  );

  const combineBody = combining && (
    <>
      <div className="border-t border-outline-variant px-7 py-5">
        <p className="mb-3 text-[13px] font-semibold">{t('homes.combine_pick_title')}</p>
        <div className="flex flex-col gap-2">
          {homes
            .filter((h) => h.id !== combining.source.id)
            .sort(byHomeLabel)
            .map((h) => {
              const selected = combining.target?.id === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setCombining({ ...combining, target: h })}
                  aria-label={`${t('homes.combine_keep')} ${h.label}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                    selected ? 'border-primary bg-surface-container-low' : 'border-outline-variant',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                      selected ? 'border-primary' : 'border-outline',
                    )}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{h.label}</span>
                    <span className="block truncate text-xs text-on-surface-variant">
                      {[h.place, h.members.map(nameOf).join(', '), visitCountLabel(visitCount(h.id))]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
      {combining.target && (
        <div className="border-t border-outline-variant px-7 py-5">
          <p className="mb-2 text-[13px] font-semibold">{t('homes.combine_what_happens')}</p>
          <div className="rounded-xl bg-surface-container-low px-3.5 py-3 text-[13px]">
            {combineSummary(combining.source, combining.target, visits, t)}
          </div>
        </div>
      )}
    </>
  );

  // One frame for all three views; only its props change, so it never remounts.
  const view = combining ? 'combine' : editing ? 'editor' : 'list';

  // The button that opened a view is gone once the view changes, which would
  // drop focus to the page behind the dialog. Keep it inside.
  const firstViewRef = useRef(true);
  useEffect(() => {
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return;
    }
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }, [view]);

  const frameProps: Omit<PopupFrameProps, 'open' | 'onClose' | 'children'> =
    combining
      ? {
          onBack: leaveCombine,
          backLabel: t('homes.combine_back_home'),
          title: t('homes.combine_heading').replace('{source}', combining.source.label),
          subtitle: t('homes.combine_subtitle').replace('{visits}', visitCountLabel(visitCount(combining.source.id))),
          error:
            actionError === 'combine'
              ? {
                  message: t('homes.couldnt_combine'),
                  retryLabel: t('modals.try_again'),
                  onRetry: () => void confirmCombine(),
                }
              : null,
          cancelLabel: t('modals.cancel'),
          onCancel: leaveCombine,
          primary: {
            label: t('homes.combine_confirm'),
            onClick: () => void confirmCombine(),
            disabled: !combining.target,
            saving: busy,
            savingLabel: t('homes.combine_working'),
          },
        }
      : editing
        ? {
            onBack: leaveEditor,
            backLabel: t('homes.back_to_list'),
            title: isNew ? t('homes.new_home') : editing.label.trim() || t('homes.unnamed_home'),
            subtitle: isNew ? undefined : visitCountLabel(visitCount(editing.id as string)),
            dirty,
            discardQuestion: t('homes.discard_question'),
            destructive: canDelete ? { label: t('homes.delete_home'), onClick: () => void remove() } : null,
            footerHint: canDelete ? t('homes.never_visited_hint') : undefined,
            error:
              actionError === 'delete'
                ? {
                    message: t('homes.couldnt_delete'),
                    retryLabel: t('modals.try_again'),
                    onRetry: () => void remove(),
                  }
                : null,
            cancelLabel: t('modals.cancel'),
            onCancel: leaveEditor,
            primary: {
              label: isNew ? t('homes.create_home') : t('homes.save_changes'),
              onClick: () => void save(),
              disabled: !editing.label.trim(),
              saving,
              savingLabel: t('homes.saving'),
            },
          }
        : {
            eyebrow: t('homes.eyebrow'),
            title: t('homes.title'),
            subtitle: t('homes.list_subtitle'),
          };

  return (
    <>
      <PopupFrame open={isOpen} onClose={onClose} size="md" {...frameProps}>
        <div ref={bodyRef}>{combining ? combineBody : editing ? editorBody : listBody}</div>
      </PopupFrame>
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </>
  );
}

/** The preview sentence for Combine: what moves to the Home being kept. */
function combineSummary(
  source: Home,
  target: Home,
  visits: Visit[],
  t: (key: string, fallback?: string) => string,
): string {
  const people = source.members.length;
  const movingVisits = visits.filter((v) => v.homeId === source.id).length;
  const peopleLabel =
    people === 1 ? t('homes.combine_one_person') : t('homes.combine_people').replace('{count}', String(people));
  const visitsLabel =
    movingVisits === 1
      ? t('homes.combine_one_visit')
      : t('homes.combine_visits').replace('{count}', String(movingVisits));
  return (movingVisits === 0
    ? t('homes.combine_move_people_only').replace('{people}', peopleLabel)
    : t('homes.combine_move_summary').replace('{people}', peopleLabel).replace('{visits}', visitsLabel)
  ).replace('{target}', target.label);
}
