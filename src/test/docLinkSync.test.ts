import { describe, it, expect } from 'vitest';
import {
  formatDocTaskMarkdown,
  formatDocTaskText,
  formatDocNoteMarkdown,
  parseDocTasks,
  parseDocTaskText,
  parseDocNotes,
  planDocTaskEdits,
  type DocTaskNode,
} from '../lib/board';

describe('docLinkSync helpers', () => {
  it('formats doc task markdown with assignee', () => {
    const formatted = formatDocTaskMarkdown({
      id: 'task-123',
      title: 'Setup meeting agenda',
      assigneeId: 'user-456',
      assigneeName: 'Alice',
      done: false,
    });
    expect(formatted).toBe('- [ ] Setup meeting agenda (@Alice) <!-- task:task-123 assignee:user-456 -->');
  });

  it('formats completed task without assignee', () => {
    const formatted = formatDocTaskMarkdown({
      id: 'task-999',
      title: 'Clean workspace',
      done: true,
    });
    expect(formatted).toBe('- [x] Clean workspace <!-- task:task-999 -->');
  });

  it('formats doc note markdown', () => {
    const formatted = formatDocNoteMarkdown({
      id: 'note-789',
      title: 'Team sync key takeaway',
      body: 'Focus on campus outreach',
      type: 'learning',
    });
    expect(formatted).toBe('> 📝 **Note (Learning)**: Team sync key takeaway — Focus on campus outreach <!-- note:note-789 type:learning -->');
  });

  it('parses doc tasks correctly', () => {
    const markdown = `# Notes
- [ ] Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->
- [x] Send newsletter <!-- task:task-2 -->
Regular text line
`;
    const tasks = parseDocTasks(markdown);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      id: 'task-1',
      done: false,
      title: 'Review PRs',
      assigneeId: 'user-bob',
      assigneeName: 'Bob',
      rawLine: '- [ ] Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->',
    });
    expect(tasks[1]).toEqual({
      id: 'task-2',
      done: true,
      title: 'Send newsletter',
      assigneeId: null,
      assigneeName: null,
      rawLine: '- [x] Send newsletter <!-- task:task-2 -->',
    });
  });

  it('parses doc notes correctly', () => {
    const markdown = `> 📝 **Note (Learning)**: Takeaway <!-- note:note-1 type:learning -->`;
    const notes = parseDocNotes(markdown);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      id: 'note-1',
      type: 'learning',
      rawLine: '> 📝 **Note (Learning)**: Takeaway <!-- note:note-1 type:learning -->',
    });
  });

  it('formats doc note with record type and without body', () => {
    const formatted = formatDocNoteMarkdown({
      id: 'note-100',
      title: 'Meeting Notes',
      type: 'record',
    });
    expect(formatted).toBe('> 📝 **Note (Record)**: Meeting Notes <!-- note:note-100 type:record -->');
  });

  it('formats doc task with assigneeId but no assigneeName', () => {
    const formatted = formatDocTaskMarkdown({
      id: 'task-555',
      title: 'Task without name',
      assigneeId: 'uid-555',
    });
    expect(formatted).toBe('- [ ] Task without name <!-- task:task-555 assignee:uid-555 -->');
  });

  it('parses doc notes when type attribute is omitted in comment', () => {
    const markdown = `> 📝 **Note**: Default note <!-- note:note-no-type -->`;
    const notes = parseDocNotes(markdown);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      id: 'note-no-type',
      type: 'record',
      rawLine: '> 📝 **Note**: Default note <!-- note:note-no-type -->',
    });
  });

});

