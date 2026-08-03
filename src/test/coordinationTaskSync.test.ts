// The Board's task sync against a *real* TipTap editor — the other Coordination
// suites mock TipTap, so this is what actually proves the document positions are
// right and that patching a checklist line doesn't move the caret (#174 regression:
// the sync used to rebuild the whole document, throwing the caret to the bottom).
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { collectDocTaskNodes, planDocTaskEdits } from '../lib/board';

describe('doc task sync on a real editor', () => {
  it('patches the stale checklist lines and leaves the caret and the rest of the page alone', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ undoRedo: false }), TaskList, TaskItem.configure({ nested: true })],
      content:
        '<h1>Standup</h1><p>Some prose above</p>' +
        '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><p>Review PRs (@Bob) &lt;!-- task:task-1 assignee:u-bob --&gt;</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>Send newsletter &lt;!-- task:task-2 --&gt;</p></li>' +
        '</ul><p>Some prose below</p>',
    });

    const collect = () => collectDocTaskNodes(editor.state.doc);

    const nodes = collect();
    expect(nodes).toHaveLength(2);
    expect(nodes[0].text).toBe('Review PRs (@Bob) <!-- task:task-1 assignee:u-bob -->');

    // The computed range must address exactly that line's text in the real document.
    expect(editor.state.doc.textBetween(nodes[0].textFrom, nodes[0].textTo)).toBe(nodes[0].text);
    expect(editor.state.doc.textBetween(nodes[1].textFrom, nodes[1].textTo)).toBe(nodes[1].text);

    // Park the caret in the prose *above* the list, then sync both lines.
    const caret = 12;
    editor.commands.setTextSelection(caret);

    const tasksMap = new Map([
      ['task-1', { title: 'Review all PRs', status: 'open', assigneeId: 'u-bob' }],
      ['task-2', { title: 'Send newsletter', status: 'completed', assigneeId: null }],
    ]);
    const teamMap = new Map([['u-bob', { name: 'Bob Smith' }]]);
    const edits = planDocTaskEdits(nodes, tasksMap, teamMap, null);
    expect(edits).toHaveLength(2);

    const { state } = editor;
    const tr = state.tr;
    for (const edit of edits) {
      if (edit.text) {
        tr.replaceWith(tr.mapping.map(edit.text.from), tr.mapping.map(edit.text.to), state.schema.text(edit.text.value));
      }
      if (edit.checked !== undefined) {
        const pos = tr.mapping.map(edit.pos);
        const node = tr.doc.nodeAt(pos);
        if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: edit.checked });
      }
    }
    expect(tr.docChanged).toBe(true);
    editor.view.dispatch(tr.setMeta('addToHistory', false));

    // Both lines patched…
    const after = collect();
    expect(after[0].text).toBe('Review all PRs (@Bob) <!-- task:task-1 assignee:u-bob -->');
    expect(after[0].checked).toBe(false);
    expect(after[1].checked).toBe(true);
    // …the surrounding document untouched…
    expect(editor.getHTML()).toContain('<h1>Standup</h1>');
    expect(editor.getHTML()).toContain('Some prose below');
    // …and the caret did NOT get thrown to the bottom of the page.
    expect(editor.state.selection.from).toBe(caret);
    expect(editor.state.selection.from).toBeLessThan(editor.state.doc.content.size);

    editor.destroy();
  });

  it('inserts task markdown cleanly into editor without raw html tags', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
      ],
      content: '<p>Initial text</p>',
    });

    const mdTaskLine = '- [ ] Create a WhatApps - NACT coordination Group (@Kevin) <!-- task:tH8keV1ImKuG3aUAAVqR assignee:RMa9kONDdoYjM5bz7ZbuJPKhwdF3 -->';
    // Passing markdown directly to insertContent
    editor.chain().focus().insertContent(mdTaskLine).run();

    const html = editor.getHTML();
    expect(html).not.toContain('&lt;ul class="contains-task-list"');
    expect(html).not.toContain('<ul class="contains-task-list"');

    const nodes = collectDocTaskNodes(editor.state.doc);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('Create a WhatApps - NACT coordination Group (@Kevin) <!-- task:tH8keV1ImKuG3aUAAVqR assignee:RMa9kONDdoYjM5bz7ZbuJPKhwdF3 -->');

    editor.destroy();
  });
});

