import { auth } from './firebase';

// Client helpers shared by Combine contacts, Combine tags and the Combined
// from banner (ADR 0038): the Full-timer-only endpoint calls and the small
// formatters their copy uses.

/** One item in an undo preview list (issue #1429). */
export interface UndoPreviewItem {
  kind: string;
  id: string;
  label: string;
}

/** The three lists the contact undo preview returns (issue #1429). */
export interface UndoPreview {
  goesBack: UndoPreviewItem[];
  stays: UndoPreviewItem[];
  notRestored: { kind: string; label: string }[];
}

export const formatWhen = (
  value?: string | number | Date | { toDate?: () => Date; seconds?: number } | null,
): string => {
  if (!value) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString();
    }
    if (typeof (value as { toDate?: () => unknown }).toDate === 'function') {
      const d = (value as { toDate: () => unknown }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toLocaleDateString();
      }
    }
    if (typeof (value as { seconds?: unknown }).seconds === 'number') {
      const d = new Date((value as { seconds: number }).seconds * 1000);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString();
      }
    }
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

/** Fills {placeholders} in a translated string. */
export const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');

/**
 * POSTs JSON to a Full-timer-only combine endpoint with the signed-in user's
 * bearer token. Throws the server's error (or `fallbackError`) on a non-OK
 * response; otherwise returns the parsed body.
 */
export async function postCombineApi<T = any>(
  url: string,
  payload: unknown,
  fallbackError: string,
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallbackError);
  return body as T;
}

/** Undoes (or, with `dryRun`, previews undoing) a contact combine record. */
export const requestContactUndo = (combineRecordId: string, dryRun: boolean) =>
  postCombineApi<{ success: boolean; preview?: UndoPreview }>(
    '/api/combine-contacts/undo',
    { combineRecordId, dryRun },
    'Undo failed',
  );
