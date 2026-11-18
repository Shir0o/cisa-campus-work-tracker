// Tool-layer tests. The backend is in memory, so these run with no Firebase,
// no credentials and no network.
import { describe, expect, it } from 'vitest';
import type { FirestoreBackend } from '../src/backend.ts';
import { MemoryBackend } from '../src/memory.ts';
import { TOOLS, type ToolContext, type ToolDef } from '../src/tools.ts';

function tool(name: string): ToolDef {
  const found = TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return found;
}

function ctxFor(backend: FirestoreBackend): ToolContext {
  return { backend, actor: 'test' };
}

async function call(backend: FirestoreBackend, name: string, args: unknown) {
  const result = await tool(name).run(ctxFor(backend), args);
  return { ...result, body: result.text ? JSON.parse(result.text) : undefined };
}

async function audits(backend: FirestoreBackend) {
  return backend.listCollection('mcp_audit_logs', { limit: 100 });
}

describe('create_contact', () => {
  it('creates a person with app-shaped fields and an audit entry', async () => {
    const backend = new MemoryBackend();
    const res = await call(backend, 'create_contact', {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      stage: 'New',
      tags: ['first-year', 'first-year', 'housed'],
      createdById: 'uid-1',
      createdByName: 'Tony',
    });

    expect(res.isError).toBeUndefined();
    expect(res.body.ok).toBe(true);
    expect(res.body.contact.name).toBe('Ada Lovelace');
    expect(res.body.contact.initials).toBe('AL');
    expect(res.body.contact.tags).toEqual(['first-year', 'housed']);
    expect(res.body.contact.visibleTo).toEqual(['uid-1']);

    const stored = await backend.getDoc(`contacts/${res.body.contactId}`);
    expect(stored?.data.stage).toBe('New');
    expect(stored?.data.lastSeen).toBe('Just now');

    const log = await audits(backend);
    expect(log).toHaveLength(1);
    expect(log[0].data).toMatchObject({
      actor: 'test',
      tool: 'create_contact',
      action: 'create',
      targetType: 'contact',
      targetId: res.body.contactId,
    });
  });

  it('rejects an empty name', async () => {
    const backend = new MemoryBackend();
    await expect(call(backend, 'create_contact', { name: '   ' })).rejects.toThrow();
    expect(await backend.listCollection('contacts')).toHaveLength(0);
  });
});

describe('list_contacts and get_contact', () => {
  it('filters by stage, tag and free text and sorts by name', async () => {
    const backend = new MemoryBackend();
    await backend.addDoc('contacts', {
      name: 'Zoe Park',
      stage: 'Walking',
      tags: ['sophomore'],
      email: 'zoe@example.com',
      notes: 'Meets on Tuesdays',
    });
    await backend.addDoc('contacts', {
      name: 'Ben Ortiz',
      stage: 'New',
      tags: ['first-year'],
      email: 'ben@example.com',
    });

    const byStage = await call(backend, 'list_contacts', { stage: 'walking' });
    expect(byStage.body.total).toBe(1);
    expect(byStage.body.contacts[0].name).toBe('Zoe Park');

    const byTag = await call(backend, 'list_contacts', { tag: 'FIRST-YEAR' });
    expect(byTag.body.contacts.map((person: { name: string }) => person.name)).toEqual([
      'Ben Ortiz',
    ]);

    const byText = await call(backend, 'list_contacts', { query: 'tuesdays' });
    expect(byText.body.total).toBe(1);

    const all = await call(backend, 'list_contacts', {});
    expect(all.body.contacts.map((person: { name: string }) => person.name)).toEqual([
      'Ben Ortiz',
      'Zoe Park',
    ]);
  });

  it('returns interactions and prayers for one person', async () => {
    const backend = new MemoryBackend();
    const contactId = await backend.addDoc('contacts', { name: 'Ada Lovelace', stage: 'New' });
    await backend.addDoc(`contacts/${contactId}/interactions`, {
      content: 'Coffee after the meeting',
      dateTime: '2026-11-01T10:00:00.000Z',
      type: 'chat',
    });
    await backend.addDoc('prayers', {
      contactId,
      burden: 'Settling into the dorm',
      status: 'pending',
      date: '2026-11-02',
    });

    const res = await call(backend, 'get_contact', {
      contactId,
      includeInteractions: true,
      includePrayers: true,
    });
    expect(res.body.contact.name).toBe('Ada Lovelace');
    expect(res.body.interactions).toHaveLength(1);
    expect(res.body.prayers).toHaveLength(1);
  });

  it('reports an unknown id instead of returning an empty document', async () => {
    const backend = new MemoryBackend();
    await expect(call(backend, 'get_contact', { contactId: 'nope' })).rejects.toThrow(
      /No contact with id "nope"/
    );
  });
});

