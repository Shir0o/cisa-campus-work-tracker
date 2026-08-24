import { describe, it, expect } from 'vitest';
import { mdPreview, mdSummary, mdOpenTasks, htmlToBoardMarkdown, splitMarkdownByH1, joinMarkdownSections } from '../lib/markdown';

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
      expect(mdPreview('This is **bold** and *italic* and ~~strikethrough~~ and `code` text.')).toBe('This is bold and italic and strikethrough and code text.');
      expect(mdPreview('Click [here](https://google.com) to search.')).toBe('Click here to search.');
    });

    it('returns "Empty page" if all lines are skipped/empty', () => {
      expect(mdPreview('# Heading 1\n## Heading 2\n**Bold Only**')).toBe('Empty page');
    });
  });

  describe('mdSummary', () => {
    it('returns "Empty page" for empty or missing input', () => {
      expect(mdSummary(undefined)).toBe('Empty page');
      expect(mdSummary('')).toBe('Empty page');
    });

    it('generates a clean short summary from document text', () => {
      const md = '# Gathering Notes\n\nDiscussed outreach planning for next Friday. Need to book room 102.\n- [ ] Contact venue';
      expect(mdSummary(md)).toBe('Discussed outreach planning for next Friday. Need to book room 102. Contact venue');
    });

    it('truncates long content to a concise short summary with ellipsis', () => {
      const longText = 'A '.repeat(100);
      const res = mdSummary(longText);
      expect(res.length).toBeLessThanOrEqual(130);
      expect(res.endsWith('…')).toBe(true);
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
      expect(htmlToBoardMarkdown('<span style="font-style:italic">italic</span>')).toBe('_italic_');
    });

    it('converts del, s, strike and style-based strikethrough to markdown tildes', () => {
      expect(htmlToBoardMarkdown('<del>deleted</del>')).toBe('~~deleted~~');
      expect(htmlToBoardMarkdown('<s>struck</s>')).toBe('~~struck~~');
      expect(htmlToBoardMarkdown('<strike>old</strike>')).toBe('~~old~~');
      expect(htmlToBoardMarkdown('<span style="text-decoration: line-through">styled</span>')).toBe('~~styled~~');
    });

    it('unwraps the Google Docs fake-bold selection wrapper', () => {
      const gdocs =
        '<b style="font-weight:normal" id="docs-internal-guid-x">' +
        '<span style="font-weight:400">normal </span>' +
        '<span style="font-weight:700">bold</span>' +
        '</b>';
      expect(htmlToBoardMarkdown(gdocs)).toBe('normal **bold**');
    });

    it('converts HTML tables to GFM Markdown tables', () => {
      const htmlTable =
        '<table>' +
        '<thead>' +
        '<tr><th>Header 1</th><th>Header 2</th></tr>' +
        '</thead>' +
        '<tbody>' +
        '<tr><td>Cell 1</td><td>Cell 2</td></tr>' +
        '<tr><td>Cell 3</td><td>Cell 4</td></tr>' +
        '</tbody>' +
        '</table>';
      
      const expectedMarkdown =
        '| Header 1 | Header 2 |\n' +
        '| --- | --- |\n' +
        '| Cell 1 | Cell 2 |\n' +
        '| Cell 3 | Cell 4 |';

      expect(htmlToBoardMarkdown(htmlTable)).toBe(expectedMarkdown);
    });
  });

  describe('splitMarkdownByH1 / joinMarkdownSections', () => {
    it('splits a doc on h1 headings, keeping each heading with its body', () => {
      const md = '# Welcome\n\nIntro paragraph.\n\n# Agenda\n\n- Item A\n- Item B\n\n# Close\n\nSee you next week.';
      expect(splitMarkdownByH1(md)).toEqual([
        '# Welcome\n\nIntro paragraph.',
        '# Agenda\n\n- Item A\n- Item B',
        '# Close\n\nSee you next week.',
      ]);
    });

    it('keeps a preamble before the first h1 as its own section', () => {
      const md = 'Quick note before headings.\n\n# Topic\nBody.';
      expect(splitMarkdownByH1(md)).toEqual(['Quick note before headings.', '# Topic\nBody.']);
    });

    it('does not split on h2/h3 — they belong to the current h1 section', () => {
      const md = '# Main\n\n## Sub A\n\n### Sub B\n\nText.';
      expect(splitMarkdownByH1(md)).toEqual(['# Main\n\n## Sub A\n\n### Sub B\n\nText.']);
    });

    it('does not split on a # line inside a fenced code block', () => {
      const md = '# Title\n\n```md\n# not a heading\n```\n\n# After\n\nBody.';
      expect(splitMarkdownByH1(md)).toEqual([
        '# Title\n\n```md\n# not a heading\n```',
        '# After\n\nBody.',
      ]);
    });

    it('returns a single section for a doc with no h1', () => {
      const md = 'Plain paragraph.\n\nAnother.';
      expect(splitMarkdownByH1(md)).toEqual(['Plain paragraph.\n\nAnother.']);
    });

    it('returns [] for empty or whitespace-only input', () => {
      expect(splitMarkdownByH1('')).toEqual([]);
      expect(splitMarkdownByH1('   \n\n  ')).toEqual([]);
      expect(splitMarkdownByH1(undefined as unknown as string)).toEqual([]);
    });

    it('normalizes surrounding blank lines and trims each section', () => {
      const md = '\n\n# A\n\n\nBody\n\n\n# B\n\n';
      expect(splitMarkdownByH1(md)).toEqual(['# A\n\nBody', '# B']);
    });

    it('joinMarkdownSections rejoins with a blank line between sections', () => {
      expect(joinMarkdownSections(['# A\nBody', '# B'])).toBe('# A\nBody\n\n# B');
      expect(joinMarkdownSections(['Only'])).toBe('Only');
      expect(joinMarkdownSections([])).toBe('');
      expect(joinMarkdownSections(['A', '', 'B'])).toBe('A\n\nB');
    });

    it('round-trips a real doc: join(split(md)) reproduces the markdown', () => {
      const md =
        '# Weekly Focus\n\n- [ ] Meet freshmen\n- [ ] Call mentor\n\n' +
        '# Outreach\n\n## Sub\n\nSome **bold** and [link](https://x.com).\n\n> A quote.';
      expect(joinMarkdownSections(splitMarkdownByH1(md))).toBe(md);
    });
  });
});
