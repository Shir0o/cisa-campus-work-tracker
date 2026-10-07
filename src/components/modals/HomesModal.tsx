// Homes — the roster behind "Who we haven't seen". A home is a household, not
// an address: it keeps its identity (and its visits) when it moves, and goes
// inactive rather than being deleted when the last person leaves. Homes are
// suggested, never derived — every proposal is confirmed and editable before
// it saves, so a wrong home is harder to notice than a missing one.
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft, Check, House, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
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
import type { Contact, Home, Visit } from '../../types';

interface HomesModalProps {
  isOpen: boolean;
  onClose: () => void;
  homes: Home[];
  contacts: Contact[];
  visits: Visit[];
  onHomeSaved: (home: Home) => void;
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

function HomeForm({
  draft,
  contacts,
  onChange,
  onSave,
  saving,
  isNew,
  canDelete,
  canCombine,
  onDelete,
  onStartCombine,
}: {
  draft: Draft;
  contacts: Contact[];
  onChange: (draft: Draft) => void;
  onSave: () => void;
  saving: boolean;
  isNew: boolean;
  canDelete: boolean;
  canCombine: boolean;
  onDelete: () => void;
  onStartCombine: () => void;
}) {
  const { t } = useLanguage();
  const label = 'block text-[10px] font-semibold text-on-surface-variant mb-2';
  const input =
    'w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors';

  const toggleMember = (id: string) => {
    const memberIds = draft.memberIds.includes(id)
      ? draft.memberIds.filter((x) => x !== id)
      : [...draft.memberIds, id];
    // A home with nobody left in it goes inactive, not away — its visits keep
    // their meaning.
    onChange({ ...draft, memberIds, active: memberIds.length > 0 ? draft.active : false });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className={label} htmlFor="home-label">
          {t('homes.label')}
        </label>
        <input
          id="home-label"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder={t('homes.label_placeholder')}
          className={input}
        />
      </div>
      <div>
        <label className={label} htmlFor="home-place">
          {t('homes.place')}
        </label>
        <input
          id="home-place"
          value={draft.place}
          onChange={(e) => onChange({ ...draft, place: e.target.value })}
          placeholder={t('homes.place_placeholder')}
          className={input}
        />
      </div>
      <div>
        <label className={label}>{t('homes.who_lives_here')}</label>
        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={draft.memberIds.includes(c.id)}
              onClick={() => toggleMember(c.id)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] border transition-colors',
                draft.memberIds.includes(c.id)
                  ? 'bg-primary/10 border-accent-line text-accent'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-primary/15 grid place-items-center text-[9px] font-semibold">
                {initialsOf(c.name)}
              </span>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {!isNew && (
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => onChange({ ...draft, active: e.target.checked })}
            className="accent-primary"
          />
          {t('homes.active_home')}
        </label>
      )}
      <div>
        <label className={label} htmlFor="home-notes">
          {t('homes.notes')}{' '}
          <span className="normal-case tracking-normal font-normal">{t('homes.optional')}</span>
        </label>
        <textarea
          id="home-notes"
          rows={2}
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          placeholder={t('homes.notes_placeholder')}
          className={cn(input, 'resize-y')}
        />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={!draft.label.trim() || saving}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? t('homes.saving') : isNew ? t('homes.create_home') : t('homes.save_changes')}
        </button>
      </div>
      {!isNew && (canCombine || canDelete) && (
        <div className="flex items-center gap-3 pt-4 mt-1 border-t border-outline-variant flex-wrap">
          {canCombine && (
            <button
              onClick={onStartCombine}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" /> {t('homes.combine_into')}
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-error hover:bg-error/10 transition-colors ml-auto"
            >
              <Trash2 className="w-4 h-4" /> {t('homes.delete_home')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The "Combine into…" flow for a Home entered twice (ADR 0040 §2): pick the
 *  Home to keep, then confirm against a preview of what moves. */
function CombinePanel({
  source,
  target,
  homes,
  visits,
  busy,
  onPick,
  onBack,
  onCancel,
  onConfirm,
}: {
  source: Home;
  target: Home | null;
  homes: Home[];
  visits: Visit[];
  busy: boolean;
  onPick: (target: Home) => void;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const others = homes.filter((h) => h.id !== source.id);
  const people = source.members.length;
  const movingVisits = visits.filter((v) => v.homeId === source.id).length;
  const peopleLabel =
    people === 1
      ? t('homes.combine_one_person')
      : t('homes.combine_people').replace('{count}', String(people));
  const visitsLabel =
    movingVisits === 1
      ? t('homes.combine_one_visit')
      : t('homes.combine_visits').replace('{count}', String(movingVisits));
  const summary = (
    movingVisits === 0
      ? t('homes.combine_move_people_only').replace('{people}', peopleLabel)
      : t('homes.combine_move_summary').replace('{people}', peopleLabel).replace('{visits}', visitsLabel)
  ).replace('{target}', target?.label ?? '');

  return (
    <div>
      <button onClick={onCancel} className="text-sm text-accent hover:underline mb-4">
        {t('homes.back_to_list')}
      </button>
      <h3 className="font-serif text-[19px] text-on-surface mb-1">{t('homes.combine_title')}</h3>
      {!target ? (
        <>
          <p className="text-xs text-on-surface-variant mb-3">{t('homes.combine_pick_hint')}</p>
          <div className="flex flex-col gap-2">
            {others.map((h) => (
              <button
                key={h.id}
                onClick={() => onPick(h)}
                aria-label={`${t('homes.combine_keep')} ${h.label}`}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-outline-variant text-left hover:border-accent-line transition-colors"
              >
                <span className="w-9 h-9 bg-primary/10 text-accent rounded-2xl grid place-items-center shrink-0">
                  <House className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-on-surface">{h.label}</span>
                <span className="ml-auto text-xs font-medium text-accent">{t('homes.combine_keep')}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface mb-4">{summary}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              {t('homes.combine_confirm')}
            </button>
            <button onClick={onBack} className="text-sm text-accent hover:underline">
              {t('homes.combine_back')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function HomesModal({
  isOpen,
  onClose,
  homes,
  contacts,
  visits,
  onHomeSaved,
}: HomesModalProps) {
  const { t } = useLanguage();
  const { user, effectiveUserId } = useAuth();
  const me = effectiveUserId || user?.uid || '';
  const myName = user?.displayName || 'A full-timer';

  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [combining, setCombining] = useState<{ source: Home; target: Home | null } | null>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  const realContacts = useMemo(() => pickableContacts(contacts), [contacts]);

  const excluded = useMemo(() => homedMemberIds(homes), [homes]);
  const suggestions = useMemo<HomeProposal[]>(() => {
    const coVisit = suggestHomesByCoVisit(visits, realContacts, excluded);
    const covered = new Set(coVisit.flatMap((p) => p.memberIds));
    const surname = suggestHomesBySurname(realContacts, [...excluded, ...covered]);
    return [...coVisit, ...surname];
  }, [visits, realContacts, excluded]);

  const startNew = () => setEditing(emptyDraft());
  const startEdit = (home: Home) =>
    setEditing({
      id: home.id,
      label: home.label,
      place: home.place ?? '',
      notes: home.notes ?? '',
      memberIds: home.members.slice(),
      active: home.active,
    });
  const startSuggestion = (proposal: HomeProposal) =>
    setEditing({ ...emptyDraft(), label: proposal.label, memberIds: proposal.memberIds.slice() });

  const editingHome = editing?.id ? homes.find((h) => h.id === editing.id) ?? null : null;
  const canDelete = !!editingHome && isHomeUnvisited(editingHome.id, visits);
  const canCombine = !!editingHome && homes.length > 1;

  /** Delete a Home made by mistake (ADR 0040 §1) — immediate, with Undo. */
  const remove = async () => {
    const home = editingHome;
    if (!home || busy) return;
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
      setEditing(null);
      showUndoSnack(t('homes.deleted_snack'), () => {
        void restoreHome(home, { uid: me, name: myName }).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, `homes/${home.id}`),
        );
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `homes/${home.id}`);
    } finally {
      setBusy(false);
    }
  };

  /** Combine the Home entered twice into the Home to keep (ADR 0040 §2). */
  const confirmCombine = async () => {
    if (!combining?.target || busy) return;
    const { source, target } = combining;
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
      setCombining(null);
      setEditing(null);
      onHomeSaved(target);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `homes/${target.id}`);
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
      setEditing(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'homes');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setEditing(null);
      setCombining(null);
    }
  }, [isOpen]);

  return (
    <>
      <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('homes.title')}
            className="relative w-full max-w-2xl max-h-[90vh] bg-surface-container rounded-[2rem] shadow-2xl overflow-hidden border border-outline-variant flex flex-col"
          >
            <div className="p-6 border-b border-outline-variant flex items-center gap-3 bg-surface-container-high/50">
              <div className="w-12 h-12 bg-primary/10 text-accent rounded-2xl flex items-center justify-center shrink-0">
                <House className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-2xl text-on-surface">{t('homes.title')}</h2>
                <p className="text-xs text-on-surface-variant">{t('homes.subtitle')}</p>
              </div>
              <button
                onClick={onClose}
                aria-label={t('homes.close')}
                className="ml-auto p-2 rounded-full hover:bg-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {combining ? (
                <CombinePanel
                  source={combining.source}
                  target={combining.target}
                  homes={homes}
                  visits={visits}
                  busy={busy}
                  onPick={(target) => setCombining({ ...combining, target })}
                  onBack={() => setCombining({ ...combining, target: null })}
                  onCancel={() => setCombining(null)}
                  onConfirm={confirmCombine}
                />
              ) : editing ? (
                <div>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-sm text-accent hover:underline mb-4"
                  >
                    {t('homes.back_to_list')}
                  </button>
                  <HomeForm
                    draft={editing}
                    contacts={realContacts}
                    onChange={setEditing}
                    onSave={save}
                    saving={saving}
                    isNew={!editing.id}
                    canDelete={canDelete}
                    canCombine={canCombine}
                    onDelete={remove}
                    onStartCombine={() =>
                      editingHome && setCombining({ source: editingHome, target: null })
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="font-serif text-[19px] text-on-surface">{t('homes.our_homes')}</h3>
                      <p className="text-xs text-on-surface-variant">{t('homes.our_homes_hint')}</p>
                    </div>
                    <button
                      onClick={startNew}
                      className="inline-flex items-center gap-2 px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" /> {t('homes.add_home')}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {homes.length === 0 && (
                      <p className="text-sm text-on-surface-variant">{t('homes.no_homes_yet')}</p>
                    )}
                    {homes.map((home) => (
                      <div
                        key={home.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-outline-variant"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-on-surface">{home.label}</span>
                            {home.place && (
                              <span className="text-xs text-on-surface-variant">{home.place}</span>
                            )}
                            {!home.active && (
                              <span className="text-xs text-on-surface-variant">{t('homes.inactive')}</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {home.members.map((id) => {
                              const c = contacts.find((x) => x.id === id);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-accent text-[11px] font-medium"
                                >
                                  {initialsOf(c?.name ?? '?')} {c?.name ?? '?'}
                                </span>
                              );
                            })}
                            {home.members.length === 0 && (
                              <span className="text-xs text-on-surface-variant">{t('homes.no_members')}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => startEdit(home)}
                          aria-label={`${t('homes.edit_home')}: ${home.label}`}
                          className="p-2 rounded-full hover:bg-surface-variant transition-colors text-on-surface-variant"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {suggestions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-accent" />
                        <h3 className="font-serif text-[19px] text-on-surface">{t('homes.suggestions')}</h3>
                      </div>
                      <p className="text-xs text-on-surface-variant mb-3">{t('homes.suggestions_hint')}</p>
                      <div className="flex flex-col gap-2">
                        {suggestions.map((p, i) => {
                          const names = p.memberIds
                            .map((id) => contacts.find((x) => x.id === id)?.name)
                            .filter(Boolean);
                          return (
                            <div
                              key={`${p.source}-${i}`}
                              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-outline-variant"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-on-surface">
                                  {p.label || t('homes.unnamed_home')}
                                  <span className="ml-2 text-[10px] font-medium text-on-surface-variant uppercase">
                                    {p.source === 'co-visit' ? t('homes.from_visits') : t('homes.from_surnames')}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-on-surface-variant">
                                  {names.join(', ')}
                                </div>
                              </div>
                              <button
                                onClick={() => startSuggestion(p)}
                                className="px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium"
                              >
                                {t('homes.confirm')}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </>
  );
}