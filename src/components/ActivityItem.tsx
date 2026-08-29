import React, { useState } from "react";
import { cn } from "../lib/utils";
import { Activity, Contact } from "../types";
import { useLanguage } from "./LanguageProvider";
import { Translate } from "./Translate";
import { useTranslate } from "../hooks/useTranslate";
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
  const { t } = useLanguage();
  const { translatedText: translatedDescription } = useTranslate(activity.description || '');
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex gap-4 p-4 rounded-3xl border border-outline-variant/30 bg-surface hover:bg-surface-container-lowest transition-colors group relative"
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
                  ? t('activity.called')
                  : activity.type === "email"
                    ? t('activity.emailed')
                    : activity.type === "event"
                      ? t('activity.had_a_meeting_with')
                      : activity.type === "comment"
                        ? t('activity.left_a_note_for')
                        : t('activity.interacted_with')
                : activity.action === "updated an interaction for"
                  ? t('activity.updated_an_interaction_for')
                  : activity.action === "deleted an interaction for"
                    ? t('activity.deleted_an_interaction_for')
                    : activity.action.startsWith("updated") &&
                      activity.action !== "updated an interaction for" &&
                      activity.type === "edit" &&
                      activity.description
                  ? `${t('activity.updated_the')} ${activity.description
                      .split("\n")
                      .map((line) => {
                        const field = line.includes(":") ? line.split(":")[0].trim() : line.trim();
                        if (field.toLowerCase() === "notes updated") return t('activity.notes');
                        return field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                      })
                      .filter((v, i, a) => v && a.indexOf(v) === i)
                      .join(", ")} ${t('activity.for')}`
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
            "{translatedDescription}"
          </div>
        )}
      </div>
    </div>
  );
}
