const ANONYMOUS_REPORTER = 'Anonymous';
const REPORTER_LABEL_MAX = 50;

function text(value?: string | null): string {
  return (value ?? '').trim();
}

export function isAnonymousReporter(userName?: string | null): boolean {
  const name = text(userName);
  return name.length === 0 || /^anonymous(?:\s+user)?$/i.test(name);
}

export function reporterDisplayName(userName?: string | null): string {
  if (isAnonymousReporter(userName)) return ANONYMOUS_REPORTER;
  return text(userName).split(/\s+/)[0];
}

function slugNamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function reporterLabelFromName(userName?: string | null): string | null {
  if (isAnonymousReporter(userName)) return null;

  const parts = text(userName).split(/\s+/);
  const first = slugNamePart(parts[0] ?? '');
  if (first.length === 0) return null;

  const last = parts.length > 1 ? slugNamePart(parts[parts.length - 1]) : '';
  const initial = last.length > 0 ? last[0] : '';
  if (initial.length === 0) return null;

  const label = 'reporter:' + first + '-' + initial;

  return label.length <= REPORTER_LABEL_MAX
    ? label
    : label.slice(0, REPORTER_LABEL_MAX).replace(/-+$/g, '');
}

export function feedbackIssueSubmittedByLine(userName?: string | null): string {
  return '- **Submitted By:** ' + reporterDisplayName(userName);
}

const SUBMITTED_BY_LINE = /^(- \*\*Submitted By:\*\*)\s*(.*?)\s*$/m;

export function removeFeedbackScreenshotSection(body: string): string {
  const marker = '\n\n### Screenshot\n';
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) return body;
  return body.slice(0, markerIndex);
}

export function rewriteFeedbackIssueAttribution(body: string): string {
  const withoutScreenshot = removeFeedbackScreenshotSection(body);
  const match = withoutScreenshot.match(SUBMITTED_BY_LINE);
  if (match === null) return withoutScreenshot;

  const existingName = match[2].replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (existingName.length === 0) return withoutScreenshot;

  return withoutScreenshot.replace(SUBMITTED_BY_LINE, feedbackIssueSubmittedByLine(existingName));
}
