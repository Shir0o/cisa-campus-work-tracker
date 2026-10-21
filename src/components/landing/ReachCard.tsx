import React from "react";
import { Mail, MessageSquare, PenLine } from "lucide-react";
import { Contact, Stage } from "../../types";
import { Avatar, StageChip } from "./primitives";
import { connectedLabel } from "./helpers";
import { Translate } from "../Translate";
import KindChip from '../ui/KindChip';
import { useLanguage } from "../LanguageProvider";

// Keeps each pill's compact look but gives it a 44px-tall tap target with a
// layout-neutral ::after; the action gaps leave room so targets never overlap.
const hitArea =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:h-11";

// A person you're walking with: avatar + name + stage, when you last connected,
// a recent note, and reach actions (Message / Email / Log interaction / Open).
// Shared by My Day's "Your sheep" and the Trainee landing's "Your people".
export function ReachCard({
  contact,
  days,
  note,
  stages,
  onOpen,
  onMessage,
  onLog,
  statusNode,
}: {
  contact: Contact;
  days: number;
  note?: string;
  stages: Stage[];
  onOpen: () => void;
  onMessage?: () => void;
  // Record an interaction with this person; the action shows only when set.
  onLog?: () => void;
  // Optional status line under the name (e.g. the trainee cockpit's "{FT}
  // weighed in" / "Awaiting a look").
  statusNode?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div
      onClick={onOpen}
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 bg-surface rounded-xl border border-outline-variant/60 p-5 hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer"
    >
      <div className="flex gap-4 min-w-0">
        <Avatar contact={contact} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-on-surface">{contact.name}</span>
            <StageChip stage={contact.stage} stages={stages} />
            <KindChip contact={contact} />
          </div>
          <div className="text-sm text-accent font-medium mt-0.5">
            {Number.isFinite(days) ? connectedLabel(days) : "Not connected yet"}
          </div>
          {statusNode && <div className="mt-1.5">{statusNode}</div>}
          {note && (
            <Translate
              as="p"
              className="text-sm text-on-surface-variant leading-relaxed mt-2 whitespace-pre-line"
              text={note}
            />
          )}
        </div>
      </div>
      <div
        className="flex flex-wrap sm:flex-col gap-x-2 gap-y-4 items-start sm:items-end"
        onClick={(e) => e.stopPropagation()}
      >
        {contact.phone ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onMessage) onMessage();
            }}
            className={`${hitArea} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant active:scale-[0.98] transition-all cursor-pointer`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Message
          </button>
        ) : contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            className={`${hitArea} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant active:scale-[0.98] transition-all cursor-pointer`}
          >
            <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
          </a>
        ) : null}
        {onLog && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLog();
            }}
            className={`${hitArea} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant active:scale-[0.98] transition-all cursor-pointer`}
          >
            <PenLine className="w-3.5 h-3.5" aria-hidden="true" /> {t("modals.contactDetails.log_interaction")}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={`${hitArea} inline-flex items-center gap-1 px-3 py-1.5 rounded-[14px] bg-primary text-on-primary text-xs font-medium hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer`}
        >
          Open
        </button>
      </div>
    </div>
  );
}
