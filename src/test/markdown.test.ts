import { describe, it, expect } from 'vitest';
import { mdPreview, mdOpenTasks } from '../lib/markdown';

describe('markdown helpers', () => {
  describe('mdPreview', () => {
    it('returns "Empty page" for falsy/empty input', () => {
      expect(mdPreview(undefined)).toBe('Empty page');
      expect(mdPreview('')).toBe('Empty page');
      expect(mdPreview('\n\n   \n')).toBe('Empty page');
    });

    it('skips headings', () => {
      expect(mdPreview('# Title\n## Subtitle\n### Section\nActual content')).toBe('Actual content');
    });

    it('skips bold-only meta lines', () => {
      expect(mdPreview('**Bold Meta Line**\nActual content')).toBe('Actual content');
    });

    it('strips list markers and checkboxes from task items', () => {
      expect(mdPreview('- [ ] Checkbox task')).toBe('Checkbox task');
      expect(mdPreview('* [x] Checked task')).toBe('Checked task');
      expect(mdPreview('- Bullet point')).toBe('Bullet point');
      expect(mdPreview('1. Numbered list item')).toBe('Numbered list item');
    });

    it('strips blockquote symbols', () => {
      expect(mdPreview('> Blockquote line')).toBe('Blockquote line');
      expect(mdPreview('>\nActual content')).toBe('Actual content');
    });

    it('strips rich formatting inline elements', () => {
      expect(mdPreview('This is **bold** and *italic* and `code` text.')).toBe('This is bold and italic and code text.');
      expect(mdPreview('Click [here](https://google.com) to search.')).toBe('Click here to search.');
    });

    it('returns "Empty page" if all lines are skipped/empty', () => {
      expect(mdPreview('# Heading 1\n## Heading 2\n**Bold Only**')).toBe('Empty page');
    });
  });

  describe('mdOpenTasks', () => {
    it('returns 0 for empty/falsy inputs', () => {
      expect(mdOpenTasks(undefined)).toBe(0);
      expect(mdOpenTasks('')).toBe(0);
    });

    it('counts occurrences of open task checkbox [ ]', () => {
      expect(mdOpenTasks('- [ ] Task 1')).toBe(1);
      expect(mdOpenTasks('- [ ] Task 1\n* [x] Task 2\n- [ ] Task 3')).toBe(2);
      expect(mdOpenTasks('Just plain text with [ ] inside a sentence.')).toBe(0); // must be checklist item format
    });
  });
});
