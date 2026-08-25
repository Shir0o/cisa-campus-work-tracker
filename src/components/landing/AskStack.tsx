import React, { useEffect, useMemo, useState } from "react";
import { HelpCircle, Check } from "lucide-react";
import { cn, relTime } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { useI18n } from "../LanguageProvider";
import { Avatar, SectionHead } from "./primitives";
import {
  subscribeAsks,
  askStacksFor,
  askWaitedDays,
  addAskReply,
  type AskMessage,
  type AskStack as AskStackData,
} from "../../lib/asks";
import { useInboxReads } from "../../lib/inboxReads";

// ── A question with nobody attached (#545) ─────────────────────────────────
// A trainee's question about the work itself has no person to stack it under,
// so the stack is keyed by the ASKER. Answering *is* the action — there is no
// "I followed up" here, nothing to resolve, and the first full-timer to reply
// takes the row off everyone's feed. An unanswered question does NOT age: it
// stays here until someone replies, and the waiting is said in words.

function waitedWords(m: AskMessage, t: (k: string, f?: string) => string): string {
  const d = askWaitedDays(m);
  return d === 0
    ? t("ask.waited_today", "asked today")
    : d === 1
      ? t("ask.waited_yesterday", "waiting since yesterday")
      : t("ask.waited_days", `waiting ${d} days`).replace("{n}", String(d));
}

function AskStackRow({
  stack,
  staffNameMap,
  uid,
  meName,
  onToast,
  mobile,
}: {
  stack: AskStackData;
  staffNameMap: Record<string, string>;
  uid: string;
  meName: string;
  onToast?: (msg: string) => void;
  mobile?: boolean;
}) {
  const inbox = useInboxReads();
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const fullName = staffNameMap[stack.from] || stack.items[0].fromName || "Someone";
  const first = fullName.split(/\s+/)[0];

  const answer = (m: AskMessage) => {
    const body = draft.trim();
    if (!body) return;
    void addAskReply(
      m.id,
      { from: uid, fromName: meName, body },
      m.owner,
      m.owner,
    );
    inbox.markRead(uid, "ask:" + m.id);
    setDraft("");
    setOpenId(null);
    onToast?.(t("ask.answered_toast", `Answered ${first}.`).replace("{first}", first));
  };

  const unread = stack.items.filter((m) => !inbox.isRead(uid, "ask:" + m.id)).length;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all duration-200",
        unread > 0
          ? "bg-surface border-outline-variant shadow-sm"
          : "bg-surface/60 border-outline-variant/40",
      )}
    >
      <div className="flex items-start gap-3.5">
        <Avatar contact={{ name: fullName } as never} size={mobile ? "sm" : "md"} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-medium text-base text-on-surface truncate">
                {t("ask.asked_the_team", "{name} asked the team").replace("{name}", fullName)}
              </span>
              {unread > 0 && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 inline-block" />
              )}
            </div>
            <span className="text-xs text-on-surface-variant/80 shrink-0">{relTime(stack.at)}</span>
          </div>

          <div className="mt-1 flex flex-col gap-3">
            {stack.items.map((m) => {
              return (
                <div key={m.id} className="bg-surface-variant/40 rounded-xl p-3">
                  <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed">{m.body}</p>
                  <p className="text-[11px] text-on-surface-variant/80 mt-1.5">
                    {t("ask.no_answer_yet", "No answer yet · {words}. It's with the whole team, not one person.").replace(
                      "{words}",
                      waitedWords(m, t),
                    )}
                  </p>
                  {openId === m.id ? (
                    <div className="mt-2.5">
                      <textarea
                        autoFocus
                        value={draft}
                        rows={3}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("ask.answer_placeholder", `Answer ${first} the way you'd say it out loud.`).replace("{first}", first)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) answer(m);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface focus:border-primary focus:outline-none"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => answer(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          {t("ask.send_it", "Send it")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenId(null);
                            setDraft("");
                          }}
                          className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          {t("ask.not_now", "Not now")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(m.id);
                        setDraft("");
                        inbox.markRead(uid, "ask:" + m.id);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {t("ask.answer", `Answer ${first}`).replace("{first}", first)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {unread > 0 && (
            <button
              type="button"
              onClick={() =>
                stack.items.forEach((m) => inbox.markRead(uid, "ask:" + m.id))
              }
              className="text-xs font-medium text-on-surface-variant hover:text-on-surface px-1 py-1 transition-colors mt-1"
            >
              <Check className="w-3 h-3 inline mr-1" />
              {t("ask.mark_scanned", "Mark scanned")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Questions for the team" — full-timer only, heads the My Day attention feed.
 *  One stack per asker; answering *is* the action and the first reply clears
 *  the question for every full-timer. */
export default function AskStack({
  staffNameMap,
  onToast,
  mobile,
  className,
}: {
  staffNameMap?: Record<string, string>;
  onToast?: (msg: string) => void;
  mobile?: boolean;
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useI18n();
  const uid = effectiveUserId || user?.uid || "u1";
  const [asks, setAsks] = useState<AskMessage[]>([]);
  const inbox = useInboxReads();

  useEffect(() => subscribeAsks(setAsks), []);

  const isFullTimer = role === "admin";
  const stacks = useMemo(
    () => (isFullTimer ? askStacksFor(asks, uid) : []),
    [asks, uid, isFullTimer],
  );

  const meName = user?.displayName || "Someone";
  const map = useMemo(() => {
    const m: Record<string, string> = { ...staffNameMap };
    for (const a of asks) if (a.from && a.fromName) m[a.from] ??= a.fromName;
    return m;
  }, [staffNameMap, asks]);

  if (stacks.length === 0) return null;

  const unread = stacks.reduce(
    (n, s) => n + s.items.filter((m) => !inbox.isRead(uid, "ask:" + m.id)).length,
    0,
  );

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SectionHead
        title={t("ask.questions_for_team", "Questions for the team")}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("ask.questions_for_team_sub", "Trainees' questions that aren't about one person. Answering clears them for everyone.")}</span>
            {unread > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                {t("ask.new", "{n} new").replace("{n}", String(unread))}
              </span>
            )}
          </span>
        }
        action={
          unread > 0 ? (
            <button
              type="button"
              onClick={() =>
                stacks.forEach((s) => s.items.forEach((m) => inbox.markRead(uid, "ask:" + m.id)))
              }
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              {t("ask.mark_all_scanned", "Mark all scanned")}
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        {stacks.map((stack) => (
          <AskStackRow
            key={stack.id}
            stack={stack}
            staffNameMap={map}
            uid={uid}
            meName={meName}
            onToast={onToast}
            mobile={mobile}
          />
        ))}
      </div>
    </section>
  );
}