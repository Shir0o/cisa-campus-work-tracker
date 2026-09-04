export type PromptKind = 'question' | 'discuss' | 'activity';

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
  siblingId?: string;
  md?: string;
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
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'jump'; index: number }
  | { type: 'revealBlank'; key: string }
  | { type: 'openIndex' }
  | { type: 'closeIndex' }
  | { type: 'toggleUnadorned' };

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
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseMeeting(md: string): Section[] {
  if (!md || !md.trim()) return [];

  const lines = md.split('\n');
  const rawSections: { title: string; lines: string[] }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      if (currentTitle || currentLines.length > 0) {
        rawSections.push({ title: currentTitle || 'Untitled', lines: currentLines });
      }
      currentTitle = headingMatch[1].trim();
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

      const promptMatch = line.match(/^(question|discuss|activity):\s*(.*)$/i);
      if (promptMatch) {
        prompt = {
          kind: promptMatch[1].toLowerCase() as PromptKind,
          text: promptMatch[2].trim(),
        };
        continue;
      }

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

export function currentMeeting(
  meetings: Meeting[],
  todayDate: string,
  permalinkDate?: string,
): { meeting: Meeting; isStale: boolean } | null {
  const published = meetings
    .filter((m) => m.published)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (published.length === 0) return null;

  const newest = published[0];

  if (permalinkDate) {
    const match = published.find((m) => m.date === permalinkDate);
    if (!match) return null;
    return {
      meeting: match,
      isStale: match.id !== newest.id,
    };
  }

  return {
    meeting: newest,
    isStale: false,
  };
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
