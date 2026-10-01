import React, { useState } from "react";
import {
  Edit3,
  UserCircle,
  MessageSquare,
  Phone,
  Calendar,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";

export default function ContactAuditItem({
  activity,
  isLast,
  key,
}: {
  activity: any;
  isLast: boolean;
  key?: React.Key;
}) {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative pl-8 pb-4 last:pb-0 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-4 top-10 bottom-0 w-[1px] bg-outline-variant group-hover:bg-primary/30 transition-colors" />
      )}

      {/* Icon Bubble */}
      <div
        className={cn(
          "absolute left-0 top-0.5 w-8 h-8 rounded-full border-2 border-surface-container flex items-center justify-center z-10 transition-transform group-hover:scale-110 ",
          activity.type === "edit"
            ? "bg-tertiary-container text-on-tertiary-container"
            : activity.type === "create"
              ? "bg-primary-container text-on-primary-container"
              : activity.type === "comment"
                ? "bg-secondary-container text-on-secondary-container"
                : activity.type === "call"
                  ? "bg-primary-fixed text-on-primary-fixed"
                  : "bg-surface-container-highest text-on-surface-variant",
        )}
      >
        {activity.type === "edit" && <Edit3 className="w-4 h-4" />}
        {activity.type === "create" && <UserCircle className="w-4 h-4" />}
        {activity.type === "comment" && <MessageSquare className="w-4 h-4" />}
        {activity.type === "call" && <Phone className="w-4 h-4" />}
        {!["edit", "create", "comment", "call"].includes(activity.type) && (
          <Calendar className="w-4 h-4" />
        )}
      </div>

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          <span className="text-xs font-semibold text-on-surface  tracking-tight">
            {activity.userName}
          </span>
          <span className="text-xs text-on-surface-variant">
            {activity.action === "logged an interaction for" ||
            activity.action === "logged a batch interaction for"
              ? activity.type === "call"
                ? t('modals.contactDetails.audit_called')
                : activity.type === "email"
                  ? t('modals.contactDetails.audit_emailed')
                  : activity.type === "event"
                    ? t('modals.contactDetails.audit_meeting')
                    : activity.type === "comment"
                      ? t('modals.contactDetails.audit_note')
                      : t('modals.contactDetails.audit_interacted')
              : activity.action === "updated an interaction for"
                ? t('modals.contactDetails.audit_updated_interaction')
                : activity.action === "deleted an interaction for"
                  ? t('modals.contactDetails.audit_deleted_interaction')
                  : activity.action === "cleared a prayer for"
                    ? t('activity.cleared_a_prayer_for')
                    : activity.action.startsWith("updated") &&
                    activity.action !== "updated an interaction for" &&
                    activity.type === "edit" &&
                    activity.description
                ? t('modals.contactDetails.audit_updated_the').replace('{fields}', (activity.description
                    .split("\\n")
                    .map((line: string) => {
                      const field = line.includes(":") ? line.split(":")[0].trim() : line.trim();
                      if (field.toLowerCase() === "notes updated") return t('modals.contactDetails.audit_notes');
                      return field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                    })
                    .filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i)
                    .join(", ")))
                : activity.action}
          </span>
          <span className="text-[10px] font-semibold text-on-surface-variant/40 ml-auto   whitespace-nowrap">
            {new Date(activity.createdAt).toLocaleDateString()} at{" "}
            {new Date(activity.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {activity.description && activity.type !== "edit" && (
          <div className="mt-2 p-3 rounded-xl bg-surface-container-high border border-outline-variant/30 text-[13px] leading-relaxed text-on-surface-variant italic">
            "{activity.description}"
          </div>
        )}
      </div>
    </div>
  );
}
