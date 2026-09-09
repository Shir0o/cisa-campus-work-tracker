// @cisa/core mirror of the web app's src/lib/bibleStudy.ts — keep in step.
export type PromptKind = "question" | "discuss" | "activity" | "apply";

export type Blank = { before: string; word: string; after: string };
export type Text = { before: string };

/**
 * One block of a Section's ordered content (ADR 0013 — "read as written").
 * Blocks render in `content` order; the legacy `points`/`passage`/`prompt`
 * fields remain the derived summary views over the same constructs.
 */
export type ProseBlock = { kind: "prose"; md: string };
/** One point of a list block. Indented sub-points nest via `children` (ADR 0013 §Decision 2). */
export type ListItem = (Blank | Text) & { children?: ListItem[] };
export type ListBlock = { kind: "bullet-list" | "number-list"; points: ListItem[] };
export type PassageBlock = { kind: "passage"; passage: Blank | Text; ref?: string };
/** A proof-text in the flow: the reference leads, the words follow at body size (#918). */
export type VerseBlock = { kind: "verse"; ref: string; verse?: Blank | Text };
export type PromptBlock = { kind: "prompt"; prompt: { kind: PromptKind; text: string } };
export type SectionBlock = ProseBlock | ListBlock | PassageBlock | VerseBlock | PromptBlock;

export type Section = {
  id: string;
  title: string;
  /** The Section's content in the order the author wrote it. */
  content: SectionBlock[];
  /** Legacy summary views over `content`, kept for consumers and old documents. */
  points: (Blank | Text)[];
  passage?: Blank | Text;
  prompt?: { kind: PromptKind; text: string };
  ref?: string;
};

export type Meeting = {
  id: string;
  studyId: string;
  date: string; // yyyy-MM-dd
  title: string;
  sections: Section[];
  published: boolean;
  md?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
};

export type Study = {
  id: string;
  title: string;
  term: string; // e.g. "Fall 2026"
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
};

export type EntryPoint = {
  id: string; // the slug — it names the standing invitation and never changes
  slug: string;
  name: string;
  activeStudyId: string | null; // exactly one Study is active at a time; null between terms
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
};

export type ReaderState = {
  // A read model, not the navigation owner (#890): the scroll container owns
  // "which Section am I on" and mirrors the visible panel in here for the
  // progress rail, the counter and the index highlight. jump is the one
  // remaining navigation action — the Section index dispatches it.
  sectionIndex: number;
  totalSections: number;
  openBlanks: Record<string, boolean>;
  navOpen: boolean;
};

export type ReaderAction =
  | { type: "jump"; index: number }
  | { type: "setTotalSections"; count: number }
  | { type: "revealBlank"; key: string }
  | { type: "openIndex" }
  | { type: "closeIndex" };

function parseBlankOrText(str: string): Blank | Text {
  const match = str.match(/^(.*?)\[\[(.*?)\]\](.*)$/s);
  if (match) {
    return {
      before: match[1],
      word: match[2],
      after: match[3],
    };
  }
  return { before: str };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .join('-');
}

function parseHeading(line: string): string | null {
  let hashes = 0;
  while (hashes < line.length && line[hashes] === '#') {
    hashes++;
  }
  if (hashes >= 1 && hashes <= 3 && hashes < line.length && (line[hashes] === ' ' || line[hashes] === '\t')) {
    const title = line.slice(hashes).trim();
    return title;
  }
  return null;
}

