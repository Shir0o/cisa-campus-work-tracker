import { describe, it, expect } from 'vitest';
import {
  parseMeeting,
  resolveScan,
  readerReducer,
  slugFor,
  studyIdFor,
  validateStudySetup,
  appendSection,
  sectionOffsets,
  sectionIndexAtOffset,
  blockInsertionPoint,
  type StudySetupForm,
  type Blank,
  type Meeting,
  type ReaderState,
  type Study,
  type EntryPoint,
} from "../src/bibleStudy";
describe('bibleStudy core module', () => {
  describe('parseMeeting', () => {
    it('parses a section with heading, points with blanks, passage, and prompt in ordinary order', () => {
      const md = `## Where peace starts
- Peace with God is a [[standing]], not a mood.
- The access we have was [[given]], never earned.
- What we stand in now is what we will stand in at the end.

> Being therefore justified by faith, we have peace with God through our Lord Jesus Christ; through whom we also have our access by faith into this grace in which we stand.
> Romans 5:1–2 · WEB

Discuss: Where do you catch yourself treating peace with God as a feeling that comes and goes?`;

      const sections = parseMeeting(md);
      expect(sections).toHaveLength(1);
      const s = sections[0];
      expect(s.title).toBe('Where peace starts');
      expect(s.ref).toBe('Romans 5:1–2 · WEB');
      expect(s.points).toHaveLength(3);
      expect(s.points[0]).toEqual({
        before: 'Peace with God is a ',
        word: 'standing',
        after: ', not a mood.',
      });
      expect(s.points[1]).toEqual({
        before: 'The access we have was ',
        word: 'given',
        after: ', never earned.',
      });
      expect(s.points[2]).toEqual({
        before: 'What we stand in now is what we will stand in at the end.',
      });
      expect(s.passage).toEqual({
        before:
          'Being therefore justified by faith, we have peace with God through our Lord Jesus Christ; through whom we also have our access by faith into this grace in which we stand.',
      });
      expect(s.prompt).toEqual({
        kind: 'discuss',
        text: 'Where do you catch yourself treating peace with God as a feeling that comes and goes?',
      });
    });

    it('parses blanks inside a passage', () => {
      const md = `## What suffering is doing
> We also rejoice in our sufferings, knowing that suffering produces perseverance; and perseverance, proven character; and proven character, [[hope]].
> Romans 5:3–4 · WEB`;

      const sections = parseMeeting(md);
      expect(sections).toHaveLength(1);
      expect(sections[0].passage).toEqual({
        before:
          'We also rejoice in our sufferings, knowing that suffering produces perseverance; and perseverance, proven character; and proven character, ',
        word: 'hope',
        after: '.',
      });
    });

    it('lenient parsing: handles section with no passage, two passages, prompt before passage, and heading only without throwing', () => {
      const md = `## Only Heading

## No Passage
- Point without passage
Question: What do you see?

## Prompt Before Passage
Activity: Stand up and pair off
> In the beginning was the Word
> John 1:1

## Two Passages
> First passage
> Genesis 1:1
> Second passage
> Genesis 1:2`;

      expect(() => parseMeeting(md)).not.toThrow();
      const sections = parseMeeting(md);
      expect(sections).toHaveLength(4);
      expect(sections[0].title).toBe('Only Heading');
      expect(sections[0].points).toEqual([]);
      expect(sections[0].passage).toBeUndefined();
      expect(sections[0].prompt).toBeUndefined();

      expect(sections[1].title).toBe('No Passage');
      expect(sections[1].passage).toBeUndefined();
      expect(sections[1].prompt?.kind).toBe('question');

      expect(sections[2].title).toBe('Prompt Before Passage');
      expect(sections[2].prompt?.kind).toBe('activity');
      expect(sections[2].passage).toBeDefined();

      expect(sections[3].title).toBe('Two Passages');
      expect(sections[3].passage).toBeDefined();
    });

    it('recognises each Prompt kind (question, discuss, activity) and unmarked lines are not Prompts', () => {
      const md = `## Prompt Kinds
Question: Why did he say that?
Discuss: Open this up together.
Activity: Turn to your neighbor.
An ordinary line of text that is not a prompt.`;

      const sections = parseMeeting(md);
      expect(sections).toHaveLength(1);
      expect(sections[0].prompt).toBeDefined();
      expect(['question', 'discuss', 'activity']).toContain(sections[0].prompt?.kind);
    });

    it('handles a meeting with no Blanks at all', () => {
      const md = `## Plain Section
- Plain point 1
- Plain point 2
> Plain passage text without blanks
> Romans 1:1`;

      const sections = parseMeeting(md);
      expect(sections).toHaveLength(1);
      expect(sections[0].points.every((p) => !('word' in p))).toBe(true);
      expect(sections[0].passage && !('word' in sections[0].passage)).toBe(true);
    });

    it('generates stable section ids across re-parses of unchanged content', () => {
      const md = `## Where peace starts\n- Point A\n## What suffering is doing\n- Point B`;
      const run1 = parseMeeting(md);
      const run2 = parseMeeting(md);
      expect(run1[0].id).toBe(run2[0].id);
      expect(run1[1].id).toBe(run2[1].id);
      expect(run1[0].id).not.toBe(run1[1].id);
    });

    it('heading becomes both the title and the index label', () => {
      const md = `## Where peace starts\n- Point`;
      const sections = parseMeeting(md);
      expect(sections[0].title).toBe('Where peace starts');
    });
    // ── Rich markdown, read as written (ADR 0012) ──

    it('renders content in author order, not points-then-passage-then-prompt (the Section order contract)', () => {
      const md = `## Mixed flow
Opening prose paragraph.

- A bullet in the middle

> Thus says the Lord
> Isaiah 1:1

More prose after the passage.

Question: What did we just read?`;
      const s = parseMeeting(md)[0];
      expect(s.content.map((b) => b.kind)).toEqual([
        'prose', 'bullet-list', 'passage', 'prose', 'prompt',
      ]);
    });

    it('plain paragraphs survive (the silent drop dies)', () => {
      const md = `## With prose
This paragraph is not a bullet, a blockquote, or a prompt.

- Only this bullet survived the old parser.`;
      const s = parseMeeting(md)[0];
      const prose = s.content.filter((b) => b.kind === 'prose');
      expect(prose).toHaveLength(1);
      expect(prose[0]).toMatchObject({ kind: 'prose', md: 'This paragraph is not a bullet, a blockquote, or a prompt.' });
    });

    it('indented sub-points nest under their parent point instead of flattening (ADR 0013 nested lists)', () => {
      const md = `## Ordered and nested
1. First step
2. Second step

- Main point
  - Sub point A
  - Sub point B`;
      const s = parseMeeting(md)[0];
      expect(s.content.map((b) => b.kind)).toEqual(['number-list', 'bullet-list']);
      // One top-level point with two nested sub-points — not three siblings.
      expect(s.content[0]).toMatchObject({ kind: 'number-list' });
      if (s.content[0].kind !== 'number-list') throw new Error('expected number-list');
      expect(s.content[0].points).toHaveLength(2);
      expect(s.content[1].kind).toBe('bullet-list');
      if (s.content[1].kind !== 'bullet-list') throw new Error('expected bullet-list');
      expect(s.content[1].points).toEqual([
        { before: 'Main point', children: [{ before: 'Sub point A' }, { before: 'Sub point B' }] },
      ]);
    });

    it('deeper indentation nests further, and mixed bullet/number nesting follows the same depth rule', () => {
      const md = `## Outline
1. Roman numeral point
   - Lettered sub with a [[blank]]
     1. Deepest numbered level`;
      const s = parseMeeting(md)[0];
      expect(s.content).toHaveLength(1);
      expect(s.content[0].kind).toBe('number-list');
      if (s.content[0].kind !== 'number-list') throw new Error('expected number-list');
      expect(s.content[0].points).toEqual([
        {
          before: 'Roman numeral point',
          children: [
            {
              before: 'Lettered sub with a ',
              word: 'blank',
              after: '',
              children: [{ before: 'Deepest numbered level' }],
            },
          ],
        },
      ]);
    });

    it('an indented numbered line nests under an open bullet parent (mixed nesting, reverse direction)', () => {
      const md = `## Mixed direction
- Bullet parent
  1. Numbered sub`;
      const s = parseMeeting(md)[0];
      expect(s.content[0].kind).toBe('bullet-list');
      if (s.content[0].kind !== 'bullet-list') throw new Error('expected bullet-list');
      expect(s.content[0].points).toEqual([
        { before: 'Bullet parent', children: [{ before: 'Numbered sub' }] },
      ]);
    });

    it('list text is trimmed of trailing whitespace exactly as the legacy parser did', () => {
      const md = '## Trailing\n- Main point  \n- Second point\t';
      const s = parseMeeting(md)[0];
      expect(s.content[0].kind).toBe('bullet-list');
      if (s.content[0].kind !== 'bullet-list') throw new Error('expected bullet-list');
      expect(s.content[0].points).toEqual([{ before: 'Main point' }, { before: 'Second point' }]);
    });

    it('flat legacy documents (no indentation) parse exactly as before', () => {
      const md = `## Legacy week
- Main point
- Second point`;
      const s = parseMeeting(md)[0];
      expect(s.content[0].kind).toBe('bullet-list');
      if (s.content[0].kind !== 'bullet-list') throw new Error('expected bullet-list');
      expect(s.content[0].points).toEqual([{ before: 'Main point' }, { before: 'Second point' }]);
    });

    it('inline emphasis and links stay in the markdown for the renderer, not parsed away', () => {
      const md = `## Emphasis kept
This is **bold** and this is *italic* and this is a [link](https://example.com).`;
      const s = parseMeeting(md)[0];
      expect(s.content[0]).toMatchObject({ kind: 'prose', md: 'This is **bold** and this is *italic* and this is a [link](https://example.com).' });
    });

    it('keeps legacy dialect documents parsing to the same constructs (backward compatibility)', () => {
      const md = `## Legacy week
- Peace with God is a [[standing]], not a mood.
- Plain point

> Being therefore justified by faith, we have peace with God.
> Romans 5:1 · WEB

Discuss: Where does peace catch you out?`;
      const s = parseMeeting(md)[0];
      expect(s.content.map((b) => b.kind)).toEqual(['bullet-list', 'passage', 'prompt']);
      const bullets = s.content[0] as { kind: string; points: (Blank | Text)[] };
      expect(bullets.points[0]).toEqual({ before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' });
      expect(bullets.points[1]).toEqual({ before: 'Plain point' });
    });

    it('Blanks win their run: a blank inside prose is extracted, not left for the markdown renderer', () => {
      const md = `## Blank in prose
Grace is [[free]], and that changes everything.`;
      const s = parseMeeting(md)[0];
      expect(s.content[0]).toMatchObject({ kind: 'prose', md: 'Grace is [[free]], and that changes everything.' });
      expect(s.content).toHaveLength(1); // one prose block whose md carries the blank marker
    });

    it('a Blank is recognized mid-markdown but the surrounding emphasis is left to the renderer', () => {
      const md = `## Blank among emphasis
Grace is **[[free]] indeed**, and that changes everything.`;
      const s = parseMeeting(md)[0];
      expect(s.content[0]).toMatchObject({ kind: 'prose' });
      expect((s.content[0] as { md: string }).md).toContain('**[[free]] indeed**');
    });

    it('multiple prompts: the last one wins (legacy behavior kept)', () => {
      const md = `## Two prompts
Question: First?

Discuss: Second wins.`;
      const s = parseMeeting(md)[0];
      expect(s.content).toHaveLength(2);
      expect(s.content[0]).toMatchObject({ kind: 'prose', md: 'question: First?' });
      expect(s.content[1]).toMatchObject({ kind: 'prompt', prompt: { kind: 'discuss', text: 'Second wins.' } });
    });

    it('a prompt between passages still yields two passage blocks around it (order preserved)', () => {
      const md = `## Passage sandwich
> First passage
> Genesis 1:1

Question: What did you hear?

> Second passage
> Genesis 2:1`;
      const s = parseMeeting(md)[0];
      expect(s.content.map((b) => b.kind)).toEqual(['passage', 'prompt', 'passage']);
    });

    it('section id derivation is unchanged for legacy titles', () => {
      const md = `## Where peace starts\n- Point`;
      expect(parseMeeting(md)[0].id).toBe('where-peace-starts');
    });
  });

  describe('blockInsertionPoint (#921 — block inserters land at the end of the caret\'s Section)', () => {
    it('appends to the end of the caret\'s Section, not the document, when the caret is in an early Section', () => {
      const md = '## Alpha\n- point\n\n## Beta\n- more';
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

    it('never splits the line the caret is in', () => {
      const md = '## Alpha\n- point\n\n## Beta\n- more';
      const { offset } = blockInsertionPoint(md, 5);
      expect(md.slice(0, offset)).toBe('## Alpha\n- point');
    });
  });

  describe("resolveScan", () => {
    const STUDY: Study = { id: "romans-fall26", title: "Romans", term: "Fall 2026" };
    const ENTRY_POINT: EntryPoint = {
      id: "cisa-wednesday",
      slug: "cisa-wednesday",
      name: "Wednesday Bible Study",
      activeStudyId: "romans-fall26",
    };
    const meetings: Meeting[] = [
      {
        id: "m1",
        studyId: "romans",
        date: "2026-09-01",
        title: "Week 1",
        sections: [],
        published: true,
      },
      {
        id: "m2",
        studyId: "romans",
        date: "2026-09-08",
        title: "Week 2",
        sections: [],
        published: true,
      },
      {
        id: "m3_draft",
        studyId: "romans",
        date: "2026-09-15",
        title: "Week 3 Draft",
        sections: [],
        published: false,
      },
    ];

    it("newest published Meeting wins for a scan", () => {
      const result = resolveScan(ENTRY_POINT, STUDY, meetings, "2026-09-10");
      expect(result).toEqual({ kind: "meeting", meeting: meetings[1], isFallback: false });
    });

    it("a draft is never resolved to, even when it is newest", () => {
      const result = resolveScan(ENTRY_POINT, STUDY, meetings, "2026-09-20");
      expect(result.kind).toBe("meeting");
      if (result.kind === "meeting") {
        expect(result.meeting.id).toBe("m2");
        expect(result.meeting.published).toBe(true);
        expect(result.isFallback).toBe(true);
        expect(result.fallbackDate).toBe("2026-09-08");
      }
    });

    it("a dated permalink to the newest Meeting is current; to an older one, it is dated", () => {
      const newestPermalink = resolveScan(ENTRY_POINT, STUDY, meetings, "2026-09-10", "2026-09-08");
      expect(newestPermalink).toEqual({ kind: "meeting", meeting: meetings[1], isFallback: false });

      const olderPermalink = resolveScan(ENTRY_POINT, STUDY, meetings, "2026-09-10", "2026-09-01");
      expect(olderPermalink).toEqual({
        kind: "meeting",
        meeting: meetings[0],
        isFallback: true,
        fallbackDate: "2026-09-01",
      });
    });

    it("a Study with no published Meetings resolves to never-published", () => {
      expect(resolveScan(ENTRY_POINT, STUDY, [], "2026-09-10")).toEqual({
        kind: "never-published",
      });

      const draftsOnly: Meeting[] = [
        {
          id: "d1",
          studyId: "romans",
          date: "2026-09-01",
          title: "Draft",
          sections: [],
          published: false,
        },
      ];
      expect(resolveScan(ENTRY_POINT, STUDY, draftsOnly, "2026-09-10")).toEqual({
        kind: "never-published",
      });
    });
  });

  describe('readerReducer', () => {
    const initialState: ReaderState = {
      sectionIndex: 0,
      totalSections: 4,
      openBlanks: {},
      navOpen: false,
    };

    // #890: the scroll position owns "which Section am I on". advance and
    // back were deleted with tap-to-advance; jump survives as the action the
    // Section index dispatches. Their absence is asserted through the
    // reducer's behavior — an unknown action returns the state unchanged.
    it('unknown actions return the state unchanged (advance and back are gone)', () => {
      const state = readerReducer(
        initialState,
        { type: 'advance' } as unknown as Parameters<typeof readerReducer>[1],
      );
      expect(state).toBe(initialState);
      const back = readerReducer(
        initialState,
        { type: 'back' } as unknown as Parameters<typeof readerReducer>[1],
      );
      expect(back).toBe(initialState);
    });

    it('jump closes the index; the editor scrollIntoViews to its Section', () => {
      let state = { ...initialState, navOpen: true, sectionIndex: 0 };
      state = readerReducer(state, { type: 'jump', index: 2 });
      expect(state.sectionIndex).toBe(2);
      expect(state.navOpen).toBe(false);
    });

    it('revealing a Blank toggles only its own key', () => {
      let state = { ...initialState };
      state = readerReducer(state, { type: 'revealBlank', key: '0:p0' });
      expect(state.openBlanks['0:p0']).toBe(true);
      expect(state.openBlanks['0:p1']).toBeUndefined();

      state = readerReducer(state, { type: 'revealBlank', key: '0:p0' });
      expect(state.openBlanks['0:p0']).toBe(false);
    });

    it('Blanks with the same word in different Sections do not co-reveal (regression test for keying decision)', () => {
      let state = { ...initialState };
      state = readerReducer(state, { type: 'revealBlank', key: '0:p0' });
      expect(state.openBlanks['0:p0']).toBe(true);
      expect(state.openBlanks['1:p0']).toBeUndefined();
    });

    it('openIndex and closeIndex toggle navigation index', () => {
      let state = readerReducer(initialState, { type: 'openIndex' });
      expect(state.navOpen).toBe(true);
      state = readerReducer(state, { type: 'closeIndex' });
      expect(state.navOpen).toBe(false);
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
});
