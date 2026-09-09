// Mirror parity corpus (ADR 0013): the web parser (src/lib/bibleStudy.ts) and
// the @cisa/core parser (packages/core/src/bibleStudy.ts) must stay in step —
// the same Meeting markdown must parse to the same Sections on both sides, or
// a week a Full-timer edits renders differently for whoever reads it. The two
// parsers cannot import each other (the web app deliberately has no @cisa/core
// dependency; see the keep-in-step comment atop both files), so the corpus
// below is the shared contract: every fixture is asserted against BOTH
// modules' output, and the two outputs must be deep-equal.
import { describe, it, expect } from 'vitest';
import {
  parseMeeting as parseWeb,
  appendSection as appendWeb,
  sectionOffsets as offsetsWeb,
  sectionIndexAtOffset as indexAtWeb,
  blockInsertionPoint as insertionPointWeb,
} from '../lib/bibleStudy';
// Direct relative import into the workspace package — resolved for tests only.
import {
  parseMeeting as parseCore,
  appendSection as appendCore,
  sectionOffsets as offsetsCore,
  sectionIndexAtOffset as indexAtCore,
  blockInsertionPoint as insertionPointCore,
} from '../../packages/core/src/bibleStudy';

const CORPUS: string[] = [
  // Legacy dialect documents (the pre-0013 grammar, still the common case).
  `## Where peace starts
- Peace with God is a [[standing]], not a mood.
- The access we have was [[given]], never earned.
- What we stand in now is what we will stand in at the end.

> Being therefore justified by faith, we have peace with God through our Lord Jesus Christ.
> Romans 5:1–2 · WEB

Discuss: Where do you catch yourself treating peace with God as a feeling?`,

  // Blanks inside a passage.
  `## What suffering is doing
> We also rejoice in our sufferings, knowing that suffering produces perseverance; and perseverance, proven character; and proven character, [[hope]].
> Romans 5:3–4 · WEB`,

  // Lenient shapes: no passage, two passages, prompt before passage, heading only.
  `## Only Heading

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
> Genesis 1:2`,

  // Rich markdown, read as written (the ADR 0013 grammar).
  `## Mixed flow
Opening prose paragraph.

- A bullet in the middle

> Thus says the Lord
> Isaiah 1:1

More prose after the passage.

Question: What did we just read?`,

  // Nested lists: indented sub-points nest under their parent (ADR 0013
  // §Decision 2), mixed bullet/number depth included.
  `## Ordered and nested
1. First step
2. Second step

- Main point
  - Sub point A
    - Sub-sub point
  - Sub point B
  1. Numbered sub under bullet`,

  // Inline emphasis stays in the markdown for the renderer.
  `## Emphasis kept
This is **bold** and this is *italic* and this is a [link](https://example.com).`,

  // A blank inside prose; emphasis around a blank.
  `## Blanks in prose
Grace is [[free]], and that changes everything.

Grace is **[[free]] indeed**, and that changes everything.`,

  // Multiple prompts — the last wins; earlier dissolves into prose.
  `## Two prompts
Question: First?

Discuss: Second wins.`,

  // A prompt between two passages — order preserved.
  `## Passage sandwich
> First passage
> Genesis 1:1

Question: What did you hear?

> Second passage
> Genesis 2:1`,

  // Verses (#918): the reference leads, the words follow at body size, in
  // the flow — a distinct block from a Passage. A leading-reference line
  // without the prefix stays prose (shape detection is rejected).
  `## Proof texts
Verse: Rom. 5:6 — while we were still weak, at the right time Christ died for the ungodly.

Rom. 5:8 — God shows his love for us in that while we were still sinners, Christ died for us.

Verse: Rom. 5:5 — and hope does not put us to shame.`,

  // A Verse with a Blank, and a Verse with no text after the reference.
  `## Verse blanks
Verse: Rom. 5:6 — while we were still [[weak]].

Verse: Rom. 5:5`,
];

describe('parser mirror parity (ADR 0013 keep-in-step)', () => {
  it('every corpus fixture parses identically in the web and core mirrors', () => {
    for (const md of CORPUS) {
      const web = parseWeb(md);
      const core = parseCore(md);
      expect(web).toEqual(core);
    }
  });

  it('appendSection agrees across the mirrors for every corpus fixture (#890)', () => {
    for (const md of CORPUS) {
      expect(appendWeb(md)).toEqual(appendCore(md));
    }
  });

  it('sectionOffsets and sectionIndexAtOffset agree across the mirrors (#890)', () => {
    for (const md of CORPUS) {
      expect(offsetsWeb(md)).toEqual(offsetsCore(md));
      // Every boundary offset maps identically: 0, each heading offset, and
      // the offsets just past the document's end.
      const probes = [0, ...offsetsWeb(md).map((o) => o + 1), md.length, md.length + 10];
      for (const at of probes) {
        expect(indexAtWeb(md, at)).toEqual(indexAtCore(md, at));
      }
    }
  });

  it('blockInsertionPoint agrees across the mirrors for every corpus fixture (#921)', () => {
    for (const md of CORPUS) {
      // Probe the same offsets the editor can hand it: the caret's own
      // position, each Section boundary, and the document's end.
      const probes = [0, ...offsetsWeb(md).map((o) => o + 1), md.length];
      for (const at of probes) {
        expect(insertionPointWeb(md, at)).toEqual(insertionPointCore(md, at));
      }
    }
  });

  it('the corpus covers both grammars: legacy dialect and rich markdown', () => {
    // Guard against the corpus silently shrinking to one grammar.
    const kinds = new Set(
      CORPUS.flatMap((md) => parseWeb(md).flatMap((s) => s.content.map((b) => b.kind))),
    );
    expect(kinds.has('prose')).toBe(true);
    expect(kinds.has('bullet-list')).toBe(true);
    expect(kinds.has('number-list')).toBe(true);
    expect(kinds.has('passage')).toBe(true);
    expect(kinds.has('verse')).toBe(true);
    expect(kinds.has('prompt')).toBe(true);
  });
});