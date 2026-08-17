import React, { useState } from "react";
import { cn } from "../lib/utils";
import { Activity, Contact } from "../types";
import {
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  RefreshCw,
  Users,
  AlertTriangle,
} from "lucide-react";

export interface ActivityItemProps {
  key?: React.Key;
  activity: Activity;
  contacts: Contact[];
  onOpenContact: (contact: Contact) => void;
}

export function ActivityItem({
  activity,
  contacts,
  onOpenContact,
}: ActivityItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex gap-4 p-4 rounded-2xl border border-outline-variant/30 bg-surface hover:bg-surface-container-lowest transition-colors group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 group-hover:-rotate-3 mt-0.5 overflow-hidden",
          activity.type === "call"
            ? "bg-primary-container text-accent"
            : activity.type === "email"
              ? "bg-secondary-container text-secondary"
              : activity.type === "event"
                ? "bg-tertiary-container text-tertiary"
                : activity.type === "comment"
                  ? "bg-surface-container-high text-on-surface"
                  : activity.type === "edit"
                    ? "bg-surface-container-high text-on-surface-variant"
                    : activity.type === "create"
                      ? "bg-primary-container text-accent"
                      : "bg-error-container text-on-error-container",
        )}
        title={activity.user}
      >
        {activity.userPhoto ? (
          <img src={activity.userPhoto} alt={activity.user} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-[16px] font-semibold">{activity.user?.charAt(0) || '?'}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="text-[15px] leading-snug flex-1">
            <span className="font-semibold text-accent">{activity.user}</span>{" "}
            <span className="text-on-surface-variant">
              {activity.action === "logged an interaction for" ||
              activity.action === "logged a batch interaction for"
                ? activity.type === "call"
                  ? "called"
                  : activity.type === "email"
                    ? "emailed"
                    : activity.type === "event"
                      ? "had a meeting with"
                      : activity.type === "comment"
                        ? "left a note for"
                        : "interacted with"
                : activity.action === "updated an interaction for"
                  ? "updated an interaction for"
                  : activity.action.startsWith("updated") &&
                      activity.action !== "updated an interaction for" &&
                      activity.type === "edit" &&
                      activity.description
                  ? `updated the ${activity.description
                      .split("\n")
                      .map((line) => {
                        const field = line.includes(":") ? line.split(":")[0].trim() : line.trim();
                        if (field.toLowerCase() === "notes updated") return "Notes";
                        return field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                      })
                      .filter((v, i, a) => v && a.indexOf(v) === i)
                      .join(", ")} for`
                  : activity.action}
            </span>{" "}
            <button
              onClick={() => {
                if (activity.contactId) {
                  const contact = contacts.find(
                    (c) => c.id === activity.contactId,
                  );
                  if (contact) onOpenContact(contact);
                }
              }}
              className="font-semibold text-on-surface hover:text-accent hover:underline transition-colors focus:outline-none"
            >
              {activity.target}
            </button>
          </div>
          <span className="text-xs font-medium text-on-surface-variant/70 whitespace-nowrap mt-0.5 pt-0.5">
            {activity.time}
          </span>
        </div>

        {activity.description && activity.type !== "edit" && (
          <div className="mt-2 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-[13px] leading-relaxed text-on-surface-variant italic">
            "{activity.description}"
          </div>
        )}
      </div>
    </div>
  );
}
