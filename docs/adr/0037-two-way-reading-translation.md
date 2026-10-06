# 0037. Two-way English ↔ Spanish reading translation

Date: 2026-10-06

## Status

Accepted. Supersedes ADR 0027.

## Context

ADR 0027 made reading translation English-canonical: English-authored content was translated for Spanish-mode readers, but Spanish-authored content was never translated for English-mode readers. As more content is written in Spanish, English-mode readers can't read it (#1407).

## Decision

Reading translation runs in both directions. Content is shown in the reader's app language, English or Spanish.

- **Judged at read time, not tagged at write time.** Content keeps no language tag. The text guesser decides only one thing: whether the text is *confidently already in the reader's language*. If it is, the text is shown as-is with no Gemini call. Otherwise the text is translated whole into the reader's language, and Gemini returns it unchanged if it's already there. Mixed-language content gets translated whole.
- **No-signal text is asymmetric on purpose.** Text with no language signal (names, "ok 👍", short phrases) is shown as written to English-mode readers, because nearly all content is English and this is where most of the new cost would come from. Spanish-mode readers keep the old behavior and have it translated.
- **Same surfaces, same UI.** Every surface that translates English to Spanish also translates Spanish to English, with the same "show original" toggle on each surface.
- **Cost is bounded.** Background translation keeps its single nightly limit, now shared between both directions. On-demand translation has a hard daily limit on Gemini strings; above it, content is shown as written. A GCP budget alert covers the Gemini key's project.

## Considered Options

- Recording the author's UI language at write time. Rejected because bilingual staff often write in the language their UI isn't set to, and older content would still need guessing.
- Sending all text to Gemini. Most accurate, but rejected on cost and because the English-mode majority would see a loading flash on new content.
