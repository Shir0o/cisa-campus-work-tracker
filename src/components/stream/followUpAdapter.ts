// The Follow-up adapter: a Feedback Note's replies (feedback/{id}/replies,
// ADR 0019) as a stream. Reads what the page's subscription already holds and
// writes only through the existing server routes, which mirror to the public
// issue tracker — no path, shape or rule changes.
//
// It is the plainest source there is: no kinds, no Threads, no mentions, no
// attachments. What it adds is that the team is one voice ("The team"), and
// that the submitter can rewrite their own Follow-up.
import type { FeedbackReply } from "../../types";
import type { StreamAdapter, StreamSourceMessage } from "./types";

export interface FollowUpMessage extends StreamSourceMessage {
  authorRole: FeedbackReply["authorRole"];
  /** Came from a GitHub comment; it belongs to the issue, not to the app. */
  relayed: boolean;
}

type IdToken = Promise<string>;

export interface FollowUpAdapterInput {
  noteId: string;
  replies: FeedbackReply[];
  me: { uid: string; name: string; role?: string | null };
  /** Read the submitter's rendering (the restatement of a relayed comment)
   *  rather than the owner's raw one. */
  asSubmitter: boolean;
  getIdToken?: () => IdToken;
  t: (key: string) => string;
}

const MAX_BODY = 5000;

export function followUpAdapter({ noteId, replies, me, asSubmitter, getIdToken, t }: FollowUpAdapterInput): StreamAdapter<FollowUpMessage> {
  const theTeam = t("feedback.the_team");

  // The server verifies an ID token; without one it refuses, and the caller
  // says so — a token we can't fetch is not a reason to stay silent.
  const call = async (path: string, payload: Record<string, unknown>) => {
    let token: string | null = null;
    try {
      token = getIdToken ? await getIdToken() : null;
    } catch (err) {
      console.error("Failed to get Firebase ID token:", err);
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
  };

  const messages: FollowUpMessage[] = replies.map((r) => {
    const mine = r.authorRole === "submitter";
    return {
      id: r.id,
      parentId: null,
      // Every team reply is one author, so a run of them groups.
      from: mine ? r.authorId ?? me.uid : "team",
      fromName: mine ? r.authorName || me.name : theTeam,
      // The team is a voice, not a person: one letter, as the canvas draws it.
      ...(mine ? {} : { initials: theTeam.trim().charAt(0).toUpperCase() }),
      // On the owner's own Notes a relayed comment is stored raw with the
      // restatement beside it, so the submitter's view has something to show.
      body: asSubmitter ? r.launderedBody || r.body : r.body,
      at: r.createdAt,
      editedAt: r.editedAt ?? null,
      authorRole: r.authorRole,
      relayed: !!r.relayed,
    };
  });

  return {
    messages,
    name: t("feedback.follow_ups"),
    where: t("feedback.follow_ups"),
    // The public-tracker line is the footer under the composer, not an audience.
    audience: "",
    empty: t("feedback.no_follow_ups"),
    capabilities: { kinds: false, attachments: false, canPost: true, canReply: false },
    mentionCandidates: [],
    composer: {
      placeholder: t("feedback.follow_up_placeholder"),
      label: t("feedback.follow_up_placeholder"),
      submitLabel: t("feedback.send"),
      editLabel: t("feedback.edit_follow_up"),
      maxLength: MAX_BODY,
    },
    failure: { post: t("feedback.follow_up_failed"), edit: t("feedback.edit_failed") },
    post: ({ body }) => call("/api/feedback/reply", { id: noteId, body }),
    // Only the reply's author may rewrite it — and a relayed reply belongs to
    // the issue (the server enforces both again).
    canEdit: (m) => m.authorRole === "submitter" && !m.relayed && m.from === me.uid,
    edit: (m, body) => call("/api/feedback/reply/edit", { id: noteId, replyId: m.id, body }),
    // No Threads, no asks, and no route that removes a Follow-up.
    reply: () => undefined,
    closeAsk: () => undefined,
    delete: () => undefined,
    canDelete: () => false,
  };
}
