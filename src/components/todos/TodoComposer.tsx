import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, CheckSquare, X } from "lucide-react";
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
} from "../../lib/todos";
import { PersonAvatar } from "./TodoRow";

const POPOVER_W = 320;

export interface TodoComposerInitial {
  id?: string;
  text?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
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
}: {
  mode: "create" | "edit";
  anchorRect?: { top: number; left: number } | null;
  initial?: TodoComposerInitial;
  initialTexts?: string[];
  source?: { docId: string; docTitle: string } | null;
  team: TodoPerson[];
  meUid: string;
  meName: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const [texts, setTexts] = useState<string[]>(() =>
    initialTexts && initialTexts.length > 0 ? initialTexts : [initial?.text ?? ""],
  );
  const [assigneeId, setAssigneeId] = useState<string | null>(initial?.assigneeId ?? null);
  const [dueKey, setDueKey] = useState<DuePresetKey>(() =>
    initial?.dueDate !== undefined ? presetForDue(initial?.dueDate) : "week",
  );
  const [customDate, setCustomDate] = useState<string>(
    initial?.dueDate && presetForDue(initial.dueDate) === "custom" ? initial.dueDate : "",
  );
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
    setPos({ left, top });
  }, [anchorRect]);

  const resolvedDue = (): string | null => {
    if (dueKey === "custom") return customDate || null;
    const preset = DUE_PRESETS.find((p) => p.key === dueKey);
    return preset ? duePresetToISO(preset.days) : null;
  };

  const canSave = texts.some((t) => t.trim().length > 0) && !!assigneeId && !saving;

  const commit = async () => {
    const validTexts = texts.map((t) => t.trim()).filter(Boolean);
    if (validTexts.length === 0 || !assigneeId || saving) return;
    setSaving(true);
    const due = resolvedDue();
    const who = team.find((m) => m.uid === assigneeId);
    const first = who ? who.name.split(" ")[0] : "the team";
    try {
      if (mode === "edit" && initial?.id) {
        await updateTodo(initial.id, { title: validTexts[0], assigneeId, dueDate: due });
        logActivity({
          action: 'updated task',
          targetId: initial.id,
          targetName: validTexts[0],
          targetType: 'comment',
          type: 'update',
          description: `Assigned to ${who?.name || 'Unassigned'}`,
        } as never);
        onSaved?.("To-do updated.");
      } else {
        for (const valText of validTexts) {
          const newId = await addTodo({ title: valText, assigneeId, dueDate: due, source: source ?? null }, { uid: meUid, name: meName });
          logActivity({
            action: 'added task',
            targetId: newId,
            targetName: valText,
            targetType: 'comment',
            type: 'create',
            description: `Assigned to ${who?.name || 'Unassigned'}`,
          } as never);
          // Let the assignee know it's now on their day (the global Toaster surfaces it).
          if (assigneeId && assigneeId !== meUid) {
            void sendNotification({
              userId: assigneeId,
              title: "New to-do",
              message: `${meName.split(" ")[0]} assigned you: ${valText.slice(0, 400)}`,
              type: "assignment",
              link: "/",
            });
          }
        }
        const msg = validTexts.length > 1
          ? `Created ${validTexts.length} tasks for ${assigneeId === meUid ? "yourself" : first}.`
          : (assigneeId === meUid ? "Added to your day." : `Sent to ${first} — it's on their day now.`);
        onSaved?.(msg);
      }
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
  };

  const anchored = !!anchorRect;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto">
      {/* scrim — transparent over a selection, dimmed for the centered modal */}
      <div
        className={cn("absolute inset-0", !anchored && "bg-black/30")}
        onMouseDown={onClose}
      />
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: pos || !anchored ? 1 : 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        onKeyDown={onKey}
        onMouseDown={(e) => e.stopPropagation()}
        style={
          anchored
            ? { position: "absolute", width: POPOVER_W, left: pos?.left ?? 16, top: pos?.top ?? 80 }
            : undefined
        }
        className={cn(
          "bg-surface rounded-2xl border border-outline-variant shadow-xl p-4",
          !anchored &&
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,360px)]",
        )}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-on-surface-variant">
            <CheckSquare className="w-3.5 h-3.5" /> {mode === "edit" ? "Edit to-do" : (texts.length > 1 ? `New to-dos (${texts.length})` : "New to-do")}
          </span>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="text-on-surface-variant/60 hover:text-on-surface transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {texts.length > 1 ? (
          <div className="max-h-[140px] overflow-y-auto space-y-2 custom-scrollbar pr-1">
            {texts.map((t, idx) => (
              <input
                key={idx}
                type="text"
                value={t}
                autoFocus={idx === 0}
                onChange={(e) => {
                  const copy = [...texts];
                  copy[idx] = e.target.value;
                  setTexts(copy);
                }}
                placeholder={`Task ${idx + 1}`}
                className="w-full h-9 rounded-xl bg-surface-container-low border border-outline-variant/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary transition-colors"
              />
            ))}
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={texts[0] || ""}
            rows={2}
            onChange={(e) => setTexts([e.target.value])}
            placeholder="What needs doing?"
            spellCheck={false}
            className="w-full resize-none rounded-xl bg-surface-container-low border border-outline-variant/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary transition-colors"
          />
        )}

        <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/70 mt-3 mb-1.5">
          Assign to
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
                  "inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
                  on
                    ? "bg-primary-container border-primary text-on-primary-container"
                    : "bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline",
                )}
              >
                <PersonAvatar person={m} size="xs" />
                {m.name.split(" ")[0]}
                {m.uid === meUid ? " (you)" : ""}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/70 mt-3 mb-1.5">
          Due
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DUE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDueKey(p.key)}
              className={cn(
                "px-3 h-8 rounded-full border text-xs font-medium transition-colors",
                dueKey === p.key
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline",
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setDueKey("custom")}
            className={cn(
              "px-3 h-8 rounded-full border text-xs font-medium transition-colors",
              dueKey === "custom"
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline",
            )}
          >
            Pick a date…
          </button>
        </div>
        {dueKey === "custom" && (
          <div className="mt-2">
            <DatePicker label="Due date" value={customDate} onChange={setCustomDate} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4">
          {source ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant/70 min-w-0">
              <CheckSquare className="w-3 h-3 shrink-0" />
              <span className="truncate">{source.docTitle}</span>
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 h-9 rounded-full text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              <Check className="w-3.5 h-3.5" /> {mode === "edit" ? "Save" : (texts.length > 1 ? "Add to-dos" : "Add to-do")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
