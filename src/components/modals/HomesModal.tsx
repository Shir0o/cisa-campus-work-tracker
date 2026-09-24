// Homes — the roster behind "Who we haven't seen". A home is a household, not
// an address: it keeps its identity (and its visits) when it moves, and goes
// inactive rather than being deleted when the last person leaves. Homes are
// suggested, never derived — every proposal is confirmed and editable before
// it saves, so a wrong home is harder to notice than a missing one.
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, House, Loader2, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { addHome, homedMemberIds, suggestHomesByCoVisit, suggestHomesBySurname, updateHome, type HomeProposal } from '../../lib/homes';
import { handleFirestoreError, OperationType } from '../../lib/firebase';
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
}: {
  draft: Draft;
  contacts: Contact[];
  onChange: (draft: Draft) => void;
  onSave: () => void;
  saving: boolean;
  isNew: boolean;
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
    if (!isOpen) setEditing(null);
  }, [isOpen]);

  return (
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
              {editing ? (
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
  );
}