export function parseMeeting(md: string): Section[] {
  if (!md || !md.trim()) return [];

  const lines = md.split("\n");
  const rawSections: { title: string; lines: string[] }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingTitle = parseHeading(line);
    if (headingTitle !== null) {
      if (currentTitle || currentLines.length > 0) {
        rawSections.push({ title: currentTitle || "Untitled", lines: currentLines });
      }
      currentTitle = headingTitle;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle || currentLines.length > 0) {
    rawSections.push({ title: currentTitle || "Untitled", lines: currentLines });
  }

  const sections: Section[] = rawSections.map((raw, i) => {
    const content = parseSectionBody(raw.lines);
    // Legacy summary views over the same constructs (kept for consumers).
    const points = content.flatMap((b) => (b.kind === "bullet-list" ? b.points : []));
    const firstPassage = content.find((b): b is PassageBlock => b.kind === "passage");
    const lastPrompt = [...content].reverse().find((b): b is PromptBlock => b.kind === "prompt");

    // Firestore rejects `undefined` field values, and these sections are
    // written verbatim by saveMeeting — optional keys must be omitted, not
    // present with an undefined value, when the markdown has no passage or
    // prompt.
    return {
      id: slugify(raw.title) || `sec-${i}`,
      title: raw.title,
      content,
      points,
      ...(firstPassage?.passage !== undefined && { passage: firstPassage.passage }),
      ...(firstPassage?.ref !== undefined && { ref: firstPassage.ref }),
      ...(lastPrompt?.prompt !== undefined && { prompt: lastPrompt.prompt }),
    };
  });

  return sections;
}

/**
 * The Section body grammar (ADR 0013 — read as written): consecutive `>`
 * lines are one Passage block (last line = citation), `Verse:` lines are
 * Verse blocks (reference leading, text following — #918), `Question:/Discuss:/`
 * `Activity:` lines are Prompt blocks, `- `/`* ` runs are bullet-list blocks,
 * `1.`-style runs are number-list blocks (each point loses its number
 * prefix — the <ol> marker renders it), and any other non-blank run is a
 * prose block carried verbatim as markdown for the renderer. Nothing is
 * dropped. Indentation depth relative to the list's first line nests a
 * point under its parent instead of flattening it into a sibling (ADR 0013
 * §Decision 2 "nested lists").
 */
/**
 * Builds the nested point tree from a list's lines. The first line sets the
 * list's base indentation; each following line nests under the nearest
 * shallower point, so deeper indentation becomes a child (ADR 0013
 * §Decision 2). Dedenting past an ancestor pops back to it; legacy flat
 * documents (no indentation) produce exactly the flat points array the
 * pre-nesting grammar produced. `strip` removes the list marker's own
 * rendering job (bullet `- `/`* ` here; the caller pre-strips numbers).
 */
function nestListPoints(
  lines: { indent: number; text: string }[],
  listKind: "bullet-list" | "number-list",
): ListItem[] {
  const strip = (text: string) =>
    listKind === "bullet-list" ? text.replace(/^[-*]\s+/, "") : text.replace(/^\d+[.)]\s+/, "");
  const roots: ListItem[] = [];
  // Stack of (indent, point) ancestors; roots sit at the bottom as a
  // virtual -Infinity level.
  const stack: { indent: number; point: ListItem }[] = [{ indent: -1, point: { before: "" } }];
  for (const { indent, text } of lines) {
    const point = parseBlankOrText(strip(text));
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].point;
    if (stack.length === 1) {
      roots.push(point);
    } else {
      (parent.children ??= []).push(point);
    }
    stack.push({ indent, point });
  }
  return roots;
}

