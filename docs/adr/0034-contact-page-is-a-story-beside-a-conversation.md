# 0034: The contact page is a story beside a conversation

## Status
Accepted. Supersedes the tab model in [ADR 0006](./0006-contact-detail-frame-and-tab-shapes.md) (decisions 4 and 6); its frame decisions stand.

## Context

The contact page had six tabs (Overview, Conversation, Full-timers, Interactions, Prayer, History) and the same actions in several places: logging an interaction had three entry points, adding a prayer three, editing and deleting two each. The things a staff member actually does on arrival are talk in the Conversation, log what happened, read the Full-timers thread, and bring someone in. Each of those lived on a different tab, and "who can see" sat at the foot of Overview where nobody found it.

Five layouts were drawn with one sample history (canvas: https://claude.ai/artifact/B61dajxMhYgBC5ez9ipzfd). Folding the Conversation into the story as one list was the first choice, and it was rejected after seeing it. Newest first, a reply sits above its question. Oldest first, the story no longer opens on what happened lately. Either way a waiting question sinks under newer entries. A pinned "waiting on a reply" strip and pointer lines into the conversation both worked, but each needed a new rule people would have to learn.

## Decision

1. **Two regions, no tabs.** **The story so far** fills the page: interactions (including those **logged on behalf** of a teammate), every Gathering they came to (read from attendance, with consecutive weeks folded), prayers, Conversation messages someone chose to **Add to story**, and every change (step, kind, shares, **Delegates**, carers, tags, profile edits), newest first. Things people did get full entries. Changes are one-line entries showing old → new, and a run of changes by one person folds into one. The Interactions, Prayer and History tabs are gone, and the story replaces them.
2. **Conversation lives in a side pane**, as an ADR 0033 stream (oldest first, composer at the foot). **Full-timers** shares the pane behind a switch. The pane opens on Conversation, and Full-timers shows an unread dot. A Trainee's pane has no switch. The header counts open Follow-up asks, and clicking the count jumps to them. Replies to a message, and threads on an interaction, open inside the pane with a back arrow. On narrow screens the pane becomes a **Conversation** button in the head that opens it full-screen.
3. **One entry point per action.** The head holds the name, kind chip, a small step control, Cared for by, **Delegate**, and ⋯. The story's composer offers Interaction (the default) and Prayer. The pane keeps the stream composer ADR 0033 shipped (comment, question, Follow-up ask). The ⋯ menu holds Call / Text / Email (on desktop), Edit details, Change creator (Full-timers only), and Delete.
4. **Overview becomes an About sheet**, opened from the name or avatar: what we know, how to reach them, tags, and who can see (with silent **Share** and remove). Open prayers show as one line under the head that jumps into the story.
5. **Delegate and Share are separate acts.** Share adds a teammate silently. Delegate shares and writes an @mention with an optional note into the Conversation, so it reaches the teammate's bell and **On you**.

## Consequences

- Changes on a person now appear on the person. This reverses the 2026-09-25 call that the change log lives only on `/history`. The `activities` read rule already follows contact visibility, so no rule change is needed. `/history` stays as the team-wide log.
- Deep links and notifications that open a contact at `?tab=thread` or `?tab=discussion` must land on the pane instead.
- The pane is the `Stream` component the contact drawer already uses (#1257, #1258), moved from a drawer to a pinned pane. Interaction Threads keep their chip on the story entry. The phone's person screen already has this shape (#1261): a Conversation tab with the Full-timers switch, and Threads on Story entries.