describe('update_contact', () => {
  it('patches only the supplied fields and records what changed', async () => {
    const backend = new MemoryBackend();
    const contactId = await backend.addDoc('contacts', {
      name: 'Ada Lovelace',
      stage: 'New',
      notes: 'keep me',
    });

    const res = await call(backend, 'update_contact', {
      contactId,
      stage: 'Walking',
      tags: ['housed'],
    });

    expect(res.body.contact.stage).toBe('Walking');
    expect(res.body.contact.notes).toBe('keep me');
    expect(res.body.contact.tags).toEqual(['housed']);

    const stored = await backend.getDoc(`contacts/${contactId}`);
    expect(stored?.data.stage).toBe('Walking');

    const log = await audits(backend);
    expect(log[0].data.action).toBe('update');
    expect(log[0].data.changes).toEqual({ stage: 'Walking', tags: ['housed'] });
  });
});

describe('log_interaction', () => {
  it('appends the interaction and stamps the contact activity fields', async () => {
    const backend = new MemoryBackend();
    const contactId = await backend.addDoc('contacts', { name: 'Ada Lovelace', stage: 'New' });

    const res = await call(backend, 'log_interaction', {
      contactId,
      content: 'Read Romans 8 together',
      type: 'meeting',
      dateTime: '2026-11-10T18:30:00.000Z',
      byId: 'uid-1',
      byName: 'Tony',
    });

    expect(res.body.ok).toBe(true);
    expect(res.body.interactionId).toBeTruthy();

    const interaction = await backend.getDoc(
      `contacts/${contactId}/interactions/${res.body.interactionId}`
    );
    expect(interaction?.data.content).toBe('Read Romans 8 together');
    expect(interaction?.data.type).toBe('meeting');

    const contact = await backend.getDoc(`contacts/${contactId}`);
    expect(contact?.data.lastSeen).toBe('2026-11-10T18:30:00.000Z');
    expect(contact?.data.lastContactedBy).toBe('Tony');
    expect(contact?.data.reachedAt).toBe('2026-11-10T18:30:00.000Z');

    const log = await audits(backend);
    expect(log[0].data).toMatchObject({
      tool: 'log_interaction',
      targetType: 'interaction',
      targetId: res.body.interactionId,
    });
  });

  it('refuses to log against a missing person', async () => {
    const backend = new MemoryBackend();
    await expect(
      call(backend, 'log_interaction', { contactId: 'missing', content: 'Hello' })
    ).rejects.toThrow(/No contact with id "missing"/);
  });
});

describe('tasks', () => {
  it('creates a to-do with the contact name resolved and audits it', async () => {
    const backend = new MemoryBackend();
    const contactId = await backend.addDoc('contacts', { name: 'Ada Lovelace' });

    const res = await call(backend, 'create_task', {
      title: 'Follow up about the study',
      dueDate: '2026-11-20',
      priority: 'high',
      contactId,
      assigneeId: 'uid-1',
    });

    expect(res.body.task.contactName).toBe('Ada Lovelace');
    expect(res.body.task.status).toBe('pending');
    expect(res.body.task.priority).toBe('high');

    const log = await audits(backend);
    expect(log[0].data).toMatchObject({ tool: 'create_task', targetType: 'task' });
  });

  it('lists soonest-first with undated last and updates status', async () => {
    const backend = new MemoryBackend();
    await backend.addDoc('tasks', { title: 'Later', dueDate: '2026-12-01', status: 'pending', priority: 'low' });
    await backend.addDoc('tasks', { title: 'Undated', dueDate: null, status: 'pending', priority: 'low' });
    const soon = await backend.addDoc('tasks', {
      title: 'Soon',
      dueDate: '2026-11-18',
      status: 'pending',
      priority: 'high',
    });

    const pending = await call(backend, 'list_tasks', { status: 'pending' });
    expect(pending.body.tasks.map((task: { title: string }) => task.title)).toEqual([
      'Soon',
      'Later',
      'Undated',
    ]);

    const done = await call(backend, 'update_task', { taskId: soon, status: 'completed' });
    expect(done.body.task.status).toBe('completed');

    const high = await call(backend, 'list_tasks', { priority: 'high' });
    expect(high.body.total).toBe(1);
    expect((await audits(backend)).at(-1)?.data.action).toBe('update');

    const noop = await call(backend, 'update_task', { taskId: soon });
    expect(noop.body.task.status).toBe('completed');
  });
});

