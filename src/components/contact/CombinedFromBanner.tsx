import React, { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { auth } from "../../lib/firebase";
import { useLanguage } from "../LanguageProvider";
import type { CombinedFrom } from "../../types";

interface UndoPreviewItem {
  kind: string;
  id: string;
  label: string;
}

interface UndoPreview {
  goesBack: UndoPreviewItem[];
  stays: UndoPreviewItem[];
  notRestored: { kind: string; label: string }[];
}

const formatWhen = (iso?: string): string => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

/** Fills {placeholders} in a translated string. */
const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");

/**
 * The "Combined from X on date by person" banner a combine leaves on the kept
 * contact (#1434, ADR 0038). Everyone who can read the contact sees the line;
 * only Full-timers get See what moved and Undo combine. Undo runs the same
 * Full-timer-only endpoint the Recent combines tab uses.
 */
export default function CombinedFromBanner({
  combinedFrom,
  isFullTimer,
}: {
  combinedFrom: CombinedFrom;
  isFullTimer: boolean;
}) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<UndoPreview | null>(null);
  const [intent, setIntent] = useState<"moves" | "undo" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const requestUndo = async (dryRun: boolean) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch("/api/combine-contacts/undo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ combineRecordId: combinedFrom.combineRecordId, dryRun }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Undo failed");
    return body as { success: boolean; preview?: UndoPreview };
  };

  const open = async (nextIntent: "moves" | "undo") => {
    if (busy || !combinedFrom.combineRecordId) return;
    setBusy(true);
    setError(null);
    try {
      const body = await requestUndo(true);
      setPreview(body.preview ?? { goesBack: [], stays: [], notRestored: [] });
      setIntent(nextIntent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmUndo = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestUndo(false);
      setHidden(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="combined-from-banner"
      className="px-5 py-3 bg-surface-variant/40 border-b border-outline-variant/40"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-on-surface-variant">
          {fill(
            t(
              'modals.contactDetails.combined_from',
              'Combined from {name} on {date} by {person}',
            ),
            {
              name: combinedFrom.name,
              date: formatWhen(combinedFrom.at),
              person: combinedFrom.byName,
            },
          )}
        </p>
        {isFullTimer && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !combinedFrom.combineRecordId}
              onClick={() => open('moves')}
              className="px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40"
            >
              {t('modals.contactDetails.see_what_moved', 'See what moved')}
            </button>
            <button
              type="button"
              disabled={busy || !combinedFrom.combineRecordId}
              onClick={() => open('undo')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              {t('modals.contactDetails.undo_combine', 'Undo combine')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {preview && (
        <div
          data-testid="combined-from-preview"
          className="mt-3 grid gap-4 sm:grid-cols-3 text-sm"
        >
          <div>
            <p className="font-medium text-on-surface">
              {t('modals.contactDetails.what_moved', 'What moved')}
            </p>
            <ul className="mt-1 space-y-0.5 text-on-surface-variant">
              {preview.goesBack.map((item, index) => (
                <li key={`${item.kind}-${item.id}-${index}`}>{item.label}</li>
              ))}
            </ul>
          </div>
          {intent === 'undo' && (
            <>
              <div>
                <p className="font-medium text-on-surface">
                  {t('modals.contactDetails.undo_stays', 'Stays')}
                </p>
                <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                  {preview.stays.map((item, index) => (
                    <li key={`${item.kind}-${item.id}-${index}`}>{item.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-on-surface">
                  {t('modals.contactDetails.undo_not_restored', 'Not restored')}
                </p>
                <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                  {preview.notRestored.map((item, index) => (
                    <li key={`${item.kind}-${item.label}-${index}`}>{item.label}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {intent === 'undo' && (
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setIntent(null);
                }}
                className="px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmUndo}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                {t('modals.contactDetails.undo_confirm', 'Confirm undo')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
