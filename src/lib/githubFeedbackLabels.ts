const REPORTER_LABEL_COLORS = [
  '0E8A16',
  '1D76DB',
  '5319E7',
  'B60205',
  'D93F0B',
  'FBCA04',
  '006B75',
  '0052CC',
];

export function reporterLabelColor(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }
  return REPORTER_LABEL_COLORS[hash % REPORTER_LABEL_COLORS.length];
}

export async function ensureGitHubLabel(
  repo: string,
  token: string,
  label: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'CISA-Campus-Work-Tracker-Server',
    },
    body: JSON.stringify({
      name: label,
      color: reporterLabelColor(label),
    }),
  });

  if (response.ok) return true;

  if (response.status === 422) {
    const text = await response.text();
    return text.includes('already_exists');
  }

  return false;
}
