# To ask: drafted lines stay tied to their signal

**To ask** (#1639) is a Full-timer's private notepad of things to put to Trainees in person, and the app drafts lines into it from three existing signals — **Not reached yet**, a **Follow-up ask** open three days, a Thread question unanswered three days. We decided a drafted line stays tied to the signal that produced it for its whole life, *including after the Full-timer rewords it*: when the signal clears (Jae logs the Interaction, the ask is closed), the line ticks itself off and reads struck through with what cleared it. The line therefore stores a reference to its source signal (contact + signal kind + the ask or message id where there is one) beside the Full-timer's own text, rather than being a plain string.

The point of the notepad is to walk up to a Trainee with the right questions; asking Jae about someone he logged yesterday is the failure it exists to prevent, and that failure is most likely on exactly the lines a Full-timer cared enough to rewrite.

## Considered Options

- **Snapshot** — a drafted line becomes ordinary text once it lands and is only ever cleared by hand. Simplest storage, but the list goes stale between writing and asking, which is the one thing it must not do.
- **Live until edited** — rewording a line detaches it into a plain note. Looks like a clean rule, but it punishes the Full-timer for making a line clearer, and silently turns a self-resolving line into one that never resolves.

## Consequences

- A ticked **Asked** leaves the signal open; the line returns only when a *new* signal appears for that person (a new stalled ask, say), never because time passed. So the stored reference must identify the signal instance, not just the person.
- What the Full-timer learns in person is recorded by **Logged on behalf**, not by the notepad. To ask holds no facts about the contact — only private intent and ticks — which is why it can stay invisible to everyone else.