describe('gatherings', () => {
  it('filters by date and cancelled, then resolves the rhythm', async () => {
    const backend = new MemoryBackend();
    const rhythmId = await backend.addDoc('rhythms', {
      name: 'Wednesday Bible Study',
      location: 'Student Union 2',
      roster: ['c1', 'c2'],
    });
    const gatheringId = await backend.addDoc('events', {
      name: '',
      date: '2026-11-11',
      order: 1,
      rhythmId,
      attendance: { present: ['c1'], absent: ['c2'] },
    });
    await backend.addDoc('events', {
      name: 'Cancelled night',
      date: '2026-11-18',
      order: 2,
      cancelled: true,
    });

    const listed = await call(backend, 'list_gatherings', {
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(listed.body.total).toBe(1);

    const all = await call(backend, 'list_gatherings', { includeCancelled: true });
    expect(all.body.total).toBe(2);

    const one = await call(backend, 'get_gathering', { gatheringId });
    expect(one.body.name).toBe('Wednesday Bible Study');
    expect(one.body.location).toBe('Student Union 2');
    expect(one.body.roster).toEqual(['c1', 'c2']);
    expect(one.body.attendance).toMatchObject({ presentCount: 1, absentCount: 1 });
  });
});

describe('prayers', () => {
  it('filters by person and team visibility', async () => {
    const backend = new MemoryBackend();
    await backend.addDoc('prayers', {
      contactId: 'c1',
      burden: 'Family',
      status: 'pending',
      date: '2026-11-01',
      teamPrayer: true,
    });
    await backend.addDoc('prayers', {
      contactId: 'c1',
      burden: 'Private',
      status: 'ongoing',
      date: '2026-11-02',
      teamPrayer: false,
    });
    await backend.addDoc('prayers', {
      contactId: 'c2',
      burden: 'Studies',
      status: 'answered',
      date: '2026-11-03',
    });

    const team = await call(backend, 'list_prayers', { teamOnly: true });
    expect(team.body.prayers.map((prayer: { burden: string }) => prayer.burden)).toEqual([
      'Studies',
      'Family',
    ]);

    const one = await call(backend, 'list_prayers', { contactId: 'c1' });
    expect(one.body.total).toBe(2);
    expect(one.body.prayers[0].burden).toBe('Private');
  });
});

describe('stages', () => {
  it('returns stages in display order', async () => {
    const backend = new MemoryBackend();
    await backend.addDoc('stages', { label: 'Walking', color: 'green', order: 2 });
    await backend.addDoc('stages', { label: 'New', color: 'blue', order: 1 });

    const res = await call(backend, 'list_stages', {});
    expect(res.body.stages.map((stage: { label: string }) => stage.label)).toEqual([
      'New',
      'Walking',
    ]);
  });
});

describe('coordination notes', () => {
  it('hides archived and deleted notes and truncates long bodies', async () => {
    const backend = new MemoryBackend();
    await backend.addDoc('board_notes', {
      type: 'learning',
      series: 'Team',
      title: 'Ask earlier',
      body: 'x'.repeat(50),
      date: '2026-11-05',
      tags: ['follow-up'],
    });
    await backend.addDoc('board_notes', {
      type: 'record',
      series: 'Outreach',
      title: 'Archived record',
      body: 'old',
      date: '2026-11-04',
      archivedAt: new Date('2026-11-06'),
    });
    await backend.addDoc('board_notes', {
      type: 'record',
      series: 'Outreach',
      title: 'Deleted record',
      body: 'gone',
      date: '2026-11-03',
      deletedAt: new Date('2026-11-06'),
    });

    const active = await call(backend, 'list_coordination_notes', { bodyChars: 10 });
    expect(active.body.total).toBe(1);
    expect(active.body.notes[0].title).toBe('Ask earlier');
    expect(active.body.notes[0].body).toBe(`${'x'.repeat(10)}…`);
    expect(active.body.notes[0].bodyTruncated).toBe(true);

    const archived = await call(backend, 'list_coordination_notes', {
      includeArchived: true,
    });
    expect(archived.body.total).toBe(2);

    const learnings = await call(backend, 'list_coordination_notes', { type: 'learning' });
    expect(learnings.body.total).toBe(1);
  });
});
