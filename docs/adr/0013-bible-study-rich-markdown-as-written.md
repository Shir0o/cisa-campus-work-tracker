# 0013: Bible study Meetings render rich markdown and read as written

## Status
Accepted

## Context
The Bible study design (`docs/design/bible-study/README.md`) settled two things the shipped parser never delivered: the Structure row — "outline points, Passage, Prompt — all optional, order as written" — and the governing principle, "the author decides, the page obeys." The glossary's Section entry says the same. The shipped `parseMeeting` (`src/lib/bibleStudy.ts:103`, mirrored in `packages/core/src/bibleStudy.ts` under the "keep in step" rule) instead renders every Section points → passage → prompt in fixed order, flattens bullets, and silently drops every line outside its dialect — a plain paragraph, a numbered list, an indented sub-point all vanish between editor and reader, and inline emphasis renders as literal asterisks.

The trigger for revisiting: Full-timers bring existing studies in from the Google Site / Google Docs — plain text with sparse bold, italics, and underline — and this is an ongoing workflow, not a one-time migration. Pasting into the editor's textarea strips formatting to plain text; the parser then drops the prose. The reader at `/s/:slug` serves any published Meeting to anonymous visitors, so no rendering path may pass raw HTML through.

## Decision

1. **A Section reads as written — the code is brought back in line with the settled Structure row, not a new direction.** A Section is an ordered flow: `#`–`###` headings start Sections, `>` blockquotes are Passages (last blockquote line = citation), `Question:`/`Discuss:`/`Activity:` lines are Prompts, `[[word]]` are Blanks, and everything else renders as body content in author order. No canonical reordering of points, passage, and prompt.

2. **Markdown scope for v1: inline bold, italic, links, and nested lists.** Underline is not carried — on the web underline is the link affordance, and markdown has no underline syntax that does not collide with bold. Tables and images are out of scope until a real document needs them; images would additionally require the Storage upload story, which does not exist.

3. **The rendering engine is the one coordination notes already ship.** ReactMarkdown + remark-gfm with a component map (the `READONLY_MD` precedent, `src/views/CoordinationNotes.tsx:476`), shared by `PublicStudyReader` and the editor's live preview so the preview cannot lie. Without rehype-raw, react-markdown escapes raw HTML by default — that default is the sanitization posture for the public reader. Dialect constructs are extracted before markdown runs; `[[…]]` is reserved: a Blank's contents are plain text, never markdown, and a Blank wins its run — emphasis markers around it are not styled.

4. **Authoring stays manual paste.** Authors paste plain text from Google Docs and apply emphasis with editor toolbar inserters — bold/italic buttons join Section, Passage, Blank, Question, Discuss, Activity. Google Docs headings map to Section headings by author convention. A clipboard-HTML→markdown paste handler was considered and deferred: the formatting is sparse enough that manual application is acceptable, and `turndown` is already in the dependency tree when it is revisited.

5. **The grammar change lands in both mirrors** — `src/lib/bibleStudy.ts` and `packages/core/src/bibleStudy.ts` — and the stored `md` remains the source of truth; `sections` is derived and re-derived under the new grammar.

## Consequences
- `Section`'s shape changes from a flat `points` list to an ordered body; the reader, the editor preview, and Blank keying follow. Existing published Meetings must re-parse and render without reordering — regression coverage in both mirrors' suites.
- The silent drop dies: pasted prose survives to the reader.
- Nested lists deliver most of the deferred outline-style want (I / A / 1 nesting) with no grammar work.
- The preview and the reader must stay one rendering path — once they diverge, the preview lies.
- Implementation is handed to the agent working the ordering change; this record is the spec they build against.
