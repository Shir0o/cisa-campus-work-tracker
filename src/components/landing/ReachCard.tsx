import React from "react";
import { Mail, MessageSquare } from "lucide-react";
import { Contact, Stage } from "../../types";
import { Avatar, StageChip } from "./primitives";
import { connectedLabel, truncate } from "./helpers";

// A person you're walking with: avatar + name + stage, when you last connected,
// a recent note, and reach actions (Message / Email / Open). Shared by My Day's
// "Your sheep" and the Trainee landing's "Your people".
export function ReachCard({
  contact,
  days,
  note,
  stages,
  onOpen,
  onMessage,
  statusNode,
}: {
  contact: Contact;
  days: number;
  note?: string;
  stages: Stage[];
  onOpen: () => void;
  onMessage?: () => void;
  // Optional status line under the name (e.g. the trainee cockpit's "{FT}
  // weighed in" / "Awaiting a look").
  statusNode?: React.ReactNode;
}) {
  return (
    <div
      onClick={onOpen}
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 bg-surface rounded-2xl border border-outline-variant/60 p-5 hover:border-primary/40 transition-colors cursor-pointer"
    >
      <div className="flex gap-4 min-w-0">
        <Avatar contact={contact} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-on-surface">{contact.name}</span>
            <StageChip stage={contact.stage} stages={stages} />
          </div>
          <div className="text-sm text-primary font-medium mt-0.5">
            {Number.isFinite(days) ? connectedLabel(days) : "Not connected yet"}
          </div>
          {statusNode && <div className="mt-1.5">{statusNode}</div>}
          {note && (
            <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
              {truncate(note, 120)}
            </p>
          )}
        </div>
      </div>
      <div
        className="flex sm:flex-col gap-2 items-start sm:items-end"
        onClick={(e) => e.stopPropagation()}
      >
        {contact.phone ? (
          <button
            onClick={onMessage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Message
          </button>
        ) : contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
          >
            <Mail className="w-3.5 h-3.5" /> Email
          </a>
        ) : null}
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Open
        </button>
      </div>
    </div>
  );
}
