import { describe, it, expect } from 'vitest';
import { mdPreview, mdOpenTasks, htmlToBoardMarkdown } from '../lib/markdown';

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

  describe('htmlToBoardMarkdown', () => {
    it('returns empty string for falsy/empty input', () => {
      expect(htmlToBoardMarkdown('')).toBe('');
      expect(htmlToBoardMarkdown(undefined as unknown as string)).toBe('');
    });

    it('converts headings to ATX style', () => {
      expect(htmlToBoardMarkdown('<h1>Title</h1>')).toBe('# Title');
      expect(htmlToBoardMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
    });

    it('converts bold and italic', () => {
      expect(htmlToBoardMarkdown('<p>This is <strong>bold</strong> and <em>italic</em>.</p>')).toBe(
        'This is **bold** and _italic_.',
      );
    });

    it('converts bullet lists with a dash marker', () => {
      expect(htmlToBoardMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('-   one\n-   two');
    });

    it('converts ordered lists', () => {
      expect(htmlToBoardMarkdown('<ol><li>first</li><li>second</li></ol>')).toBe('1.  first\n2.  second');
    });

    it('converts links', () => {
      expect(htmlToBoardMarkdown('<p>Click <a href="https://example.com">here</a>.</p>')).toBe(
        'Click [here](https://example.com).',
      );
    });

    it('converts inline code', () => {
      expect(htmlToBoardMarkdown('<p>Run <code>npm test</code> now.</p>')).toBe('Run `npm test` now.');
    });

    it('converts code blocks to fenced style', () => {
      expect(htmlToBoardMarkdown('<pre><code>const a = 1;</code></pre>')).toBe('```\nconst a = 1;\n```');
    });

    it('converts blockquotes', () => {
      expect(htmlToBoardMarkdown('<blockquote><p>quoted</p></blockquote>')).toBe('> quoted');
    });

    it('strips foreign inline styles, keeping only the structure', () => {
      const pasted = '<p style="color:red;font-family:Arial">Hello <span style="font-weight:700">world</span></p>';
      expect(htmlToBoardMarkdown(pasted)).toBe('Hello **world**');
    });

    it('converts Google Docs style-based bold (font-weight on spans)', () => {
      expect(htmlToBoardMarkdown('<span style="font-weight:bold">bold</span>')).toBe('**bold**');
      expect(htmlToBoardMarkdown('<span style="font-weight:700">heavy</span>')).toBe('**heavy**');
      // Sub-600 weights are not bold.
      expect(htmlToBoardMarkdown('<span style="font-weight:400">normal</span>')).toBe('normal');
    });

    it('converts Google Docs style-based italic (font-style on spans)', () => {
      expect(htmlToBoardMarkdown('<span style="font-style:italic">slanted</span>')).toBe('_slanted_');
    });

    it('unwraps the Google Docs fake-bold selection wrapper', () => {
      const gdocs =
        '<b style="font-weight:normal" id="docs-internal-guid-x">' +
        '<span style="font-weight:400">normal </span>' +
        '<span style="font-weight:700">bold</span>' +
        '</b>';
      expect(htmlToBoardMarkdown(gdocs)).toBe('normal **bold**');
    });
  });
});