// The doc editor compares task *nodes*, not serialized Markdown lines — comparing
// lines made the caret jump, because any serialization difference (an indented task,
// a title containing Markdown punctuation) reads as "changed" forever and triggered a
// whole-document replace on every Firestore snapshot.
describe('doc task text ↔ node round trip', () => {
  it('formats the inline text the editor holds, without the checkbox prefix', () => {
    expect(
      formatDocTaskText({ id: 'task-1', title: 'Review PRs', assigneeId: 'user-bob', assigneeName: 'Bob' }),
    ).toBe('Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->');
  });

  it('is the same text formatDocTaskMarkdown puts after the checkbox', () => {
    const task = { id: 'task-1', title: 'Review PRs', assigneeId: 'user-bob', assigneeName: 'Bob', done: true };
    expect(formatDocTaskMarkdown(task)).toBe(`- [x] ${formatDocTaskText(task)}`);
  });

  it('round-trips a title containing Markdown punctuation', () => {
    const text = formatDocTaskText({ id: 'task-2', title: 'Fix [board] *sync*_now', assigneeId: null, assigneeName: null });
    expect(parseDocTaskText(text)).toEqual({
      id: 'task-2',
      title: 'Fix [board] *sync*_now',
      assigneeId: null,
      assigneeName: null,
    });
  });

  it('round-trips a task with no assignee', () => {
    const text = formatDocTaskText({ id: 'task-3', title: 'Clean workspace' });
    expect(text).toBe('Clean workspace <!-- task:task-3 -->');
    expect(parseDocTaskText(text)).toEqual({
      id: 'task-3',
      title: 'Clean workspace',
      assigneeId: null,
      assigneeName: null,
    });
  });

  it('returns null for text carrying no task marker', () => {
    expect(parseDocTaskText('Just a plain checklist line')).toBeNull();
  });
});

describe('planDocTaskEdits', () => {
  const teamMap = new Map([['user-bob', { name: 'Bob Smith' }]]);
  const node = (over: Partial<DocTaskNode> = {}): DocTaskNode => ({
    pos: 10,
    textFrom: 12,
    textTo: 60,
    checked: false,
    text: 'Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->',
    ...over,
  });

  it('plans nothing when the doc already agrees with the tasks', () => {
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'open', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([node()], tasksMap, teamMap, null)).toEqual([]);
  });

  it('plans a checkbox-only edit when the task was completed elsewhere', () => {
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'completed', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([node()], tasksMap, teamMap, null)).toEqual([{ pos: 10, checked: true }]);
  });

  it('plans a text edit when the task was renamed or reassigned elsewhere', () => {
    const tasksMap = new Map([['task-1', { title: 'Review all PRs', status: 'open', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([node()], tasksMap, teamMap, null)).toEqual([
      {
        pos: 10,
        text: { from: 12, to: 60, value: 'Review all PRs (@Bob) <!-- task:task-1 assignee:user-bob -->' },
      },
    ]);
  });

  it('drops the assignee name when the task was unassigned elsewhere', () => {
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'open', assigneeId: null }]]);
    const [edit] = planDocTaskEdits([node()], tasksMap, teamMap, null);
    expect(edit.text?.value).toBe('Review PRs <!-- task:task-1 -->');
  });

  it('leaves the name off when the assignee is not in the team map', () => {
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'open', assigneeId: 'ghost-uid' }]]);
    const [edit] = planDocTaskEdits([node()], tasksMap, teamMap, null);
    expect(edit.text?.value).toBe('Review PRs <!-- task:task-1 assignee:ghost-uid -->');
  });

  it('skips the line the caret is sitting in, so typing is never interrupted', () => {
    const tasksMap = new Map([['task-1', { title: 'Review all PRs', status: 'completed', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([node()], tasksMap, teamMap, { from: 30, to: 30 })).toEqual([]);
  });

  it('skips a line a selection merely overlaps', () => {
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'completed', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([node()], tasksMap, teamMap, { from: 55, to: 120 })).toEqual([]);
  });

  it('still syncs the other lines while one is being typed in', () => {
    const other = node({
      pos: 70,
      textFrom: 72,
      textTo: 110,
      text: 'Send newsletter <!-- task:task-2 -->',
    });
    const tasksMap = new Map([
      ['task-1', { title: 'Review PRs', status: 'completed', assigneeId: 'user-bob' }],
      ['task-2', { title: 'Send newsletter', status: 'completed', assigneeId: null }],
    ]);
    expect(planDocTaskEdits([node(), other], tasksMap, teamMap, { from: 30, to: 30 })).toEqual([
      { pos: 70, checked: true },
    ]);
  });

  it('ignores nodes with no task marker and tasks it does not know about', () => {
    const plain = node({ pos: 200, text: 'a plain checklist item' });
    const unknown = node({ pos: 300, text: 'Gone <!-- task:task-deleted -->' });
    const tasksMap = new Map([['task-1', { title: 'Review PRs', status: 'open', assigneeId: 'user-bob' }]]);
    expect(planDocTaskEdits([plain, unknown], tasksMap, teamMap, null)).toEqual([]);
  });
});
