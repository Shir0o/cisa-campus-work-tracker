export type PromptKind = "question" | "discuss" | "activity";

export type Blank = { before: string; word: string; after: string };
export type Text = { before: string };

export type Section = {
  id: string;
  title: string;
  ref?: string;
  points: (Blank | Text)[];
  passage?: Blank | Text;
  prompt?: { kind: PromptKind; text: string };
  long?: boolean;
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
  sectionIndex: number;
  totalSections: number;
  openBlanks: Record<string, boolean>;
  navOpen: boolean;
  unadorned: boolean;
};

export type ReaderAction =
  | { type: "advance" }
  | { type: "back" }
  | { type: "jump"; index: number }
  | { type: "setTotalSections"; count: number }
  | { type: "revealBlank"; key: string }
  | { type: "openIndex" }
  | { type: "closeIndex" }
  | { type: "toggleUnadorned" };

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

  // Split by markdown headings (e.g. ## Heading or # Heading)
  const lines = md.split('\n');
  const rawSections: { title: string; lines: string[] }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingTitle = parseHeading(line);
    if (headingTitle !== null) {
      if (currentTitle || currentLines.length > 0) {
        rawSections.push({ title: currentTitle || 'Untitled', lines: currentLines });
      }
      currentTitle = headingTitle;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle || currentLines.length > 0) {
    rawSections.push({ title: currentTitle || 'Untitled', lines: currentLines });
  }

  const sections: Section[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const raw = rawSections[i];
    const points: (Blank | Text)[] = [];
    let passageText: string | undefined;
    let passageRef: string | undefined;
    let prompt: { kind: PromptKind; text: string } | undefined;

    let inBlockquote = false;
    let blockquoteLines: string[] = [];

    const flushBlockquote = () => {
      if (blockquoteLines.length > 0) {
        // If the last line looks like a citation (e.g. "Romans 5:1–2 · WEB" or starts with book)
        if (blockquoteLines.length > 1) {
          const lastLine = blockquoteLines[blockquoteLines.length - 1].trim();
          passageRef = lastLine;
          passageText = blockquoteLines.slice(0, -1).join(' ').trim();
        } else {
          passageText = blockquoteLines.join(' ').trim();
        }
        blockquoteLines = [];
      }
      inBlockquote = false;
    };

    for (const rawLine of raw.lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inBlockquote) {
          flushBlockquote();
        }
        continue;
      }

      if (line.startsWith('>')) {
        inBlockquote = true;
        blockquoteLines.push(line.replace(/^>\s*/, ''));
        continue;
      } else if (inBlockquote) {
        flushBlockquote();
      }

      // Check prompt
      const promptMatch = line.match(/^(question|discuss|activity):\s*(.*)$/i);
      if (promptMatch) {
        prompt = {
          kind: promptMatch[1].toLowerCase() as PromptKind,
          text: promptMatch[2].trim(),
        };
        continue;
      }

      // Check bullet point
      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        points.push(parseBlankOrText(bulletMatch[1]));
        continue;
      }
    }

    if (inBlockquote) {
      flushBlockquote();
    }

    const sectionId = slugify(raw.title) || `sec-${i}`;

    let passagePart: Blank | Text | undefined;
    if (passageText) {
      passagePart = parseBlankOrText(passageText);
    }

    sections.push({
      id: sectionId,
      title: raw.title,
      ref: passageRef,
      points,
      passage: passagePart,
      prompt,
    });
  }

  return sections;
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
 * The date a brand-new week gets: a week after the newest existing Meeting
 * (so a repeated "New week" never collides with an earlier draft), or — for
 * a study with no weeks yet — the next Wednesday strictly after today.
 */
export function nextMeetingDate(meetings: Meeting[], today: string): string {
  const newest = meetings.map((m) => m.date).sort((a, b) => b.localeCompare(a))[0];
  const base = new Date(`${(newest ?? today)}T00:00:00Z`);
  const shift = newest ? 7 : (3 - base.getUTCDay() + 7) % 7 || 7; // 3 = Wednesday
  base.setUTCDate(base.getUTCDate() + shift);
  return base.toISOString().slice(0, 10);
}

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'advance': {
      const nextIndex = Math.min(state.sectionIndex + 1, state.totalSections - 1);
      return { ...state, sectionIndex: nextIndex };
    }
    case 'back': {
      const prevIndex = Math.max(state.sectionIndex - 1, 0);
      return { ...state, sectionIndex: prevIndex };
    }
    case 'jump': {
      const targetIndex = Math.max(0, Math.min(action.index, state.totalSections - 1));
      return { ...state, sectionIndex: targetIndex, navOpen: false };
    }
    case 'setTotalSections': {
      const total = Math.max(1, action.count);
      const targetIndex = Math.min(state.sectionIndex, total - 1);
      return { ...state, totalSections: total, sectionIndex: targetIndex };
    }
    case 'revealBlank': {
      const current = !!state.openBlanks[action.key];
      return {
        ...state,
        openBlanks: {
          ...state.openBlanks,
          [action.key]: !current,
        },
      };
    }
    case 'openIndex':
      return { ...state, navOpen: true };
    case 'closeIndex':
      return { ...state, navOpen: false };
    case 'toggleUnadorned':
      return { ...state, unadorned: !state.unadorned };
    default:
      return state;
  }
}
