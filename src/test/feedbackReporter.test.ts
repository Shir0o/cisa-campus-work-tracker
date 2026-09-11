import { describe, it, expect } from 'vitest';
import {
  feedbackIssueSubmittedByLine,
  isAnonymousReporter,
  reporterDisplayName,
  reporterLabelFromName,
  rewriteFeedbackIssueAttribution,
} from '../lib/feedbackReporter';

const fence = String.fromCharCode(96).repeat(3);

describe('feedback reporter attribution', () => {
  it('uses first name plus last initial for a reporter label', () => {
    expect(reporterLabelFromName('Tony Wang')).toBe('reporter:tony-w');
    expect(reporterLabelFromName('Sarah Carvajal')).toBe('reporter:sarah-c');
  });

  it('normalises punctuation, accents, and casing', () => {
    expect(reporterLabelFromName("Sarah O'Carvajal")).toBe('reporter:sarah-o');
    expect(reporterLabelFromName('Elodie  Nguyen')).toBe('reporter:elodie-n');
  });

  it('falls back to a first-name-only label when no last name is available', () => {
    expect(reporterLabelFromName('Tony')).toBe('reporter:tony');
    expect(reporterLabelFromName('  Tony  ')).toBe('reporter:tony');
  });

  it('treats empty and anonymous display names as anonymous', () => {
    expect(isAnonymousReporter('')).toBe(true);
    expect(isAnonymousReporter('Anonymous User')).toBe(true);
    expect(reporterDisplayName('Anonymous User')).toBe('Anonymous');
    expect(reporterLabelFromName('Anonymous User')).toBeNull();
  });

  it('renders the public issue attribution line with the first name only', () => {
    expect(feedbackIssueSubmittedByLine('Tony Wang')).toBe('- **Submitted By:** Tony');
    expect(feedbackIssueSubmittedByLine('Anonymous User')).toBe('- **Submitted By:** Anonymous');
  });

  it('rewrites an existing Submitted By line to first name only and removes email', () => {
    const original = [
      '### Feedback Details',
      '- **Submitted By:** Tony Wang (yilongwang05@gmail.com)',
      '- **Type:** enhancement',
      '',
      '### Message',
      fence + 'text',
      'hello',
      fence,
    ].join('\n');

    const rewritten = rewriteFeedbackIssueAttribution(original);

    expect(rewritten).toContain('- **Submitted By:** Tony');
    expect(rewritten).not.toContain('Tony Wang');
    expect(rewritten).not.toContain('yilongwang05@gmail.com');
    expect(rewritten).toContain('hello');
  });

  it('leaves a body unchanged when there is no Submitted By attribution', () => {
    const original = '### The idea\n\nSome design text.';
    expect(rewriteFeedbackIssueAttribution(original)).toBe(original);
  });
  it('removes the legacy screenshot section from an issue body', () => {
    const bang = String.fromCharCode(33);
    const original = [
      '### Feedback Details',
      '- **Submitted By:** Tony Wang (yilongwang05@gmail.com)',
      '',
      '### Screenshot',
      bang + '[Feedback Screenshot](https://example.com/api/feedback/1/screenshot)',
      '',
      '*(View screenshot directly on GitHub or in app admin panel)*',
    ].join('\n');

    const rewritten = rewriteFeedbackIssueAttribution(original);

    expect(rewritten).toContain('- **Submitted By:** Tony');
    expect(rewritten).not.toContain('### Screenshot');
    expect(rewritten).not.toContain('Feedback Screenshot');
  });
});
