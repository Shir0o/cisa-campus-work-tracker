import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Check, Combine, Loader2, Plus, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  guessTagCombines,
  planTagApplies,
  standardTagsForGuessing,
  type TagCombine,
  type TagGuess,
  type TagGuessReason,
} from '../lib/tags';
import { useStandardTags, saveStandardTags } from '../lib/standardTags';
import { useLanguage } from '../components/LanguageProvider';
import PageContainer from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';
import type { Contact } from '../types';

/** The reason a guess was made, as shown next to it (issue #1435). */
const REASON_KEYS: Record<TagGuessReason, string> = {
  'standard-context': 'Standard tag plus a context word',
  'standard-extra': 'Standard tag plus an extra word',
  'case-punctuation': 'Case, punctuation or spacing',
  'extra-words': 'Another tag plus extra words',
  typo: 'One-letter typo',
};

const reasonLabel = (t: (key: string, fallback?: string) => string, guess: TagGuess): string =>
  guess.reasons.map((reason) => t(`combine_tags.reason_${reason}`, REASON_KEYS[reason])).join(' · ');

/**
 * Combine tags (issue #1435, spec #1426). A Full-timer page reached from the
 * directory, replacing the old modal: strong guesses start checked, weak
 * guesses start unchecked, and each can be edited (a variant removed, the
 * target changed) before applying through the Full-timer-only server endpoint.
 * A side panel edits the standard tags list (#1437): reorder, remove, add —
 * the list the chips and the guesses read.
 */
