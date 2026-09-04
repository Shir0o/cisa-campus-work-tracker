import { describe, it, expect } from 'vitest';
import {
  parseMeeting,
  currentMeeting,
  readerReducer,
  type Meeting,
  type ReaderState,
} from '../src/bibleStudy';

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
  });

  describe('currentMeeting', () => {
    const meetings: Meeting[] = [
      {
        id: 'm1',
        studyId: 'romans',
        date: '2026-09-01',
        title: 'Week 1',
        sections: [],
        published: true,
      },
      {
        id: 'm2',
        studyId: 'romans',
        date: '2026-09-08',
        title: 'Week 2',
        sections: [],
        published: true,
      },
      {
        id: 'm3_draft',
        studyId: 'romans',
        date: '2026-09-15',
        title: 'Week 3 Draft',
        sections: [],
        published: false,
      },
    ];

    it('newest published Meeting wins for a bare Study URL', () => {
      const result = currentMeeting(meetings, '2026-09-10');
      expect(result?.meeting.id).toBe('m2');
      expect(result?.isStale).toBe(false);
    });

    it('a draft is never resolved to, even when it is newest', () => {
      const result = currentMeeting(meetings, '2026-09-20');
      expect(result?.meeting.id).toBe('m2');
      expect(result?.meeting.published).toBe(true);
    });

    it('a dated permalink to the newest Meeting is not stale; to an older one, it is', () => {
      const newestPermalink = currentMeeting(meetings, '2026-09-10', '2026-09-08');
      expect(newestPermalink?.meeting.id).toBe('m2');
      expect(newestPermalink?.isStale).toBe(false);

      const olderPermalink = currentMeeting(meetings, '2026-09-10', '2026-09-01');
      expect(olderPermalink?.meeting.id).toBe('m1');
      expect(olderPermalink?.isStale).toBe(true);
    });

    it('a Study with no published Meetings resolves to null without crashing', () => {
      const emptyResult = currentMeeting([], '2026-09-10');
      expect(emptyResult).toBeNull();

      const draftsOnly: Meeting[] = [
        {
          id: 'd1',
          studyId: 'romans',
          date: '2026-09-01',
          title: 'Draft',
          sections: [],
          published: false,
        },
      ];
      expect(currentMeeting(draftsOnly, '2026-09-10')).toBeNull();
    });
  });

  describe('readerReducer', () => {
    const initialState: ReaderState = {
      sectionIndex: 0,
      totalSections: 4,
      openBlanks: {},
      navOpen: false,
      unadorned: false,
    };

    it('advance clamps at the last Section', () => {
      let state = { ...initialState, sectionIndex: 2 };
      state = readerReducer(state, { type: 'advance' });
      expect(state.sectionIndex).toBe(3);
      state = readerReducer(state, { type: 'advance' });
      expect(state.sectionIndex).toBe(3);
    });

    it('back clamps at the first Section', () => {
      let state = { ...initialState, sectionIndex: 1 };
      state = readerReducer(state, { type: 'back' });
      expect(state.sectionIndex).toBe(0);
      state = readerReducer(state, { type: 'back' });
      expect(state.sectionIndex).toBe(0);
    });

    it('jump moves and closes the index in one action', () => {
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

    it('distraction-free toggles without disturbing position or revealed Blanks', () => {
      let state = {
        ...initialState,
        sectionIndex: 2,
        openBlanks: { '1:p0': true } as Record<string, boolean>,
        unadorned: false,
      };
      state = readerReducer(state, { type: 'toggleUnadorned' });
      expect(state.unadorned).toBe(true);
      expect(state.sectionIndex).toBe(2);
      expect(state.openBlanks['1:p0']).toBe(true);
    });

    it('openIndex and closeIndex toggle navigation index', () => {
      let state = readerReducer(initialState, { type: 'openIndex' });
      expect(state.navOpen).toBe(true);
      state = readerReducer(state, { type: 'closeIndex' });
      expect(state.navOpen).toBe(false);
    });
  });
});
