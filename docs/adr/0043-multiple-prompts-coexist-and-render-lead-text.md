# 0043: Multiple prompts coexist simultaneously and prompts render lead text with points

## Status
Accepted

## Context
Under ADR 0013 ("Bible study Meetings render rich markdown and read as written") and the governing principle ("The author decides, the page obeys"), authors compose Bible study sections using markdown blocks including prompts (`Question:`, `Discuss:`, `Activity:`, `Apply:`).

Two limitations existed in the shipped implementation:
1. When multiple prompt lines were written in the same section, the parser followed a legacy rule where an earlier prompt block dissolved into unstyled `prose`, meaning only the last prompt in a section retained styled prompt card formatting.
2. When a prompt line included both introductory text on the prompt line and indented bullet points underneath (e.g., `Activity: Read the story... \n - Question 1 \n - Question 2`), `SectionBody` evaluated points conditionally (`block.prompt.points ? <ul> : <p>{block.prompt.text}</p>`), dropping the introductory instruction text from rendering.

## Decision

1. **Multiple Prompts Coexist as Prompt Blocks**:
   Remove the "earlier prompt dissolves into prose" parsing rule in both parser mirrors (`src/lib/bibleStudy.ts` and `packages/core/src/bibleStudy.ts`). Every authored prompt (`Question:`, `Discuss:`, `Activity:`, `Apply:`) is preserved as a first-class `PromptBlock` (`kind: 'prompt'`) in `section.content` in authored order. The legacy `section.prompt` summary field continues to reflect the last prompt for backward compatibility with external consumers.

2. **Prompt Lead Text Renders Alongside Points**:
   In `SectionBody`, if `block.prompt.text` is present, it renders as the lead paragraph inside the prompt card, followed by the unordered list of bullet points if `block.prompt.points` is present.

## Consequences
- Authors can place multiple prompts in the same Section (e.g. `Discuss:` followed by `Activity:`) without earlier prompts losing their styled background tint, dot, and uppercase kind label.
- Prompts with introductory instructions and indented question points display both the instruction and the sub-points inside the prompt card.
- Parity is strictly preserved across web and core packages under ADR 0013's keep-in-step rule.