function parseSectionBody(lines: string[]): SectionBlock[] {
  const content: SectionBlock[] = [];
  let quoteLines: string[] | null = null;
  let listLines: { indent: number; text: string }[] | null = null;
  let listKind: "bullet-list" | "number-list" = "bullet-list";
  let proseLines: string[] | null = null;

  const flushList = () => {
    if (listLines && listLines.length > 0) {
      content.push({ kind: listKind, points: nestListPoints(listLines, listKind) });
    }
    listLines = null;
  };
  const flushProse = () => {
    if (proseLines && proseLines.length > 0) {
      content.push({ kind: "prose", md: proseLines.join("\n").trim() });
    }
    proseLines = null;
  };
  const flushQuote = () => {
    if (quoteLines && quoteLines.length > 0) {
      const passageText =
        quoteLines.length > 1 ? quoteLines.slice(0, -1).join(" ").trim() : quoteLines.join(" ").trim();
      content.push({
        kind: "passage",
        passage: parseBlankOrText(passageText),
        ...(quoteLines.length > 1 ? { ref: quoteLines[quoteLines.length - 1].trim() } : {}),
      });
    }
    quoteLines = null;
  };
  const flushAll = () => {
    flushList();
    flushProse();
    flushQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }

    if (line.startsWith(">")) {
      flushList();
      flushProse();
      quoteLines = quoteLines ?? [];
      quoteLines.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();

    const promptMatch = line.match(/^(question|discuss|activity|apply):\s*(.*)$/i);
    if (promptMatch) {
      flushList();
      flushProse();
      const last = content[content.length - 1];
      const prompt = { kind: promptMatch[1].toLowerCase() as PromptKind, text: promptMatch[2].trim() };
      // The last prompt in a Section is the Prompt; an earlier prompt block
      // dissolves into prose (same rule the legacy summary field followed).
      if (last && last.kind === "prompt") {
        content[content.length - 1] = { kind: "prose", md: `${last.prompt.kind}: ${last.prompt.text}` };
      }
      content.push({ kind: "prompt", prompt });
      continue;
    }

    // A Verse line (#918): `Verse: <reference> — <text>`. The prefix is the
    // one unambiguous marker — shape detection of a reference is explicitly
    // rejected, so a leading-reference line stays prose. The reference leads
    // and the words follow at body size; a line with no ` — ` carries just
    // the reference.
    const verseMatch = line.match(/^verse:\s*(.*)$/i);
    if (verseMatch) {
      flushList();
      flushProse();
      const rest = verseMatch[1].trim();
      const sep = rest.search(/—/);
      const ref = (sep === -1 ? rest : rest.slice(0, sep)).trim();
      const text = sep === -1 ? "" : rest.slice(sep + 1).trim();
      content.push({
        kind: "verse",
        ref,
        ...(text ? { verse: parseBlankOrText(text) } : {}),
      });
      continue;
    }

    const bulletMatch = rawLine.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushProse();
      if (!listLines) {
        listKind = "bullet-list";
        listLines = [];
      }
      // A bullet line always continues a list; an indented one nests under
      // its parent by depth (ADR 0013 §Decision 2).
      listLines.push({ indent: bulletMatch[1].length, text: bulletMatch[2].trim() });
      continue;
    }
    const numberContMatch = listLines ? rawLine.match(/^(\s*)(\d+[.)])\s+(.*)$/) : null;
    const numberMatch = numberContMatch ?? line.match(/^(\d+[.)])\s+(.*)$/);
    if (numberMatch) {
      flushProse();
      if (!listLines) {
        listKind = "number-list";
        listLines = [];
      }
      // A list-continuation line (3 groups) carries its indent in group 1;
      // a list-start line (2 groups) is trimmed, so its indent is 0 (the
      // first line sets the base). An indented numbered line continues an
      // open bullet list too — mixed bullet/number nesting follows the same
      // depth rule.
      const indent = numberContMatch ? numberContMatch[1].length : 0;
      listLines.push({ indent, text: numberMatch[numberMatch.length - 1].trim() });
      continue;
    }

    flushList();
    proseLines = proseLines ?? [];
    proseLines.push(line);
  }

  flushAll();
  return content;
}
/**
 * The result of resolving a scan (or a staff permalink) through the chain
 * Entry point -> active Study -> newest published Meeting. The three kinds
 * are the three honest answers a student can be given; `isFallback` is true
 * when the returned Meeting is not the current week's, and `fallbackDate`
 * must be stated rather than implied.
 */