export default function CombineTags() {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Per-guess overrides. Absent means "the tier default" (strong on, weak off).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // Per-guess edits: a reduced variant list and/or a changed target.
  const [edited, setEdited] = useState<Record<string, { variants: string[]; target: string }>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  // The stored standard tags, edited locally while a save is in flight.
  const storedStandardTags = useStandardTags();
  const [standardDraft, setStandardDraft] = useState<string[] | null>(null);
  const [newStandardTag, setNewStandardTag] = useState('');
  const standardTags = standardDraft ?? storedStandardTags;

  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => {
        setError(true);
        setLoading(false);
        handleFirestoreError(e, OperationType.LIST, 'contacts');
      },
    );
  }, []);

  const guesses = useMemo(
    () => guessTagCombines(contacts, standardTagsForGuessing(standardTags, contacts)),
    [contacts, standardTags],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    contacts.forEach((contact) => (contact.tags ?? []).forEach((tag) => tags.add(tag)));
    return [...tags].sort();
  }, [contacts]);

  const resolve = (guess: TagGuess) => edited[guess.id] ?? { variants: guess.variants, target: guess.target };

  const isEnabled = (guess: TagGuess) => toggled[guess.id] ?? guess.tier === 'strong';

  const activeCombines = useMemo<TagCombine[]>(
    () =>
      guesses
        .filter((guess) => isEnabled(guess))
        .map((guess) => {
          const resolved = resolve(guess);
          return { variants: resolved.variants, target: resolved.target };
        })
        .filter((combine) => combine.variants.length > 0 && combine.target.trim().length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guesses, toggled, edited],
  );

  const rows = useMemo(() => planTagApplies(contacts, activeCombines), [contacts, activeCombines]);

  const strong = guesses.filter((guess) => guess.tier === 'strong');
  const weak = guesses.filter((guess) => guess.tier === 'weak');

  const toggleGuess = (guess: TagGuess) => {
    setToggled((prev) => ({ ...prev, [guess.id]: !isEnabled(guess) }));
    setApplied(null);
  };

  const removeVariant = (guess: TagGuess, variant: string) => {
    const resolved = resolve(guess);
    setEdited((prev) => ({
      ...prev,
      [guess.id]: { ...resolved, variants: resolved.variants.filter((v) => v !== variant) },
    }));
    setApplied(null);
  };

  const setTarget = (guess: TagGuess, target: string) => {
    const resolved = resolve(guess);
    setEdited((prev) => ({ ...prev, [guess.id]: { ...resolved, target } }));
    setApplied(null);
  };

  // Standard tags (#1437): removing or reordering only edits this list, never a
  // contact's tags (ADR 0039).
  const updateStandardTags = (next: string[]) => {
    setStandardDraft(next);
    void saveStandardTags(next);
  };

  const moveStandardTag = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= standardTags.length) return;
    const next = [...standardTags];
    [next[index], next[target]] = [next[target], next[index]];
    updateStandardTags(next);
  };

  const addStandardTag = () => {
    const value = newStandardTag.trim();
    setNewStandardTag('');
    if (!value) return;
    if (standardTags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return;
    updateStandardTags([...standardTags, value]);
  };

  const contactCountFor = (guess: TagGuess) => {
    const resolved = resolve(guess);
    if (resolved.variants.length === 0) return 0;
    return rows.filter((row) => row.from.some((tag) => resolved.variants.includes(tag))).length;
  };

  const apply = async () => {
    if (applying || activeCombines.length === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/combine-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ combines: activeCombines }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t('combine_tags.apply_failed', 'Could not combine tags'));
      }
      const body = await response.json();
      setApplied(body.changedCount ?? rows.length);
      setEdited({});
      setToggled({});
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const renderGuess = (guess: TagGuess) => {
    const resolved = resolve(guess);
    const enabled = isEnabled(guess);
    const count = contactCountFor(guess);
    return (
      <div
        key={guess.id}
        data-testid={`tag-guess-${guess.id}`}
        className={`rounded-2xl border p-4 transition-colors ${
          enabled ? 'border-primary/40 bg-surface' : 'border-outline-variant/40 bg-surface-variant/30'
        }`}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => toggleGuess(guess)}
            aria-label={t('combine_tags.toggle_guess', 'Include this guess')}
            className="mt-1 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
          />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-on-surface-variant line-through">
                {resolved.variants.join(', ') || '—'}
              </span>
              <span className="text-sm text-primary font-bold">→</span>
              <input
                type="text"
                list="combine-tags-all"
                value={resolved.target}
                onChange={(event) => setTarget(guess, event.target.value)}
                aria-label={t('combine_tags.target', 'Combine into')}
                className="text-sm font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-transparent focus:border-primary/40 focus:outline-none"
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              {reasonLabel(t, guess)} ·{' '}
              {t('combine_tags.contact_count', '{n} contacts').replace('{n}', String(count))}
            </p>
            {resolved.variants.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {resolved.variants.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => removeVariant(guess, variant)}
                    data-testid={`remove-variant-${guess.id}-${variant}`}
                    aria-label={t('combine_tags.remove_variant', 'Remove {tag}').replace('{tag}', variant)}
                    className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-0.5 text-xs text-on-surface-variant hover:bg-surface-variant"
                  >
                    {variant}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageContainer>
      <datalist id="combine-tags-all">
        {allTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>

      <header className="mb-6">
        <h1 className="font-serif text-3xl text-on-surface flex items-center gap-2">
          <Combine className="w-6 h-6 text-primary" />
          {t('combine_tags.title', 'Combine tags')}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {t(
            'combine_tags.subtitle',
            'Review guessed tag combines, edit them, then apply through the server.',
          )}
        </p>
      </header>

      {applyError && (
        <p className="mb-4 rounded-lg border border-outline-variant bg-surface-variant/40 px-4 py-3 text-sm text-on-surface">
          {applyError}
        </p>
      )}
      {applied !== null && (
        <p
          data-testid="tag-combine-applied"
          className="mb-4 rounded-lg border border-outline-variant bg-surface-variant/40 px-4 py-3 text-sm text-on-surface"
        >
          {t('combine_tags.applied', 'Combined tags on {n} contacts.').replace('{n}', String(applied))}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8 min-w-0">
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="font-medium text-on-surface">
                {t('combine_tags.load_error', 'Could not load contacts')}
              </p>
            </div>
          ) : guesses.length === 0 ? (
            <div className="py-16 text-center">
              <Check className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-on-surface">
                {t('combine_tags.no_guesses', 'No tag combines found')}
              </p>
            </div>
          ) : (
            <>
              {strong.length > 0 && (
                <section data-testid="strong-guesses">
                  <h2 className="mb-3 text-sm font-semibold text-on-surface">
                    {t('combine_tags.strong', 'Strong guesses')}
                  </h2>
                  <div className="space-y-2">{strong.map(renderGuess)}</div>
                </section>
              )}

              {weak.length > 0 && (
                <section data-testid="weak-guesses">
                  <h2 className="mb-3 text-sm font-semibold text-on-surface">
                    {t('combine_tags.weak', 'Weak guesses')}
                  </h2>
                  <div className="space-y-2">{weak.map(renderGuess)}</div>
                </section>
              )}

              <section>
                <h2 className="mb-3 text-sm font-semibold text-on-surface">
                  {t('combine_tags.contacts_would_change', '{n} contacts would change').replace(
                    '{n}',
                    String(rows.length),
                  )}
                </h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">
                    {t('combine_tags.nothing_to_combine', 'Nothing to combine')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rows.slice(0, 100).map((row) => (
                      <div
                        key={row.contactId}
                        className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                      >
                        <p className="font-medium text-on-surface">{row.name}</p>
                        <p className="text-sm text-on-surface-variant mt-1">
                          <span className="text-on-surface-variant/70">
                            {t('combine_tags.before', 'Before:')}
                          </span>{' '}
                          {row.from.join(', ') || '—'}
                        </p>
                        <p className="text-sm text-on-surface-variant mt-0.5">
                          <span className="text-on-surface-variant/70">
                            {t('combine_tags.after', 'After:')}
                          </span>{' '}
                          {row.to.join(', ') || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="sticky bottom-4 flex justify-end">
                <button
                  type="button"
                  onClick={apply}
                  disabled={rows.length === 0 || applying}
                  className="inline-flex items-center gap-2 h-12 px-6 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {applying
                    ? t('combine_tags.applying', 'Applying…')
                    : t('combine_tags.apply', 'Combine {n} contacts').replace(
                        '{n}',
                        String(rows.length),
                      )}
                </button>
              </div>
            </>
          )}
        </div>

        <aside
          data-testid="standard-tags-panel"
          className="space-y-3 self-start rounded-2xl border border-outline-variant/60 bg-surface p-4 lg:sticky lg:top-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-on-surface">
              {t('combine_tags.standard_tags', 'Standard tags')}
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              {t(
                'combine_tags.standard_tags_hint',
                'Suggested when tagging and preferred by the guesses. Removing one never changes a contact.',
              )}
            </p>
          </div>

          <ul className="space-y-1">
            {standardTags.map((tag, index) => (
              <li
                key={tag}
                data-testid={`standard-tag-${tag}`}
                className="flex items-center gap-1 rounded-lg border border-outline-variant/50 px-2 py-1"
              >
                <span className="flex-1 min-w-0 truncate text-sm text-on-surface">{tag}</span>
                <button
                  type="button"
                  onClick={() => moveStandardTag(index, -1)}
                  disabled={index === 0}
                  aria-label={t('combine_tags.move_up', 'Move {tag} up').replace('{tag}', tag)}
                  className="p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStandardTag(index, 1)}
                  disabled={index === standardTags.length - 1}
                  aria-label={t('combine_tags.move_down', 'Move {tag} down').replace('{tag}', tag)}
                  className="p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateStandardTags(standardTags.filter((item) => item !== tag))}
                  data-testid={`remove-standard-tag-${tag}`}
                  aria-label={t('combine_tags.remove_standard', 'Remove {tag}').replace('{tag}', tag)}
                  className="p-1 text-on-surface-variant hover:text-on-surface"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newStandardTag}
              onChange={(event) => setNewStandardTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addStandardTag();
                }
              }}
              placeholder={t('combine_tags.add_standard_placeholder', 'Add a standard tag')}
              aria-label={t('combine_tags.add_standard', 'Add a standard tag')}
              className="flex-1 min-w-0 h-9 px-2 rounded-lg bg-surface-container-high border border-outline outline-none text-sm text-on-surface"
            />
            <button
              type="button"
              onClick={addStandardTag}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('combine_tags.add', 'Add')}
            </button>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
