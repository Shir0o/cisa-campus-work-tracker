import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, CheckSquare, Plus, X } from "lucide-react";
import DatePicker from "../ui/DatePicker";
import { sendNotification, logActivity } from "../../lib/firebase";
import { cn } from "../../lib/utils";
import {
  addTodo,
  updateTodo,
  duePresetToISO,
  presetForDue,
  DUE_PRESETS,
  type DuePresetKey,
  type TodoPerson,
  type SubtaskItem,
  type TodoSource,
} from "../../lib/todos";
import { PersonAvatar } from "./TodoRow";
import { useCommand } from "../../lib/commands";
import { PopupFrame } from "../ui/PopupFrame";
import { useLanguage } from "../LanguageProvider";

import { parseSmartDate } from "../../lib/dateParser";

const POPOVER_W = 320;

export interface TodoComposerInitial {
  id?: string;
  text?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  subtasks?: SubtaskItem[];
  contactId?: string | null;
  contactName?: string | null;
}

// The shared add/edit step for a to-do: write the task, pick who carries it, set a
// due date. Anchored under a board-doc selection when `anchorRect` is given,
// otherwise a centered modal. Self-contained — it writes to Firestore itself.
export default function TodoComposer({
  mode,
  anchorRect,
  initial,
  initialTexts,
  source,
  team,
  meUid,
  meName,
  onClose,
  onSaved,
  onCreated,
}: {
  mode: "create" | "edit";
  anchorRect?: { top: number; left: number } | null;
  initial?: TodoComposerInitial;
  initialTexts?: string[];
  source?: TodoSource | null;
  team: TodoPerson[];
  meUid: string;
  meName: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
  onCreated?: (tasks: { id: string; title: string; assigneeId: string | null; assigneeName: string | null }[]) => void;
}) {
  const { t } = useLanguage();
  const [texts, setTexts] = useState<string[]>(() =>
    initialTexts && initialTexts.length > 0 ? initialTexts : [initial?.text ?? ""],
  );
  const [assigneeId, setAssigneeId] = useState<string | null>(initial?.assigneeId ?? null);

  const [isManualDueOverride, setIsManualDueOverride] = useState<boolean>(initial?.dueDate !== undefined);

  const initialText = initialTexts && initialTexts.length > 0 ? initialTexts[0] : (initial?.text ?? "");
  const initialParsedDate = initial?.dueDate === undefined && initialText ? parseSmartDate(initialText).isoDate : null;
  const effectiveInitialDue = initial?.dueDate !== undefined ? initial?.dueDate : (initialParsedDate ?? undefined);

  const [dueKey, setDueKey] = useState<DuePresetKey>(() =>
    effectiveInitialDue !== undefined ? presetForDue(effectiveInitialDue) : "week",
  );
  const [customDate, setCustomDate] = useState<string>(
    effectiveInitialDue && presetForDue(effectiveInitialDue) === "custom" ? effectiveInitialDue : "",
  );
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(() => initial?.subtasks ?? []);
  const [saving, setSaving] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (texts.length <= 1) {
      const t = setTimeout(() => taRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [texts.length]);


  // Anchor below the selection, clamped to the viewport (flips above if it would
  // overflow the bottom). No anchor → centered.
  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.offsetHeight ?? 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(anchorRect.left - POPOVER_W / 2, 12), vw - POPOVER_W - 12);
    let top = anchorRect.top + 14;
    if (top + h > vh - 12) top = Math.max(12, anchorRect.top - h - 14);
    top = Math.min(top, Math.max(12, vh - h - 12));
    setPos({ left, top });
  }, [anchorRect, dueKey, customDate, texts.length]);

  const resolvedDue = (): string | null => {
    if (dueKey === "custom") return customDate || null;
    const preset = DUE_PRESETS.find((p) => p.key === dueKey);
    return preset ? duePresetToISO(preset.days) : null;
  };

  const canSave = texts.some((t) => t.trim().length > 0) && !!assigneeId && !saving;

  const handleAddSubtask = () => {
    setSubtasks((prev) => [...prev, { id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: '', done: false }]);
  };

  const handleSubtaskChange = (idx: number, title: string) => {
    setSubtasks((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], title };
      return copy;
    });
  };

  const handleRemoveSubtask = (idx: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const commit = async () => {
    const validTexts = texts.map((t) => t.trim()).filter(Boolean);
    if (validTexts.length === 0 || !assigneeId || saving) return;
    setSaving(true);
    const due = resolvedDue();
    const who = team.find((m) => m.uid === assigneeId);
    const first = who ? who.name.split(" ")[0] : "the team";
    const validSubtasks = subtasks.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title.length > 0);
    try {
      if (mode === "edit" && initial?.id) {
        await updateTodo(initial.id, { title: validTexts[0], assigneeId, dueDate: due, subtasks: validSubtasks });
        if (typeof logActivity === "function") {
          logActivity({
            action: 'updated task',
            targetId: initial.id,
            targetName: validTexts[0],
            targetType: 'comment',
            type: 'update',
            description: `Assigned to ${who?.name || 'Unassigned'}`,
          } as never);
        }
        onSaved?.("To-do updated.");
      } else {
        const createdList: { id: string; title: string; assigneeId: string | null; assigneeName: string | null }[] = [];
        for (let i = 0; i < validTexts.length; i++) {
          const valText = validTexts[i];
          let taskDue = due;
          if (!isManualDueOverride && validTexts.length > 1) {
            const parsed = parseSmartDate(valText);
            if (parsed.isoDate) taskDue = parsed.isoDate;
          }
          const newId = await addTodo({ title: valText, assigneeId, dueDate: taskDue, source: source ?? null, contactId: initial?.contactId ?? null, contactName: initial?.contactName ?? null, subtasks: i === 0 ? validSubtasks : [] }, { uid: meUid, name: meName });
          createdList.push({ id: newId, title: valText, assigneeId, assigneeName: who?.name || null });
          if (typeof logActivity === "function") {
            logActivity({
              action: 'added task',
              targetId: newId,
              targetName: valText,
              targetType: 'comment',
              type: 'create',
              description: `Assigned to ${who?.name || 'Unassigned'}`,
            } as never);
          }
          if (assigneeId && assigneeId !== meUid) {
            void sendNotification({
              userId: assigneeId,
              title: "New to-do",
              message: `${meName.split(" ")[0]} assigned you: ${valText.slice(0, 400)}`,
              type: "assignment",
              link: source?.docId ? "/coordination" : "/",
              targetId: newId,
            });
          }
        }
        if (createdList.length > 0) {
          onCreated?.(createdList);
        }
        const msg = validTexts.length > 1
          ? `Created ${validTexts.length} tasks for ${assigneeId === meUid ? "yourself" : first}.`
          : (assigneeId === meUid ? "Added to your day." : `Sent to ${first} — it's on their day now.`);
        onSaved?.(msg);
      }
      onClose();
    } catch (e) {
      console.error('TodoComposer commit error:', e);
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useCommand({
    id: "todo.create",
    scope: "overlay",
    description: "Create the to-do",
    shortcut: { key: "Enter", mod: true },
    minRole: "operator",
    handler: () => void commit(),
  });

  const cardStyle = anchorRect
    ? pos
      ? { position: "fixed" as const, left: pos.left, top: pos.top, width: POPOVER_W, zIndex: 100 }
      : { position: "fixed" as const, left: -9999, top: -9999, width: POPOVER_W, zIndex: 100 }
    : undefined;

  const handleTextChange = (idx: number, val: string) => {
    const copy = [...texts];
    copy[idx] = val;
    setTexts(copy);
    if (!isManualDueOverride && idx === 0) {
      const parsed = parseSmartDate(val);
      if (parsed.isoDate) {
        const preset = presetForDue(parsed.isoDate);
        setDueKey(preset);
        setCustomDate(preset === "custom" ? parsed.isoDate : "");
      }
    }
  };

  const handleDuePresetClick = (key: DuePresetKey) => {
    setIsManualDueOverride(true);
    setDueKey(key);
  };

  const handleCustomDateChange = (dateStr: string) => {
    setIsManualDueOverride(true);
    setCustomDate(dateStr);
  };

  const headerTitle =
    mode === "edit"
      ? t("todoComposer.edit_title")
      : texts.length > 1
        ? t("todoComposer.multiple_title").replace("{n}", String(texts.length))
        : t("todoComposer.new_title");

  const primaryLabel =
    mode === "edit"
      ? t("actions.save")
      : texts.length > 1
        ? t("todoComposer.add_todos")
        : t("todoComposer.add_todo");

  const sourceTitle = source ? source.docTitle ?? source.interactionTitle : null;

  const fields = (
    <>
      {texts.length > 1 ? (
        <div className="max-h-[140px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {texts.map((text, idx) => (
            <input
              key={idx}
              type="text"
              value={text}
              autoFocus={idx === 0}
              onChange={(e) => handleTextChange(idx, e.target.value)}
              placeholder={`Task ${idx + 1}`}
              className="h-9 w-full rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
            />
          ))}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={texts[0] || ""}
          rows={2}
          onChange={(e) => handleTextChange(0, e.target.value)}
          placeholder={t("todoComposer.what_needs_doing")}
          spellCheck={false}
          className="w-full resize-none rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
        />
      )}

      {/* Subtasks Section */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
          <span>
            {t("todoComposer.subtasks")} ({subtasks.length})
          </span>
          <button
            type="button"
            onClick={handleAddSubtask}
            className="inline-flex items-center gap-1 text-xs font-normal lowercase text-accent hover:underline"
          >
            <Plus className="h-3 w-3" /> Add subtask
          </button>
        </div>
        {subtasks.length > 0 && (
          <div className="max-h-[130px] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {subtasks.map((st, idx) => (
              <div key={st.id || idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={st.title}
                  onChange={(e) => handleSubtaskChange(idx, e.target.value)}
                  placeholder={`Subtask ${idx + 1}`}
                  className="h-8 flex-1 rounded border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface outline-none transition-colors focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSubtask(idx)}
                  className="p-1 text-on-surface-variant/50 transition-colors hover:text-error"
                  title={t("todoComposer.remove_subtask")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-1.5 mt-3 text-[11px] font-semibold text-on-surface-variant">
        {t("todoComposer.assign_to")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {team.map((m) => {
          const on = assigneeId === m.uid;
          return (
            <button
              key={m.uid}
              onClick={() => setAssigneeId(m.uid)}
              title={m.name}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors",
                on
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline-variant bg-surface text-on-surface-variant hover:border-outline",
              )}
            >
              <PersonAvatar person={m} size="xs" />
              {m.name.split(" ")[0]}
              {m.uid === meUid ? ` ${t("todoComposer.you")}` : ""}
            </button>
          );
        })}
      </div>

      <div className="mb-1.5 mt-3 text-[11px] font-semibold text-on-surface-variant">
        {t("todoComposer.due")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DUE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => handleDuePresetClick(p.key)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
              dueKey === p.key
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant bg-surface text-on-surface-variant hover:border-outline",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => handleDuePresetClick("custom")}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
            dueKey === "custom"
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant bg-surface text-on-surface-variant hover:border-outline",
          )}
        >
          {t("todoComposer.pick_a_date")}
        </button>
      </div>
      {dueKey === "custom" && (
        <div className="mt-2">
          <DatePicker label={t("todoComposer.due_date")} value={customDate} onChange={handleCustomDateChange} />
        </div>
      )}
    </>
  );

  if (anchorRect) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
        }}
      >
        <motion.div
          ref={cardRef}
          style={cardStyle}
          onKeyDown={onKey}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full max-w-[min(92vw,360px)] overflow-y-auto rounded border border-outline-variant bg-surface p-4 text-on-surface shadow-xl custom-scrollbar"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
              <CheckSquare className="h-3.5 w-3.5" /> {headerTitle}
            </span>
            <button
              onClick={onClose}
              title={t("actions.close")}
              aria-label={t("actions.close")}
              className="text-on-surface-variant/60 transition-colors hover:text-on-surface"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {fields}

          <div className="mt-4 flex items-center justify-between gap-2">
            {sourceTitle ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-on-surface-variant/70">
                <CheckSquare className="h-3 w-3 shrink-0" />
                <span className="truncate">{sourceTitle}</span>
              </span>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onClose}
                className="h-9 rounded-full px-3 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                {t("actions.cancel")}
              </button>
              <button
                onClick={commit}
                disabled={!canSave}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" /> {primaryLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <PopupFrame
      open
      onClose={onClose}
      size="sm"
      eyebrow={t("todoComposer.eyebrow")}
      title={headerTitle}
      dirty={texts.some((x) => x.trim().length > 0) || subtasks.some((s) => s.title.trim().length > 0)}
      noun={t("todoComposer.noun")}
      footerHint={
        sourceTitle ? (
          <>
            <CheckSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{sourceTitle}</span>
          </>
        ) : undefined
      }
      cancelLabel={t("actions.cancel")}
      onCancel={onClose}
      primary={{
        label: primaryLabel,
        onClick: commit,
        disabled: !canSave,
        saving,
        savingLabel: t("actions.saving"),
      }}
    >
      <div className="px-7 py-5">{fields}</div>
    </PopupFrame>
  );
}