export type ScanResolution =
  | { kind: "meeting"; meeting: Meeting; isFallback: boolean; fallbackDate?: string }
  | { kind: "never-published" }
  | { kind: "no-active-study" };

/**
 * A Meeting is the current week's from the Monday of its date's week. A
 * Wednesday-dated Meeting stays current through Sunday and becomes "an older
 * week" the moment the next week starts — which is exactly when silently
 * showing it would begin to lie.
 */
function weekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Monday-start week
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves an Entry point (or, for a dated permalink, a Study directly) to
 * what the reader should show. Pure — every outcome is testable with plain
 * data and no mocks.
 */
export function resolveScan(
  entryPoint: EntryPoint | null,
  study: Study | null,
  meetings: Meeting[],
  today: string,
  permalinkDate?: string,
): ScanResolution {
  if (permalinkDate) {
    // A permalink addresses one week by Study and date; the Entry point plays
    // no part in the chain.
    if (!study) return { kind: "no-active-study" };
    const published = meetings.filter((m) => m.published).sort((a, b) => b.date.localeCompare(a.date));
    if (published.length === 0) return { kind: "never-published" };
    const boundary = weekStart(today);
    const match = published.find((m) => m.date === permalinkDate);
    if (match) {
      const isFallback = match.date < boundary;
      return { kind: "meeting", meeting: match, isFallback, fallbackDate: isFallback ? match.date : undefined };
    }
    // The named week does not exist: show the newest week and say so with its
    // date rather than rendering an empty page.
    const newest = published[0];
    return { kind: "meeting", meeting: newest, isFallback: true, fallbackDate: newest.date };
  }

  if (!entryPoint || !study) return { kind: "no-active-study" };

  const published = meetings.filter((m) => m.published).sort((a, b) => b.date.localeCompare(a.date));
  if (published.length === 0) return { kind: "never-published" };

  const newest = published[0];
  const isFallback = newest.date < weekStart(today);
  return {
    kind: "meeting",
    meeting: newest,
    isFallback,
    fallbackDate: isFallback ? newest.date : undefined,
  };
}

/**
 * The date a brand-new week gets: the first free date a week after the
 * newest existing Meeting, or — for a study with no weeks yet — the next
 * Wednesday strictly after today. Dates already taken by a Meeting are
 * skipped, so a rapid second click never lands on an existing week.
 */
export function nextMeetingDate(meetings: Meeting[], today: string): string {
  const dates = new Set(meetings.map((m) => m.date));
  const newest = meetings.map((m) => m.date).sort((a, b) => b.localeCompare(a))[0];
  const base = new Date(`${(newest ?? today)}T00:00:00Z`);
  let shift = newest ? 7 : (3 - base.getUTCDay() + 7) % 7 || 7; // 3 = Wednesday
  let candidate: string;
  do {
    base.setUTCDate(base.getUTCDate() + shift);
    candidate = base.toISOString().slice(0, 10);
    shift = 7; // after the first hop, always a full week
  } while (dates.has(candidate));
  return candidate;
}

/**
 * The editor's one Section mutation (#890): appends a new `## ` heading at the
 * END of the document, never at the textarea's cursor — a textarea that has
 * never been focused reports selectionStart 0, which is how a new Section used
 * to land silently at the top. Returns the new markdown plus the caret offset
 * the editor should land on: right after the hashes, so the author immediately
 * types the Section's name.
 */
export function appendSection(md: string): { md: string; caret: number } {
  // Trailing-whitespace scan from the end, not a regex: a `[…]+$` replace is
  // quadratic on a long whitespace run followed by non-whitespace (CodeQL
  // js/polynomial-redos) — each start position retries the anchored match.
  let end = md.length;
  while (end > 0) {
    const c = md.charCodeAt(end - 1);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11) end--;
    else break;
  }
  const trimmedEnd = md.slice(0, end);
  const next = trimmedEnd ? `${trimmedEnd}\n\n## ` : '## ';
  return { md: next, caret: next.length };
}

