import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Check, Combine, Loader2, Plus, Undo2, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  guessTagCombines,
  isSeasonTag,
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

/** A permanent tag combine record (issue #1435), as stored by the server. */
interface TagCombineRecord {
  id: string;
  kind?: string;
  status: 'pending' | 'done' | 'undone';
  combinedByName?: string;
  combinedAt?: string;
  undoneByName?: string;
  undoneAt?: string;
  contacts?: Array<{ contactId: string; name: string }>;
}

/** A contact the undo skipped because it was re-tagged after the combine. */
interface TagUndoSkipped {
  contactId: string;
  name: string;
  current: string[];
  after: string[];
}

/** A combine the Full-timer built from the All tags list (issue #1438). */
interface CustomCombine {
  id: string;
  variants: string[];
  target: string;
  makeStandard: boolean;
}

const formatWhen = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

/** Fills {placeholders} in a translated string. */
const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');

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
  // The All tags list (#1438): tags picked for a user-built combine.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [combineTarget, setCombineTarget] = useState('');
  const [alsoMakeStandard, setAlsoMakeStandard] = useState(false);
  const [customCombines, setCustomCombines] = useState<CustomCombine[]>([]);
  // The stored standard tags, edited locally while a save is in flight.
  const storedStandardTags = useStandardTags();
  const [standardDraft, setStandardDraft] = useState<string[] | null>(null);
  const [newStandardTag, setNewStandardTag] = useState('');
  const standardTags = standardDraft ?? storedStandardTags;
  // Recent tag combines (issue #1436), so a wrong combine can be undone.
  const [records, setRecords] = useState<TagCombineRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoResult, setUndoResult] = useState<{
    recordId: string;
    restored: number;
    skipped: TagUndoSkipped[];
  } | null>(null);

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

  useEffect(() => {
    const q = query(collection(db, 'combineRecords'), orderBy('combinedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() })) as TagCombineRecord[],
        );
        setRecordsLoading(false);
      },
      (e) => {
        setRecordsLoading(false);
        handleFirestoreError(e, OperationType.LIST, 'combineRecords');
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

  // Every tag with its contact count and whether it is standard (#1438). Season
  // tags count as standard by pattern (ADR 0039).
  const allTagRows = useMemo(() => {
    const standardNorms = new Set(
      standardTagsForGuessing(standardTags, contacts).map((tag) => tag.toLowerCase()),
    );
    const counts = new Map<string, number>();
    contacts.forEach((contact) => {
      new Set((contact.tags ?? []).map((tag) => (tag ?? '').trim()).filter(Boolean)).forEach((tag) =>
        counts.set(tag, (counts.get(tag) ?? 0) + 1),
      );
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count, standard: standardNorms.has(tag.toLowerCase()) }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [contacts, standardTags]);

  const isNewTarget =
    combineTarget.trim().length > 0 &&
    !allTagRows.some((row) => row.tag.toLowerCase() === combineTarget.trim().toLowerCase()) &&
    !isSeasonTag(combineTarget);

  const resolve = (guess: TagGuess) => edited[guess.id] ?? { variants: guess.variants, target: guess.target };

  const isEnabled = (guess: TagGuess) => toggled[guess.id] ?? guess.tier === 'strong';

  const activeCombines = useMemo<TagCombine[]>(() => {
    const fromGuesses = guesses
      .filter((guess) => isEnabled(guess))
      .map((guess) => {
        const resolved = resolve(guess);
        return { variants: resolved.variants, target: resolved.target };
      });
    const fromCustom = customCombines.map((combine) => ({
      variants: combine.variants,
      target: combine.target,
    }));
    return [...fromGuesses, ...fromCustom].filter(
      (combine) => combine.variants.length > 0 && combine.target.trim().length > 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guesses, toggled, edited, customCombines]);

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

  // Build your own combine (#1438): pick tags from the All tags list, name a
  // target, and add it to the review alongside the guesses.
  const toggleSelect = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const addCustomCombine = () => {
    const target = combineTarget.trim();
    if (selectedTags.length < 2 || !target) return;
    setCustomCombines((prev) => [
      ...prev,
      {
        id: `custom-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${prev.length}`,
        variants: [...selectedTags],
        target,
        makeStandard: alsoMakeStandard,
      },
    ]);
    setSelectedTags([]);
    setCombineTarget('');
    setAlsoMakeStandard(false);
    setApplied(null);
  };

  const removeCustomCombine = (id: string) => {
    setCustomCombines((prev) => prev.filter((combine) => combine.id !== id));
    setApplied(null);
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
      // A user-built combine can make its new name a standard tag in the same
      // step (#1438, ADR 0039). This only edits the standard tags list.
      const additions = customCombines
        .filter((combine) => combine.makeStandard)
        .map((combine) => combine.target.trim())
        .filter(Boolean);
      if (additions.length > 0) {
        const next = [...standardTags];
        for (const addition of additions) {
          if (!next.some((tag) => tag.toLowerCase() === addition.toLowerCase())) next.push(addition);
        }
        updateStandardTags(next);
      }
      setEdited({});
      setToggled({});
      setCustomCombines([]);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const tagRecords = records.filter((record) => record.kind === 'tags');

  const undoRecord = async (record: TagCombineRecord) => {
    if (undoingId) return;
    setUndoingId(record.id);
    setUndoError(null);
    setUndoResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/combine-tags/undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ combineRecordId: record.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || t('combine_tags.undo_failed', 'Could not undo combine'));
      }
      setUndoResult({
        recordId: record.id,
        restored: body.restoredCount ?? 0,
        skipped: (body.preview?.skipped ?? []) as TagUndoSkipped[],
      });
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoingId(null);
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
          ) : (
            <>
              {guesses.length === 0 && customCombines.length === 0 && (
                <div className="py-16 text-center">
                  <Check className="w-10 h-10 text-primary mx-auto mb-3" />
                  <p className="font-medium text-on-surface">
                    {t('combine_tags.no_guesses', 'No tag combines found')}
                  </p>
                </div>
              )}
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

              {customCombines.length > 0 && (
                <section data-testid="user-combines" className="space-y-2">
                  <h2 className="text-sm font-semibold text-on-surface">
                    {t('combine_tags.your_combines', 'Your combines')}
                  </h2>
                  {customCombines.map((combine) => (
                    <div
                      key={combine.id}
                      data-testid="user-combine"
                      className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-surface p-4"
                    >
                      <span className="flex-1 min-w-0 truncate text-sm text-on-surface-variant line-through">
                        {combine.variants.join(', ')}
                      </span>
                      <span className="text-sm text-primary font-bold">→</span>
                      <span className="text-sm font-semibold text-primary">{combine.target}</span>
                      {combine.makeStandard && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {t('combine_tags.also_make_standard', 'Also make standard')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeCustomCombine(combine.id)}
                        aria-label={t('combine_tags.remove_combine', 'Remove combine')}
                        className="p-1 text-on-surface-variant hover:text-on-surface"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </section>
              )}

              <section data-testid="all-tags">
                <h2 className="mb-3 text-sm font-semibold text-on-surface">
                  {t('combine_tags.all_tags', 'All tags')}
                </h2>
                <div className="space-y-1">
                  {allTagRows.map(({ tag, count, standard }) => (
                    <label
                      key={tag}
                      data-testid={`all-tag-${tag}`}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                        selectedTags.includes(tag)
                          ? 'border-primary/40 bg-surface'
                          : 'border-outline-variant/40 bg-surface-variant/20'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleSelect(tag)}
                        aria-label={t('combine_tags.select_tag', 'Select {tag}').replace('{tag}', tag)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
                      />
                      <span className="flex-1 min-w-0 truncate text-sm text-on-surface">{tag}</span>
                      {standard && (
                        <span
                          data-testid={`standard-marker-${tag}`}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {t('combine_tags.standard_badge', 'Standard')}
                        </span>
                      )}
                      <span className="text-xs text-on-surface-variant">
                        {t('combine_tags.contact_count', '{n} contacts').replace(
                          '{n}',
                          String(count),
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                {selectedTags.length >= 2 && (
                  <div
                    data-testid="combine-into-bar"
                    className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-surface p-3"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-on-surface-variant line-through">
                      {selectedTags.join(', ')}
                    </span>
                    <span className="text-sm text-primary font-bold">→</span>
                    <input
                      type="text"
                      list="combine-tags-all"
                      value={combineTarget}
                      onChange={(event) => {
                        setCombineTarget(event.target.value);
                        setApplied(null);
                      }}
                      placeholder={t('combine_tags.combine_into_placeholder', 'Combine into…')}
                      aria-label={t('combine_tags.combine_into', 'Combine into')}
                      data-testid="combine-into-target"
                      className="h-9 min-w-40 flex-1 rounded-lg bg-surface-container-high border border-outline px-2 text-sm text-on-surface outline-none"
                    />
                    {isNewTarget && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <input
                          type="checkbox"
                          checked={alsoMakeStandard}
                          onChange={(event) => setAlsoMakeStandard(event.target.checked)}
                          data-testid="also-make-standard"
                          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
                        />
                        {t('combine_tags.also_make_standard', 'Also make standard')}
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={addCustomCombine}
                      disabled={!combineTarget.trim()}
                      data-testid="combine-into-button"
                      className="inline-flex items-center gap-1 h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('combine_tags.combine_into', 'Combine into')}
                    </button>
                  </div>
                )}
              </section>

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

          <section data-testid="recent-tag-combines" className="space-y-3">
            <h2 className="text-sm font-semibold text-on-surface">
              {t('combine_tags.recent', 'Recent tag combines')}
            </h2>
            {undoError && (
              <p className="rounded-lg border border-outline-variant bg-surface-variant/40 px-4 py-3 text-sm text-on-surface">
                {undoError}
              </p>
            )}
            {recordsLoading ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : tagRecords.length === 0 ? (
              <p className="text-sm text-on-surface-variant italic">
                {t('combine_tags.no_recent', 'No tag combines yet')}
              </p>
            ) : (
              <div className="space-y-2">
                {tagRecords.map((record) => {
                  const count = record.contacts?.length ?? 0;
                  const result = undoResult?.recordId === record.id ? undoResult : null;
                  return (
                    <div
                      key={record.id}
                      data-testid="tag-combine-record"
                      className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-on-surface">
                            {t('combine_tags.contact_count', '{n} contacts').replace(
                              '{n}',
                              String(count),
                            )}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-1">
                            {fill(t('combine_tags.combined_by', 'By {name} on {date}'), {
                              name: record.combinedByName || '',
                              date: formatWhen(record.combinedAt),
                            })}
                          </p>
                          {record.status === 'undone' && (
                            <p className="text-xs text-on-surface-variant mt-1">
                              {fill(t('combine_tags.undone_by', 'Undone by {name} on {date}'), {
                                name: record.undoneByName || '',
                                date: formatWhen(record.undoneAt),
                              })}
                            </p>
                          )}
                        </div>
                        {record.status !== 'undone' && (
                          <button
                            type="button"
                            disabled={undoingId !== null}
                            onClick={() => undoRecord(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {undoingId === record.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Undo2 className="w-4 h-4" />
                            )}
                            {t('combine_tags.undo', 'Undo combine')}
                          </button>
                        )}
                      </div>
                      {result && (
                        <div
                          data-testid="tag-undo-result"
                          className="mt-3 border-t border-outline-variant/40 pt-3 text-sm"
                        >
                          <p className="text-on-surface-variant">
                            {fill(t('combine_tags.undo_restored', 'Restored {n} contacts'), {
                              n: String(result.restored),
                            })}
                          </p>
                          {result.skipped.length > 0 && (
                            <>
                              <p className="text-on-surface-variant mt-1">
                                {t(
                                  'combine_tags.undo_skipped',
                                  'Skipped contacts changed since:',
                                )}
                              </p>
                              <ul className="mt-1 ml-4 list-disc text-on-surface-variant">
                                {result.skipped.map((item) => (
                                  <li key={item.contactId}>{item.name || item.contactId}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
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
