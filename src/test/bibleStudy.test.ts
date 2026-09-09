import {
  resolveScan,
  parseMeeting,
  nextMeetingDate,
  isMeetingDirty,
  slugFor,
  studyIdFor,
  validateStudySetup,
  MEETING_SKELETON_MD,
  appendSection,
  sectionOffsets,
  sectionIndexAtOffset,
  blockInsertionPoint,
  previewScale,
  type StudySetupForm,
  type Meeting,
  type Study,
  type EntryPoint,
} from '../lib/bibleStudy';

const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };

const ENTRY_POINT: EntryPoint = {
  id: 'cisa-wednesday',
  slug: 'cisa-wednesday',
  name: 'Wednesday Bible Study',
  activeStudyId: 'romans-fall26',
};

function meeting(overrides: Partial<Meeting> & { date: string }): Meeting {
  return {
    id: `romans-fall26-${overrides.date}`,
    studyId: 'romans-fall26',
    title: 'A week',
    sections: [],
    published: true,
    ...overrides,
  };
}

describe('resolveScan', () => {
  it('returns the newest published Meeting as current when its date is inside the current week', () => {
    const meetings = [
      meeting({ date: '2026-10-14', title: 'Alive to God' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: false,
    });
  });

  it('falls back to the most recent published Meeting with its date when this week is unpublished', () => {
    const meetings = [
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
      meeting({ date: '2026-09-30', title: 'The gift that is not wages' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-13');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('never shows a draft Meeting', () => {
    const meetings = [
      meeting({ date: '2026-10-14', published: false, title: 'Draft week' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    // This week's Meeting is a draft, so the newest published one is a
    // fallback whose date must be stated.
    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[1],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('reports never-published when the Study has no published Meeting', () => {
    const meetings = [meeting({ date: '2026-10-14', published: false })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    expect(result).toEqual({ kind: 'never-published' });
  });

  it('reports no-active-study when the Entry point has no active Study', () => {
    const betweenTerms: EntryPoint = { ...ENTRY_POINT, activeStudyId: null };

    expect(resolveScan(betweenTerms, null, [], '2026-10-14')).toEqual({ kind: 'no-active-study' });
  });

  it('reports no-active-study when the Entry point itself is missing', () => {
    expect(resolveScan(null, STUDY, [], '2026-10-14')).toEqual({ kind: 'no-active-study' });
  });

  it('resolves a dated permalink to that week inside the Study', () => {
    const meetings = [
      meeting({ date: '2026-10-14', title: 'Alive to God' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-10-07');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[1],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('resolves a dated permalink to the current week without the dated treatment', () => {
    const meetings = [meeting({ date: '2026-10-14', title: 'Alive to God' })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-10-14');

    expect(result).toEqual({ kind: 'meeting', meeting: meetings[0], isFallback: false });
  });

  it('handles a permalink for a week that does not exist by showing the newest week with its date', () => {
    const meetings = [meeting({ date: '2026-10-07', title: 'Peace that holds' })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-09-23');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('reports no-active-study for a permalink naming a Study that does not exist', () => {
    expect(resolveScan(null, null, [], '2026-10-14', '2026-10-07')).toEqual({
      kind: 'no-active-study',
    });
  });
});

describe('parseMeeting', () => {
  // Firestore rejects `undefined` field values: parseMeeting output feeds
  // saveMeeting → setDoc, so absent optional fields must be omitted, not
  // present with undefined (the "Failed to save meeting" setDoc bug).
  it('omits absent optional fields instead of writing undefined (Firestore-safe)', () => {
    const md = [
      '## Plain section',
      '- a point',
      '',
      '## Full section',
      '> The passage text',
      '> Romans 5:1 · WEB',
      '- a [[blank]] point',
      'Question: What does this mean?',
    ].join('\n');
    const sections = parseMeeting(md);
    expect(sections).toHaveLength(2);
    for (const s of sections) {
      expect('ref' in s && s.ref === undefined).toBe(false);
      expect('passage' in s && s.passage === undefined).toBe(false);
      expect('prompt' in s && s.prompt === undefined).toBe(false);
    }
    expect(sections[0]).not.toHaveProperty('passage');
    expect(sections[1]).toHaveProperty('passage');
    expect(sections[1]).toHaveProperty('prompt');
  });
  it('strips the literal "1." prefix from number-list points so the ol marker is the only number', () => {
    // Bullets already lose their "- "; numbers must match, or the reader
    // re-parses "1. …" as its own nested list and the numbers double up.
    const md = '## Steps\n1. First\n2) Second\n3. Third';
    const s = parseMeeting(md)[0];
    const block = s.content.find((b) => b.kind === 'number-list') as { points: { before: string }[] };
    expect(block.points.map((p) => p.before)).toEqual(['First', 'Second', 'Third']);
  });

  it('parses a single-line blockquote as a Passage with no citation (#921)', () => {
    // The Passage button inserts a bare quote; the parser must treat it as
    // a Passage without a reference, not invent one.
    const s = parseMeeting('## Alpha\n> The words stand alone.')[0];
    const passage = s.content.find((b) => b.kind === 'passage') as {
      passage: { before: string };
      ref?: string;
    };
    expect(passage.passage.before).toBe('The words stand alone.');
    expect(passage.ref).toBeUndefined();
    expect(s.ref).toBeUndefined();
  });

  it('parses a Verse line into a Verse block with its reference and text separated (#918)', () => {
    const s = parseMeeting(
      '## Proof text\nVerse: Rom. 5:6 — while we were still weak, at the right time Christ died for the ungodly.',
    )[0];
    const verse = s.content.find((b) => b.kind === 'verse') as {
      ref: string;
      verse: { before: string };
    };
    expect(verse.ref).toBe('Rom. 5:6');
    expect(verse.verse.before).toBe(
      'while we were still weak, at the right time Christ died for the ungodly.',
    );
  });

  it('a line that merely looks like a scripture reference is not reclassified as a Verse (#918)', () => {
    // Shape detection is explicitly rejected: only the Verse prefix makes a
    // Verse, so a leading-reference line stays prose.
    const s = parseMeeting(
      '## Not a verse\nRom. 5:6 — while we were still weak, at the right time Christ died for the ungodly.',
    )[0];
    expect(s.content.some((b) => b.kind === 'verse')).toBe(false);
    expect(s.content[0]).toMatchObject({ kind: 'prose' });
  });

  it('a Verse prefix inside a Section body does not disturb the surrounding blocks (#918)', () => {
    const s = parseMeeting(
      '## Flow\nOpening prose.\n\nVerse: Rom. 5:6 — while we were still weak.\n\nQuestion: What does this mean?',
    )[0];
    expect(s.content.map((b) => b.kind)).toEqual(['prose', 'verse', 'prompt']);
  });

  it('Blanks work inside a Verse (#918)', () => {
    const s = parseMeeting('## Proof\nVerse: Rom. 5:6 — while we were still [[weak]].')[0];
    const verse = s.content.find((b) => b.kind === 'verse') as {
      verse: { before: string; word: string; after: string };
    };
    expect(verse.verse).toEqual({ before: 'while we were still ', word: 'weak', after: '.' });
  });

  it('the Verse prefix is case-insensitive like the Prompt prefixes (#918)', () => {
    const s = parseMeeting('## Proof\nverse: Rom. 5:6 — while we were still weak.')[0];
    expect(s.content[0].kind).toBe('verse');
  });

  it('a Verse line with no text carries just the reference (#918)', () => {
    const s = parseMeeting('## Proof\nVerse: Rom. 5:6')[0];
    const verse = s.content.find((b) => b.kind === 'verse') as { ref: string; verse?: unknown };
    expect(verse.ref).toBe('Rom. 5:6');
    expect(verse.verse).toBeUndefined();
  });

  it('splits the reference from the text on the em dash whatever the spacing (#918)', () => {
    const s = parseMeeting('## Proof\nVerse: Rom. 5:6—while we were still weak.')[0];
    const verse = s.content.find((b) => b.kind === 'verse') as {
      ref: string;
      verse: { before: string };
    };
    expect(verse.ref).toBe('Rom. 5:6');
    expect(verse.verse.before).toBe('while we were still weak.');
  });

  it('parses an Apply line into a Prompt of kind apply, case-insensitively (#919)', () => {
    const s = parseMeeting('## Apply\nApply: Name one thing you will do this week.')[0];
    expect(s.content[0]).toMatchObject({
      kind: 'prompt',
      prompt: { kind: 'apply', text: 'Name one thing you will do this week.' },
    });
    expect(s.prompt?.kind).toBe('apply');

    const lower = parseMeeting('## Apply\napply: a lowercase prefix parses the same.')[0];
    expect(lower.prompt?.kind).toBe('apply');
  });
});

describe('nextMeetingDate', () => {
  it('continues the series a week after the newest existing Meeting', () => {
    const meetings = [
      meeting({ date: '2026-10-14' }),
      meeting({ date: '2026-10-07' }),
    ];

    expect(nextMeetingDate(meetings, '2026-10-13')).toBe('2026-10-21');
  });

  it('skips dates an existing Meeting already occupies', () => {
    const meetings = [
      meeting({ date: '2026-10-14' }),
      meeting({ date: '2026-10-21' }),
    ];

    expect(nextMeetingDate(meetings, '2026-10-13')).toBe('2026-10-28');
  });

  it('starts a new study on the next Wednesday strictly after today', () => {
    expect(nextMeetingDate([], '2026-10-13')).toBe('2026-10-14'); // Tuesday
    expect(nextMeetingDate([], '2026-10-14')).toBe('2026-10-21'); // Wednesday itself
    expect(nextMeetingDate([], '2026-10-17')).toBe('2026-10-21'); // Saturday
  });
});

describe('MEETING_SKELETON_MD', () => {
  it('teaches the three conventions as placeholders', () => {
    expect(MEETING_SKELETON_MD).toMatch(/^## /m); // Section heading
    expect(MEETING_SKELETON_MD).toMatch(/^> /m); // Passage
    expect(MEETING_SKELETON_MD).toMatch(/^(Question|Discuss|Activity): /m); // Prompt
    expect(MEETING_SKELETON_MD).toContain('[[blank]]');
  });

  it('is never seeded from a previous week', () => {
    expect(MEETING_SKELETON_MD).not.toContain('Peace that holds');
  });
});

describe('isMeetingDirty', () => {
  const saved = { title: 'Alive to God', date: '2026-10-14', markdown: '## Alive to God', published: true };

  it('is clean when the form matches what was saved', () => {
    expect(isMeetingDirty(saved, saved)).toBe(false);
  });

  it('is dirty when any field has drifted', () => {
    expect(isMeetingDirty({ ...saved, title: 'Alive to God —' }, saved)).toBe(true);
    expect(isMeetingDirty({ ...saved, date: '2026-10-21' }, saved)).toBe(true);
    expect(isMeetingDirty({ ...saved, markdown: '## Rewritten' }, saved)).toBe(true);
    expect(isMeetingDirty({ ...saved, published: false }, saved)).toBe(true);
  });
});


describe('appendSection (#890 — the editor appends at the end, never at the cursor)', () => {
  it('appends a new heading at the end of the document, regardless of any cursor', () => {
    const md = '## First\n- a point\n\n## Second\n- another';
    const { md: next } = appendSection(md);
    expect(next).toBe(md + '\n\n## ');
  });

  it('reports a caret offset inside the new heading, ready to type its title', () => {
    const md = '## First\n- a point';
    const { caret } = appendSection(md);
    const { md: next } = appendSection(md);
    expect(caret).toBe(next.length);
  });

  it('never inserts at a given cursor — there is no cursor argument to misuse', () => {
    const md = '## First\n- a point';
    const { md: next } = appendSection(md);
    expect(next.startsWith('## First')).toBe(true);
    expect(next).toContain('\n\n## ');
  });

  it('works on an empty document', () => {
    const { md: next, caret } = appendSection('');
    expect(next).toBe('## ');
    expect(caret).toBe(3);
  });
});

describe('sectionOffsets (#890 — the outline navigates the document)', () => {
  it('returns one character offset per heading', () => {
    const md = '## Alpha\n- point\n\n## Beta\n> text';
    expect(sectionOffsets(md)).toEqual([0, '## Alpha\n- point\n\n'.length]);
  });

  it('returns nothing for a headingless document', () => {
    expect(sectionOffsets('Just prose, no headings.')).toEqual([]);
    expect(sectionOffsets('')).toEqual([]);
  });

  it('counts every `#`–`###` heading the parser would start a Section with', () => {
    const md = '# One\nprose\n\n### Three';
    expect(sectionOffsets(md)).toEqual([0, 13]);
  });
});

describe('sectionIndexAtOffset (#890 — the caret is inside a Section)', () => {
  const md = '## Alpha\n- point\n\n## Beta\n- more';

  it('maps an offset onto the Section whose heading most recently passed it', () => {
    expect(sectionIndexAtOffset(md, 0)).toBe(0);
    expect(sectionIndexAtOffset(md, 1)).toBe(0);
    expect(sectionIndexAtOffset(md, '## Alpha\n- point\n\n'.length)).toBe(1);
    expect(sectionIndexAtOffset(md, md.length)).toBe(1);
  });

  it('lands on the untitled leading Section when offset 0 opens with prose before any heading', () => {
    // parseMeeting renders prose before the first heading as an untitled
    // Section — the caret maps there, matching what the outline will list.
    expect(sectionIndexAtOffset('Some prose first.\n\n## Alpha', 0)).toBe(0);
  });
});

describe('blockInsertionPoint (#921 — block inserters land at the end of the caret\'s Section)', () => {
  it('appends to the end of the caret\'s Section, not the document, when the caret is in an early Section', () => {
    const md = '## Alpha\n- point\n\n## Beta\n- more';
    // Caret inside Alpha's body — the insertion belongs at the end of Alpha,
    // before Beta's heading, never at the end of the document.
    const { offset } = blockInsertionPoint(md, 3);
    expect(md.slice(0, offset)).toBe('## Alpha\n- point');
    expect(md.slice(offset)).toContain('## Beta');
  });

  it('falls back to the end of the document when the caret is in no Section', () => {
    const md = 'Just prose, no headings.';
    const { offset } = blockInsertionPoint(md, 2);
    expect(offset).toBe(md.length);
  });

  it('separates the insertion from the preceding content by exactly one blank line', () => {
    const md = '## Alpha\n- point\n\n## Beta\n- more';
    const { offset } = blockInsertionPoint(md, 3);
    // The editor composes `prefix + '\n\n' + block + remainder`; the prefix
    // ends at the trimmed Section end, so exactly one blank line separates
    // the block from what came before.
    expect(md.slice(0, offset).endsWith('\n\n')).toBe(false);
    expect(md.slice(0, offset) + '\n\n> quote' + md.slice(offset)).toBe(
      '## Alpha\n- point\n\n> quote\n\n## Beta\n- more',
    );
  });

  it('normalises a document that ends without a trailing blank line', () => {
    const md = '## Alpha\n- point';
    const { offset } = blockInsertionPoint(md, 3);
    expect(md.slice(0, offset) + '\n\n> quote' + md.slice(offset)).toBe(
      '## Alpha\n- point\n\n> quote',
    );
  });

  it('normalises a document that ends with a run of blank lines', () => {
    const md = '## Alpha\n- point\n\n\n\n';
    const { offset } = blockInsertionPoint(md, 3);
    // The block lands at the trimmed end of the Section's content with
    // exactly one blank line before it; the document's own termination is
    // preserved after it, not destroyed.
    expect(md.slice(0, offset) + '\n\n> quote' + md.slice(offset)).toBe(
      '## Alpha\n- point\n\n> quote\n\n\n\n',
    );
  });

  it('never splits the line the caret is in', () => {
    const md = '## Alpha\n- point\n\n## Beta\n- more';
    // Caret mid-line inside Alpha — the insertion point is the Section's end,
    // not the caret, so the caret's line is untouched.
    const { offset } = blockInsertionPoint(md, 5);
    expect(md.slice(0, offset)).toBe('## Alpha\n- point');
  });

  it('keeps an empty `## ` heading intact — the state right after "+ Add section"', () => {
    // The caret sits after the hashes of a brand-new Section; the insertion
    // must not trim the heading's trailing space, or the heading would be
    // destroyed by the block landing after it.
    const md = '## Alpha\n- point\n\n## ';
    const { offset } = blockInsertionPoint(md, md.length);
    expect(md.slice(0, offset)).toBe('## Alpha\n- point\n\n## ');
    expect(md.slice(0, offset) + '\n\n> quote' + md.slice(offset)).toBe(
      '## Alpha\n- point\n\n## \n\n> quote',
    );
  });

  it('lands at the end of the leading untitled Section when prose opens the document', () => {
    // A document that opens with prose sits in an untitled leading Section
    // (sectionIndexAtOffset's own contract) — the block belongs at the end
    // of THAT Section, before the first heading, never at the document end
    // where it would file under the last Section.
    const md = 'Intro prose\n\n## Alpha\n- point';
    const { offset } = blockInsertionPoint(md, 2);
    expect(md.slice(0, offset)).toBe('Intro prose');
    expect(md.slice(offset)).toContain('## Alpha');
  });
});

describe('previewScale (#916 — the phone is CSS-scaled into the pane)', () => {
  it('takes the smaller of the width and height ratios so the phone is always whole', () => {
    // A pane narrower than the phone: width binds.
    expect(previewScale(300, 844)).toBeCloseTo(300 / 390, 6);
    // A pane shorter than the phone: height binds.
    expect(previewScale(390, 500)).toBeCloseTo(500 / 844, 6);
    // A pane that fits both ways: the tighter ratio binds.
    expect(previewScale(300, 1000)).toBeCloseTo(300 / 390, 6);
  });

  it('never scales below the legibility floor', () => {
    expect(previewScale(100, 100)).toBe(0.5);
    expect(previewScale(0, 0)).toBe(0.5);
  });

  it('never scales above 1 — the phone is never blown up past true size', () => {
    expect(previewScale(2000, 2000)).toBe(1);
  });
});

describe('starting a study (issue #822)', () => {
  const VALID: StudySetupForm = {
    studyTitle: 'Romans',
    term: 'Fall 2026',
    entryPointName: 'Wednesday Bible Study',
    slug: 'cisa-wednesday',
  };

  it('derives a readable, deterministic Study id from the title and term', () => {
    expect(studyIdFor('Romans', 'Fall 2026')).toBe('romans-fall-2026');
    expect(studyIdFor('Romans', 'Fall 2026')).toBe(studyIdFor('  Romans ', 'Fall 2026'));
    // Punctuation a document id cannot carry is dropped, not encoded.
    expect(studyIdFor('1 & 2 Peter', 'Spring 2027')).toBe('1-2-peter-spring-2027');
    expect(studyIdFor('Romans', 'Fall 2026')).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('offers a slug that follows the entry point name', () => {
    expect(slugFor('Wednesday Bible Study')).toBe('wednesday-bible-study');
    expect(slugFor('CISA Wednesday!')).toBe('cisa-wednesday');
  });

  it('accepts a filled-in form', () => {
    expect(validateStudySetup(VALID)).toEqual([]);
  });

  it('names every empty field rather than only the first', () => {
    const errors = validateStudySetup({ studyTitle: '', term: '', entryPointName: '', slug: '' });
    expect(errors.map((e) => e.field)).toEqual(['studyTitle', 'term', 'entryPointName', 'slug']);
  });

  it('rejects a slug that could not live in a document id or a URL', () => {
    const errors = validateStudySetup({ ...VALID, slug: 'cisa wednesday/2026' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('slug');
  });

  it('rejects fields past the limits the rules enforce', () => {
    const errors = validateStudySetup({
      ...VALID,
      studyTitle: 'R'.repeat(201),
      term: 'F'.repeat(65),
    });
    expect(errors.map((e) => e.field).sort()).toEqual(['studyTitle', 'term']);
  });

  it('rejects a title and term that slugify to nothing', () => {
    const errors = validateStudySetup({ ...VALID, studyTitle: '???', term: '!!!' });
    expect(errors.map((e) => e.field)).toContain('studyTitle');
  });
});
