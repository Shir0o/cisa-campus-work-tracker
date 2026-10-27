import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import { subscribeAsks, askStacksFor, askUnreadFor, type AskMessage } from "../../lib/asks";
import { useInboxReads } from "../../lib/inboxReads";

// ── The Questions door (#1859) ──────────────────────────────────────────────
// One compact row on a Full-timer's phone My Day, in place of the inline
// question stacks: the title, the number of questions still waiting, and a
// door to /questions. ADR 0015 decision 2 — a door and nothing else. The rows
// are never read here; the page owns them, their filters, the composer and
// mark-scanned, so there is exactly one place with one behaviour.
//
// The count is the page's own derivation — other people's unanswered, unscanned
// questions — so the row and the page cannot disagree. No new query, no new
// persisted state. Absent when nothing is waiting, exactly as AskStack was.

export default function QuestionsPointerCard({ className }: { className?: string }) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const uid = effectiveUserId || user?.uid || "";
  const inbox = useInboxReads();
  const [asks, setAsks] = useState<AskMessage[]>([]);

  const isFullTimer = role === "admin";

  useEffect(() => {
    if (!isFullTimer || !uid) return;
    return subscribeAsks(setAsks, undefined, { uid, isStaff: true });
  }, [isFullTimer, uid]);

  if (!isFullTimer) return null;

  // Nothing unanswered and from someone else? Then there is no door to draw,
  // exactly as the inline stack returned null on desktop.
  const waiting = askStacksFor(asks, uid).length > 0;
  if (!waiting) return null;

  // The badge is the page's own number: other people's unanswered, unscanned
  // questions. Read state is live (useInboxReads re-renders on every change),
  // so the count drops as soon as a question is scanned on the page. When every
  // waiting question has been scanned the row stays as a quiet door, with no
  // "0 new" badge — questions are still one tap away.
  const unread = askUnreadFor(asks, uid, true, (key) => inbox.isRead(uid, key));

  return (
    <a
      href="/questions"
      onClick={(e) => {
        e.preventDefault();
        navigate("/questions");
      }}
      className={cn(
        "group flex min-h-11 items-center gap-2 rounded-2xl border border-outline-variant/60 bg-surface px-4 py-3 transition-colors hover:border-accent/40 active:bg-surface-variant/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-on-surface">
        {t("ask.questions_for_team", "Questions for Full-timers")}
      </span>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent tabular-nums">
          {t("ask.new", "{n} new").replace("{n}", String(unread))}
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent group-hover:underline">
        {t("ask.see_all", "See all")}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </a>
  );
}
