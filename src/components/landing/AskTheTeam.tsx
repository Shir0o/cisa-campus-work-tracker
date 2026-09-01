import React, { useEffect, useMemo, useState } from "react";
import { HelpCircle, Send, MessageSquare, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { collection, query, onSnapshot } from "firebase/firestore";
import { cn, relTime } from "../../lib/utils";
import { db } from "../../lib/firebase";
import { roleLabel } from "../../lib/permissions";
import { useAuth } from "../AuthProvider";
import { useI18n } from "../LanguageProvider";
import { SectionHead } from "./primitives";
import type { AppUser } from "../../types";
import {
  subscribeStaffAsks,
  askQuestions,
  askRepliesOf,
  askWaitedDays,
  askOrigin,
  addAsk,
  deleteAskReply,
  type AskMessage,
} from "../../lib/asks";

// "Ask the team" (#545, #645), trainee side — the questions that don't belong
// on anyone's page. Asking and reading are ONE list: the composer at the top,
// the whole team's questions newest-first under it (staff read every question),
// each answer inline. Nothing to resolve, nothing to mark — a question with a
// reply is just a question with a reply. Every staff member sees every
// question; any full-timer can answer.

function waitedWords(m: AskMessage, t: (k: string, f?: string) => string): string {
  const d = askWaitedDays(m);
  return d === 0
    ? t("ask.waited_today", "asked today")
    : d === 1
      ? t("ask.waited_yesterday", "waiting since yesterday")
      : t("ask.waited_days", `waiting ${d} days`).replace("{n}", String(d));
}

/** A single reply bubble on the trainee home (#680). The asker of the
 *  question can clean up a reply from this surface; the inline confirm
 *  mirrors the question-delete affordance on /questions. */
function ReplyRow({
  r,
  canDelete,
}: {
  r: AskMessage;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    await deleteAskReply(r.id);
    setConfirming(false);
    setDeleting(false);
  };
  if (confirming) {
    return (
      <div className="bg-error-container/40 border border-error-container rounded-xl px-3 py-2">
        <div className="flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface text-pretty">
            <span className="font-semibold">{t("ask.delete_reply_confirm", "Delete this answer?")}</span>{" "}
            {t("ask.delete_reply_body", "It comes off the question for the whole team. This can't be undone.")}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 pl-[22px]">
          <button
            type="button"
            disabled={deleting}
            onClick={() => void remove()}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-error text-on-error text-xs font-semibold disabled:opacity-40 disabled:cursor-default"
          >
            <Trash2 className="w-3 h-3" />
            {t("ask.delete_reply", "Delete answer")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-7 px-2.5 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:text-on-surface"
          >
            {t("ask.delete_reply_keep", "Keep it")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-surface-variant/50 rounded-xl px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed flex-1">{r.body}</p>
        {canDelete && (
          <button
            type="button"
            aria-label={t("ask.delete_reply_aria", "Delete this answer")}
            title={t("ask.delete_reply_aria", "Delete this answer")}
            onClick={() => setConfirming(true)}
            className="grid place-items-center w-6 h-6 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <span className="text-[11px] text-on-surface-variant mt-1 block">
        {r.fromName} · {relTime(r.at)}
      </span>
    </div>
  );
}

function AskRow({
  m,
  replies,
  viewerUid,
  roleOf,
}: {
  m: AskMessage;
  replies: AskMessage[];
  viewerUid?: string;
  roleOf?: (uid: string) => string | undefined;
}) {
  const { t } = useI18n();
  const org = askOrigin(m, viewerUid);
  const role = roleOf ? roleOf(m.from) : undefined;
  // The trainee home is for the asker: only the asker of the question can
  // delete a reply on this surface. A full-timer cleans up on /questions.
  const canDeleteReply = Boolean(viewerUid) && m.from === viewerUid;
  return (
    <div className="bg-surface rounded-3xl border border-outline-variant/60 p-5">
      <div className="flex gap-3">
        <span className="flex-none grid place-items-center rounded-[9px] w-[30px] h-[30px] text-stage-amber bg-stage-amber-soft" aria-hidden>
          <HelpCircle className="w-[15px] h-[15px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-on-surface-variant">
                {m.fromName || "Someone"}
                {role && <span className="ml-1.5 text-[11px] text-on-surface-variant/80">{role}</span>}
              </p>
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line mt-0.5">{m.body}</p>
              <div
                className={cn(
                  "flex items-center gap-1.5 mt-1.5 text-xs",
                  org.written ? "text-accent font-medium" : "text-on-surface-variant/80",
                )}
              >
                {org.written ? (
                  <Pencil className="w-3 h-3 shrink-0" />
                ) : (
                  <MessageSquare className="w-3 h-3 shrink-0" />
                )}
                <span>{org.text}</span>
              </div>
              <span className="text-[11.5px] text-on-surface-variant mt-1 block">{relTime(m.at)}</span>
            </div>
          </div>

          {replies.length === 0 ? (
            <p className="text-xs text-on-surface-variant/80 mt-2">
              {t("ask.no_answer_yet", "No answer yet · {words}. It's with the whole team, not one person.").replace(
                "{words}",
                waitedWords(m, t),
              )}
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {replies.map((r) => (
                <ReplyRow key={r.id} r={r} canDelete={canDeleteReply} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AskTheTeam({
  meUid,
  className,
}: {
  meUid?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const uid = meUid || user?.uid || "";
  const [asks, setAsks] = useState<AskMessage[]>([]);
  const [body, setBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [staffByUid, setStaffByUid] = useState<Record<string, AppUser>>({});

  useEffect(() => {
    if (!uid) return;
    return subscribeStaffAsks(uid, setAsks);
  }, [uid]);

  // Staff roster for asker role badges — the team's questions are team-visible,
  // and who asked matters (full-timer vs trainee).
  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(q, (snap) => {
      const staff = (snap?.docs || [])
        .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
        .filter((u) => {
          const isStaffRole = u.role === "admin" || u.role === "manager";
          const notBot = !(u.email || "").startsWith("cisa-");
          return isStaffRole && notBot && u.approved;
        });
      setStaffByUid(Object.fromEntries(staff.map((u) => [u.uid, u])));
    });
    return unsub;
  }, []);

  const questions = useMemo(() => askQuestions(asks), [asks]);

  const send = () => {
    const b = body.trim();
    if (!b) return;
    void addAsk({ from: uid, fromName: user?.displayName || "A trainee", body: b });
    setBody("");
    setToast(t("ask.toast_asked", "Asked. The team can see it."));
    window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <section className={cn("mt-12", className)}>
      <SectionHead
        title={t("ask.title", "Ask the team")}
        sub={t("ask.sub", "The questions that don't belong on anyone's page. Every full-timer sees this — any of them can answer.")}
      />
      <div className="flex flex-col gap-3">
        {/* Composer at the top */}
        <div className="bg-surface rounded-3xl border border-outline-variant/60 p-5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("ask.composer_placeholder", "What do you want to ask? Say it how you'd say it out loud.")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface focus:border-primary focus:outline-none min-h-[88px] resize-none"
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="text-xs text-on-surface-variant">
              {t("ask.composer_note", "Every full-timer sees this. Any of them can answer.")}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={!body.trim()}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-opacity",
                body.trim()
                  ? "bg-primary text-on-primary hover:opacity-90"
                  : "bg-surface-variant text-on-surface-variant opacity-60 cursor-not-allowed",
              )}
            >
              <Send className="w-3.5 h-3.5" /> {t("ask.ask", "Ask")}
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-2">
            {t("ask.empty", "Nothing asked yet. The questions that don't belong on anyone's page — how to start a conversation at the club table, what to say when you're stuck — live here.")}
          </p>
        ) : (
          questions.map((m) => (
            <AskRow
              key={m.id}
              m={m}
              replies={askRepliesOf(asks, m.id)}
              viewerUid={uid}
              roleOf={(askerUid) => {
                const u = staffByUid[askerUid];
                return u ? roleLabel(u.role) : undefined;
              }}
            />
          ))
        )}
      </div>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-surface border border-outline-variant px-4 py-2 text-sm text-on-surface shadow-lg"
        >
          {toast}
        </div>
      )}
    </section>
  );
}