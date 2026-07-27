import { describe, it, expect } from 'vitest';
import {
  formatDocTaskMarkdown,
  formatDocNoteMarkdown,
  parseDocTasks,
  parseDocNotes,
  syncMarkdownWithTasks,
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

  it('syncs markdown with updated tasks from external state', () => {
    const initialMarkdown = `- [ ] Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->`;
    const tasksMap = new Map([
      ['task-1', { title: 'Review PRs', status: 'completed', assigneeId: 'user-bob' }],
    ]);
    const teamMap = new Map([
      ['user-bob', { name: 'Bob Smith' }],
    ]);

    const updated = syncMarkdownWithTasks(initialMarkdown, tasksMap, teamMap);
    expect(updated).toBe('- [x] Review PRs (@Bob) <!-- task:task-1 assignee:user-bob -->');
  });
});
