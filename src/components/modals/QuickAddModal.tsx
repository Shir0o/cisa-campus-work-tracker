// Quick add (cut-or-keep §26): one box for what just happened, parsed into a
// preview where every field is editable and nothing saves until Save. The
// entry point is the Directory toolbar, beside Smart Text Import.
import React, { useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { PopupFrame } from '../ui/PopupFrame';
import { YEARS } from '../../lib/contactYear';
import { saveQuickAdd } from '../../lib/quickAdd';
import type {
  QuickAddContactDraft,
  QuickAddInteractionDraft,
  QuickAddMatch,
  QuickAddReminderDraft,
} from '../../../packages/core/src/quickAdd';

const STEP_OPTIONS = ['lead', 'contact', 'follow-up', 'connected', 'active'];
const INTERACTION_TYPES = ['meeting', 'call', 'text', 'visit', 'chat', 'other'];

const emptyContact = (): QuickAddContactDraft => ({
  name: '',
  phone: '',
  email: '',
  year: '',
  step: '',
  tags: [],
});

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The team's own stages, when the Directory has them loaded. */
  stages?: string[];
}

type Step = 'input' | 'parsing' | 'preview' | 'saving' | 'saved';

export default function QuickAddModal({ isOpen, onClose, stages = [] }: QuickAddModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<QuickAddContactDraft>(emptyContact);
  const [matches, setMatches] = useState<QuickAddMatch[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  // Several people matched: nothing is chosen yet, so Save waits for a tap.
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const [interaction, setInteraction] = useState<QuickAddInteractionDraft | null>(null);
  const [prayer, setPrayer] = useState('');
  const [reminder, setReminder] = useState<QuickAddReminderDraft | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep('input');
    setText('');
    setError(null);
    setContact(emptyContact());
    setMatches([]);
    setMatchId(null);
    setAwaitingChoice(false);
    setInteraction(null);
    setPrayer('');
    setReminder(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const set = <K extends keyof QuickAddContactDraft>(key: K, value: QuickAddContactDraft[K]) =>
    setContact((current) => ({ ...current, [key]: value }));

  const setTalk = (key: keyof QuickAddInteractionDraft, value: string) =>
    setInteraction((current) => (current ? { ...current, [key]: value } : current));

  const canSave = !awaitingChoice && Boolean(matchId || contact.name.trim());
  const picked = matches.find((match) => match.id === matchId) ?? null;

  const handleParse = async () => {
    if (!text.trim()) {
      setError(t('modals.quickAdd.note_required'));
      return;
    }
    setError(null);
    setStep('parsing');
    try {
      let token: string | undefined;
      if (user) {
        try {
          token = await user.getIdToken();
        } catch {
          // Test/demo mode: the route's auth check is skipped there.
        }
      }
      if (!token && auth?.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
        } catch {
          // fall through without a token
        }
      }

      const response = await fetch('/api/quick-add/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) {
        throw new Error(body.error || t('modals.quickAdd.parse_failed'));
      }

      const nextContact: QuickAddContactDraft = { ...emptyContact(), ...(body.contact || {}) };
      const nextMatches: QuickAddMatch[] = Array.isArray(body.match) ? body.match : [];
      setContact(nextContact);
      setMatches(nextMatches);
      // One candidate is the person; several stay unchosen so the preview asks.
      setMatchId(nextMatches.length === 1 ? nextMatches[0].id : null);
      setAwaitingChoice(nextMatches.length > 1);
      setInteraction(body.interaction ?? null);
      setPrayer(body.prayer ?? '');
      setReminder(body.reminder ?? null);
      setStep('preview');
    } catch (err: any) {
      setError(err?.message || t('modals.quickAdd.parse_failed'));
      setStep('input');
    }
  };

  const handleSave = async () => {
    if (!canSave || step === 'saving') return;
    setError(null);
    setStep('saving');
    try {
      await saveQuickAdd(
        {
          matchId,
          matchName: picked?.name ?? null,
          contact,
          interaction,
          prayer,
          reminder,
        },
        { uid: user?.uid ?? null, name: user?.displayName ?? null },
      );
      setStep('saved');
    } catch (err: any) {
      setError(err?.message || t('modals.quickAdd.save_failed'));
      setStep('preview');
    }
  };

  const primary =
    step === 'input'
      ? {
          label: t('modals.quickAdd.parse'),
          onClick: () => void handleParse(),
          disabled: !text.trim(),
          savingLabel: t('modals.quickAdd.parsing'),
        }
      : step === 'preview'
        ? {
            label: t('modals.quickAdd.save'),
            onClick: () => void handleSave(),
            disabled: !canSave,
            savingLabel: t('modals.quickAdd.saving'),
          }
        : step === 'saved'
          ? {
              label: t('modals.quickAdd.done'),
              onClick: close,
              savingLabel: t('modals.quickAdd.done'),
            }
          : undefined;

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { type?: string; placeholder?: string; multiline?: boolean; list?: string } = {},
  ) => (
    <label className="block text-xs font-medium text-on-surface-variant">
      {label}
      {options.list ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full p-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        >
          <option value="">{t('modals.quickAdd.none')}</option>
          {options.list.split('|').map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : options.multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder={options.placeholder}
          className="mt-1 w-full p-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm resize-y"
        />
      ) : (
        <input
          type={options.type ?? 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={options.placeholder}
          className="mt-1 w-full p-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        />
      )}
    </label>
  );

  return (
    <PopupFrame
      open={isOpen}
      onClose={close}
      size="lg"
      title={t('modals.quickAdd.title')}
      subtitle={t('modals.quickAdd.subtitle')}
      dirty={Boolean(text.trim() || step === 'preview')}
      noun={t('modals.quickAdd.noun')}
      cancelLabel={t('modals.quickAdd.cancel')}
      primary={primary}
      cancelDiscards
    >
      <div className="p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-on-surface">
              {t('modals.quickAdd.note_label')}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('modals.quickAdd.placeholder')}
                rows={6}
                className="mt-2 w-full p-4 rounded-xl border border-outline-variant bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm leading-relaxed resize-y"
              />
            </label>
            <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent" />
              {t('modals.quickAdd.tip')}
            </p>
          </div>
        )}

        {step === 'parsing' && (
          <div className="py-16 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
            <h3 className="font-serif text-lg font-medium">{t('modals.quickAdd.parsing')}</h3>
            <p className="text-sm text-on-surface-variant">{t('modals.quickAdd.parsing_desc')}</p>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            {matches.length > 0 && (
              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-on-surface-variant">
                  {t('modals.quickAdd.matches')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={!awaitingChoice && matchId === null}
                    onClick={() => {
                      setMatchId(null);
                      setAwaitingChoice(false);
                    }}
                    className={`px-3 py-2 rounded-full border text-sm font-medium ${
                      !awaitingChoice && matchId === null
                        ? 'border-primary bg-primary/10 text-accent'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {t('modals.quickAdd.new_person')}
                  </button>
                  {matches.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      aria-pressed={matchId === match.id}
                      onClick={() => {
                        setMatchId(match.id);
                        setAwaitingChoice(false);
                      }}
                      className={`px-3 py-2 rounded-full border text-sm font-medium ${
                        matchId === match.id
                          ? 'border-primary bg-primary/10 text-accent'
                          : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {match.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant">{t('modals.quickAdd.match_hint')}</p>
              </section>
            )}

            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-on-surface-variant">
                {t('modals.quickAdd.contact')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field(t('modals.quickAdd.name'), contact.name, (value) => set('name', value))}
                {field(t('modals.quickAdd.phone'), contact.phone, (value) => set('phone', value))}
                {field(t('modals.quickAdd.email'), contact.email, (value) => set('email', value), {
                  type: 'email',
                })}
                {field(t('modals.quickAdd.year'), contact.year, (value) => set('year', value), {
                  list: YEARS.join('|'),
                })}
                {field(t('modals.quickAdd.step'), contact.step, (value) => set('step', value), {
                  list: (stages.length > 0 ? stages : STEP_OPTIONS).join('|'),
                })}
                {field(
                  t('modals.quickAdd.tags'),
                  contact.tags.join(', '),
                  (value) =>
                    set(
                      'tags',
                      value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    ),
                  { placeholder: t('modals.quickAdd.tags_hint') },
                )}
              </div>
              {!canSave && (
                <p className="text-xs text-on-surface-variant">{t('modals.quickAdd.no_name')}</p>
              )}
            </section>

            {interaction && (
              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-on-surface-variant">
                  {t('modals.quickAdd.interaction')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field(
                    t('modals.quickAdd.interaction_type'),
                    interaction.type,
                    (value) => setTalk('type', value),
                    { list: INTERACTION_TYPES.join('|') },
                  )}
                  {field(
                    t('modals.quickAdd.interaction_when'),
                    interaction.when,
                    (value) => setTalk('when', value),
                    { type: 'date' },
                  )}
                </div>
                {field(
                  t('modals.quickAdd.interaction_notes'),
                  interaction.notes,
                  (value) => setTalk('notes', value),
                  { multiline: true },
                )}
              </section>
            )}

            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-on-surface-variant">
                {t('modals.quickAdd.prayer')}
              </h4>
              {field(t('modals.quickAdd.prayer_text'), prayer, setPrayer, {
                placeholder: t('modals.quickAdd.prayer_hint'),
              })}
            </section>

            {reminder && (
              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-on-surface-variant">
                  {t('modals.quickAdd.reminder')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field(
                    t('modals.quickAdd.reminder_when'),
                    reminder.when,
                    (value) => setReminder((current) => (current ? { ...current, when: value } : current)),
                    { type: 'date' },
                  )}
                  {field(
                    t('modals.quickAdd.reminder_text'),
                    reminder.text,
                    (value) => setReminder((current) => (current ? { ...current, text: value } : current)),
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {step === 'saving' && (
          <div className="py-16 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
            <h3 className="font-serif text-lg font-medium">{t('modals.quickAdd.saving')}</h3>
            <p className="text-sm text-on-surface-variant">{t('modals.quickAdd.saving_desc')}</p>
          </div>
        )}

        {step === 'saved' && (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="font-serif text-2xl font-semibold">{t('modals.quickAdd.saved')}</h3>
            <p className="text-sm text-on-surface-variant">{t('modals.quickAdd.saved_desc')}</p>
          </div>
        )}
      </div>
    </PopupFrame>
  );
}