/**
 * The character offset of each Section heading — the offsets
 * `sectionIndexAtOffset` maps back. Empty for a headingless document.
 */
export function sectionOffsets(md: string): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const line of md.split('\n')) {
    if (parseHeading(line) !== null) offsets.push(at);
    at += line.length + 1; // +1 restores the '\n' the split consumed
  }
  return offsets;
}

/**
 * Which Section the caret sits in: the heading whose offset most recently
 * passed `offset`. A document that opens with prose sits in its untitled
 * leading Section, which owns offset 0 even though no heading produced it.
 * Returns -1 only when the document has no headings at all.
 */
export function sectionIndexAtOffset(md: string, offset: number): number {
  const offsets = sectionOffsets(md);
  if (offsets.length === 0) return -1;
  let index = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= offset) index = i;
    else break;
  }
  return index;
}

/**
 * Where a block insertion belongs (#921): the end of the caret's Section —
 * a Prompt, a Passage and a Verse all live INSIDE a Section, so appending
 * to the document end would file them under the last Section while the
 * author writes the second (the same class of silent misplacement ADR 0014
 * §9 fixed for Sections one level up). The caret's Section ends where the
 * next heading begins, or at the end of the document for the last one; with
 * the caret in no Section (a headingless document), the insertion falls back
 * to the end of the document. The returned offset is the end of the
 * Section's content with trailing blank lines trimmed, so the caller
 * appends `\n\n` + the block and gets exactly one blank line of separation
 * whatever the document was terminated with. Never the caret itself, so an
 * insertion can never split the line the author is mid-way through.
 */
export function blockInsertionPoint(md: string, offset: number): { offset: number } {
  const offsets = sectionOffsets(md);
  const index = sectionIndexAtOffset(md, offset);
  // The caret's Section ends where the next heading begins. The leading
  // untitled Section (prose before the first heading) owns offset 0 but has
  // no heading of its own, so its end is the FIRST heading's offset, not
  // `offsets[index + 1]` — which would fall through to the document end and
  // file the block under the last Section.
  const sectionEnd =
    index >= 0 ? (index === 0 && offsets[0] > 0 ? offsets[0] : offsets[index + 1] ?? md.length) : md.length;
  // Blank-line scan from the end, not a regex: a `[…]+$` replace is
  // quadratic on a long whitespace run followed by non-whitespace (CodeQL
  // js/polynomial-redos) — each start position retries the anchored match.
  // Only blank lines are trimmed, never spaces on the last content line:
  // a Section whose content is an empty `## ` heading must keep its space,
  // or the heading would be destroyed by the insertion.
  let end = sectionEnd;
  while (end > 0) {
    const c = md.charCodeAt(end - 1);
    if (c === 10 || c === 13) end--;
    else break;
  }
  return { offset: end };
}

/**
 * A new week starts from a small skeleton that teaches the three conventions
 * — Section heading, blockquote Passage, marked Prompt line — visibly as
 * placeholders. Never a silent copy of the previous week's text, which risks
 * publishing last week's content under this week's date.
 */
export const MEETING_SKELETON_MD = `## This week's title

- First point — hide a word by wrapping it in double brackets: a [[blank]]

> The passage goes here, a verse at a time.
> Reference · Version

Discuss: The prompt the room answers out loud.
`;

export type MeetingForm = {
  title: string;
  date: string;
  markdown: string;
  published: boolean;
};

/**
 * Whether the editor's form has drifted from the Meeting it was loaded from
 * (or last saved as). This is what the unsaved-changes guard and the
 * editor's own "Unsaved changes" chip are driven by.
 */
export function isMeetingDirty(form: MeetingForm, saved: MeetingForm): boolean {
  return (
    form.title !== saved.title ||
    form.date !== saved.date ||
    form.markdown !== saved.markdown ||
    form.published !== saved.published
  );
}

