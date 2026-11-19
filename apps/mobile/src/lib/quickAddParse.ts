// The phone's call to the quick-add parse route (§26). Same route and auth as
// the web's Smart Import parse; the response shape is the shared core type.
import type { QuickAddParseResponse } from '@cisa/core';
import { getApiUrl } from './apiUrl';

export async function requestQuickAddParse(
  text: string,
  token?: string | null,
): Promise<QuickAddParseResponse> {
  const response = await fetch(`${getApiUrl()}/api/quick-add/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || 'Could not read that note.');
  }
  return body as QuickAddParseResponse;
}
