import { describe, it, expect, vi } from 'vitest';
import {
  backfillFeedbackReporterLabels,
  parseSubmittedByName,
} from '../../scripts/backfill-feedback-reporter-labels';

function issue(number: number, title: string, body: string, labels: string[]) {
  return { number, title, body, labels: labels.map((name) => ({ name })) };
}

describe('feedback reporter backfill script', () => {
  it('parses the existing Submitted By line', () => {
    expect(parseSubmittedByName('- **Submitted By:** Ada Lovelace (ada@example.com)')).toBe('Ada Lovelace');
    expect(parseSubmittedByName('no reporter line here')).toBeNull();
  });

  it('reports planned email redactions and labels in dry-run mode', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          issue(601, '[Feedback] off: broken', '### Feedback Details\n- **Submitted By:** Tony Wang (tony@example.com)\n', ['bug', 'feedback']),
          issue(602, '[Feedback] idea: new', '### Feedback Details\n- **Submitted By:** Sarah Carvajal (sarah@example.com)\n', ['enhancement', 'feedback']),
          issue(603, 'Regular issue', 'body', ['enhancement']),
        ]),
        { status: 200 },
      ),
    );

    const report = await backfillFeedbackReporterLabels({
      repo: 'org/repo',
      token: 'gh-token',
      execute: false,
      fetchImpl: fetchImpl as any,
      log: () => {},
    });

    expect(report.selected).toBe(2);
    expect(report.updated).toBe(2);
    expect(report.skipped).toBe(0);
    expect(report.labels).toEqual(['reporter:tony-w', 'reporter:sarah-c']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('patches the body and adds the reporter label when execute is true', async () => {
    const fetchImpl = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/issues?') === true) {
        return Promise.resolve(new Response(JSON.stringify([
          issue(601, '[Feedback] off: broken', '### Feedback Details\n- **Submitted By:** Tony Wang (tony@example.com)\n\n### Message\nhello\n\n### Screenshot\n' + String.fromCharCode(33) + '[Feedback Screenshot](https://example.com/api/feedback/601/screenshot)', ['bug', 'feedback']),
        ]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ name: 'ok' }), { status: init?.method === 'PATCH' ? 200 : 201 }));
    });

    const report = await backfillFeedbackReporterLabels({
      repo: 'org/repo',
      token: 'gh-token',
      execute: true,
      fetchImpl: fetchImpl as any,
      log: () => {},
    });

    expect(report.updated).toBe(1);
    expect(report.failed).toBe(0);

    const calls = fetchImpl.mock.calls.map(([input, init]: any) => ({ url: String(input), method: init?.method, body: init?.body }));
    const patchCall = calls.find((call) => call.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const patchedBody = JSON.parse(patchCall.body).body;
    expect(patchedBody).toContain('- **Submitted By:** Tony');
    expect(patchedBody).not.toContain('tony@example.com');
    expect(patchedBody).not.toContain('### Screenshot');

    const labelCreate = calls.find((call) => call.url.endsWith('/labels') && call.method === 'POST' && call.url.endsWith('/labels'));
    const issueLabelAdd = calls.find((call) => call.url.endsWith('/issues/601/labels') && call.method === 'POST');
    expect(labelCreate).toBeTruthy();
    expect(issueLabelAdd).toBeTruthy();
    expect(JSON.parse(issueLabelAdd.body).labels).toEqual(['reporter:tony-w']);
  });
});