/**
 * The two records that had no way to exist (#822). A Study and an Entry point
 * were creatable only by `scripts/seed-bible-study.ts`, which needs a
 * service-account key — so a Full-timer opening /bible-study on a fresh
 * database saw a disabled "New week" button and a terminal command they had no
 * way to run. This form is the same two writes, from the app.
 *
 * The same shape serves both flows: the first run creates a Study and the
 * Entry point that points at it; a new term creates a Study and re-points the
 * Entry point that already exists (ADR 0011 — the slug never changes).
 */
export type StudySetupForm = {
  studyTitle: string;
  term: string;
  entryPointName: string;
  slug: string;
};

export type StudySetupError = { field: keyof StudySetupForm; message: string };

// Mirrors the size limits in firestore.rules (isValidStudy / isValidEntryPoint)
// so a Full-timer is told what is wrong here, rather than by an opaque
// permission-denied after the write leaves.
const SETUP_LIMITS: Record<keyof StudySetupForm, number> = {
  studyTitle: 200,
  term: 64,
  entryPointName: 200,
  slug: 64,
};

/**
 * The document id a Study gets — derived from its title and term, so "Romans"
 * and "Fall 2026" become `romans-fall-2026`. It is readable in the staff
 * permalink, and deterministic, so submitting twice writes the same Study
 * rather than a second one.
 */
export function studyIdFor(title: string, term: string): string {
  return slugify(`${title} ${term}`).slice(0, 128);
}

/** The slug offered for a new Entry point, derived from the name it is given. */
export function slugFor(name: string): string {
  return slugify(name).slice(0, 64);
}

/**
 * What is wrong with the form, as a list — empty means it is safe to write.
 * Pure: every case is testable with plain data.
 */
export function validateStudySetup(form: StudySetupForm): StudySetupError[] {
  const errors: StudySetupError[] = [];

  const required: [keyof StudySetupForm, string][] = [
    ['studyTitle', 'Give the study a title.'],
    ['term', 'Name the term.'],
    ['entryPointName', 'Name what this code opens.'],
    ['slug', 'The code needs a slug.'],
  ];
  for (const [field, message] of required) {
    if (!form[field].trim()) errors.push({ field, message });
  }

  for (const field of Object.keys(SETUP_LIMITS) as (keyof StudySetupForm)[]) {
    const limit = SETUP_LIMITS[field];
    if (form[field].trim().length > limit) {
      errors.push({ field, message: `Keep this to ${limit} characters.` });
    }
  }

  // The slug is the Entry point's document id and lives in a URL: letters,
  // digits, hyphens and underscores only (firestore.rules isValidId).
  const slug = form.slug.trim();
  if (slug && !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    errors.push({ field: 'slug', message: 'Letters, numbers, hyphens and underscores only.' });
  }

  // A title and term of nothing but punctuation slugify to an empty id, which
  // no document can carry.
  if (form.studyTitle.trim() && form.term.trim() && !studyIdFor(form.studyTitle, form.term)) {
    errors.push({ field: 'studyTitle', message: 'Use some letters or numbers in the title or term.' });
  }
  return errors;
}

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case "jump": {
      const targetIndex = Math.max(0, Math.min(action.index, state.totalSections - 1));
      return { ...state, sectionIndex: targetIndex, navOpen: false };
    }
    case "setTotalSections": {
      const total = Math.max(1, action.count);
      const targetIndex = Math.min(state.sectionIndex, total - 1);
      return { ...state, totalSections: total, sectionIndex: targetIndex };
    }
    case "revealBlank": {
      const current = !!state.openBlanks[action.key];
      return {
        ...state,
        openBlanks: {
          ...state.openBlanks,
          [action.key]: !current,
        },
      };
    }
    case "openIndex":
      return { ...state, navOpen: true };
    case "closeIndex":
      return { ...state, navOpen: false };
    default:
      return state;
  }
}
