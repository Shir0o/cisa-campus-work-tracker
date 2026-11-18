/**
 * The CISA Campus Work Tracker tool set, in one place.
 *
 * Every transport — stdio (`src/stdio.ts`), Streamable HTTP
 * (`src/http-server.ts`) and the Cloudflare Worker (`worker/`) — registers
 * these same definitions through {@link createMcpServer}, so behaviour cannot
 * drift between them.
 *
 * Every write appends a row to `mcp_audit_logs`. That collection has no
 * `firestore.rules` match, so it is server-only: not readable or writable from
 * the app.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { z } from 'zod';
import type { FirestoreBackend, FirestoreData, FirestoreDoc } from './backend.ts';

const MAX_SCAN = 2000;
const MAX_INTERACTIONS = 500;
const AUDIT_COLLECTION = 'mcp_audit_logs';
const DEFAULT_ACTOR = 'cisa-team';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolContext {
  backend: FirestoreBackend;
  /** Who is acting, for the audit trail. */
  actor: string;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** Zod raw shape, handed to the MCP SDK for schema generation. */
  inputSchema: ZodRawShapeCompat;
  annotations?: ToolAnnotations;
  run(ctx: ToolContext, args: unknown): Promise<ToolResult>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(value: unknown): ToolResult {
  return { text: JSON.stringify(value, null, 2) };
}

/** Converts Firestore Timestamps and nested values into JSON-safe values. */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.toDate === 'function') {
      const date = (record as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    }
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) result[key] = serialize(nested);
    return result;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (serialize(value) ?? {}) as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || name.slice(0, 1).toUpperCase();
}

/** ISO-ish day (YYYY-MM-DD) for lexicographic range checks. */
function dayOf(value: unknown): string {
  const text = asString(serialize(value));
  return text.slice(0, 10);
}

function timeOf(value: unknown): number {
  const text = asString(serialize(value));
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : 0;
}

function textOf(value: unknown): string {
  return JSON.stringify(serialize(value) ?? '').toLowerCase();
}

async function contactNameOf(backend: FirestoreBackend, contactId: string): Promise<string | null> {
  const contact = await backend.getDoc(`contacts/${contactId}`);
  return contact ? asString(contact.data.name) || null : null;
}

interface AuditInput {
  tool: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  changes?: Record<string, unknown>;
}

async function appendAudit(
  backend: FirestoreBackend,
  ctx: ToolContext,
  entry: AuditInput
): Promise<void> {
  const doc: FirestoreData = {
    actor: ctx.actor,
    tool: entry.tool,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    at: backend.serverTimestamp(),
  };
  if (entry.changes) doc.changes = serialize(entry.changes);
  await backend.addDoc(AUDIT_COLLECTION, doc);
}

function normalizeContact(doc: FirestoreDoc): Record<string, unknown> {
  const data = asRecord(doc.data);
  return {
    ...data,
    id: doc.id,
    name: asString(data.name),
    email: asString(data.email) || null,
    phone: asString(data.phone) || null,
    location: asString(data.location) || null,
    stage: asString(data.stage) || null,
    lastSeen: asString(data.lastSeen) || null,
    tags: asStringArray(data.tags),
    notes: asString(data.notes) || null,
  };
}

function normalizeTask(doc: FirestoreDoc): Record<string, unknown> {
  const data = asRecord(doc.data);
  return {
    ...data,
    id: doc.id,
    title: asString(data.title),
    status: asString(data.status, 'pending'),
    priority: asString(data.priority, 'medium'),
  };
}

function normalizeGathering(doc: FirestoreDoc): Record<string, unknown> {
  const data = asRecord(doc.data);
  return {
    ...data,
    id: doc.id,
    name: asString(data.name),
    date: dayOf(data.date),
    cancelled: data.cancelled === true,
  };
}

function normalizePrayer(doc: FirestoreDoc): Record<string, unknown> {
  const data = asRecord(doc.data);
  return {
    ...data,
    id: doc.id,
    burden: asString(data.burden),
    status: asString(data.status, 'pending'),
    teamPrayer: data.teamPrayer !== false,
  };
}

async function fetchContacts(backend: FirestoreBackend): Promise<FirestoreDoc[]> {
  return backend.listCollection('contacts', { limit: MAX_SCAN });
}

function compareContacts(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  sortBy: 'name' | 'lastSeen' | 'createdAt'
): number {
  if (sortBy === 'lastSeen') return timeOf(left.lastSeen) - timeOf(right.lastSeen);
  if (sortBy === 'createdAt') return timeOf(left.createdAt) - timeOf(right.createdAt);
  return asString(left.name).localeCompare(asString(right.name));
}

// ─── Contacts ───────────────────────────────────────────────────────────────

const ListContactsInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Free-text filter over name, email, phone, notes and tags. All terms must match.'),
  stage: z.string().trim().min(1).optional().describe('Stage label filter, e.g. "New" or "Walking".'),
  tag: z.string().trim().min(1).optional().describe('Tag filter (case-insensitive).'),
  limit: z.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['name', 'lastSeen', 'createdAt']).default('name'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
});

const listContacts: ToolDef = {
  name: 'list_contacts',
  title: 'List people',
  description:
    'List people in the CISA Campus Work Tracker with optional free-text, stage and tag filters. ' +
    'Returns the total match count plus the requested page.',
  inputSchema: ListContactsInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = ListContactsInput.parse(args);
    const docs = await fetchContacts(ctx.backend);
    let contacts = docs.map(normalizeContact);

    if (input.stage) {
      const wanted = input.stage.toLowerCase();
      contacts = contacts.filter((contact) => asString(contact.stage).toLowerCase() === wanted);
    }
    if (input.tag) {
      const wanted = input.tag.toLowerCase();
      contacts = contacts.filter((contact) =>
        asStringArray(contact.tags).some((tag) => tag.toLowerCase() === wanted)
      );
    }
    if (input.query) {
      const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      contacts = contacts.filter((contact) => {
        const haystack = textOf({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          notes: contact.notes,
          tags: contact.tags,
        });
        return terms.every((term) => haystack.includes(term));
      });
    }

    contacts = contacts.sort((left, right) => {
      const factor = input.sortDirection === 'desc' ? -1 : 1;
      return compareContacts(left, right, input.sortBy) * factor;
    });

    return json({
      total: contacts.length,
      returned: Math.min(contacts.length, input.limit),
      limit: input.limit,
      contacts: contacts.slice(0, input.limit),
    });
  },
};

const GetContactInput = z.object({
  contactId: z.string().trim().min(1).describe('Firestore document id from the contacts collection.'),
  includeInteractions: z.boolean().default(true).describe("Include the contact's interaction log."),
  includePrayers: z.boolean().default(false).describe("Include the contact's prayer records."),
  interactionLimit: z.number().int().min(1).max(200).default(25),
});

const getContact: ToolDef = {
  name: 'get_contact',
  title: 'Get one person',
  description:
    'Fetch a person by id, optionally with their recent interactions and prayer records. ' +
    'Use list_contacts first if you only know the name.',
  inputSchema: GetContactInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = GetContactInput.parse(args);
    const contact = await ctx.backend.getDoc(`contacts/${input.contactId}`);
    if (!contact) throw new Error(`No contact with id "${input.contactId}".`);

    const result: Record<string, unknown> = { contact: normalizeContact(contact) };

    if (input.includeInteractions) {
      const docs = await ctx.backend.listCollection(`contacts/${input.contactId}/interactions`, {
        limit: MAX_INTERACTIONS,
      });
      const interactions = docs
        .map((doc): Record<string, unknown> => ({ ...asRecord(doc.data), id: doc.id }))
        .sort((left, right) => timeOf(right.dateTime) - timeOf(left.dateTime))
        .slice(0, input.interactionLimit);
      result.interactionCount = docs.length;
      result.interactions = interactions;
    }

    if (input.includePrayers) {
      const docs = await ctx.backend.getDocsWhere('prayers', 'contactId', input.contactId, 100);
      result.prayers = docs
        .map(normalizePrayer)
        .sort((left, right) => timeOf(right.date) - timeOf(left.date));
    }

    return json(result);
  },
};

const CreateContactInput = z.object({
  name: z.string().trim().min(1).max(128).describe('Full name.'),
  email: z.string().trim().max(128).optional(),
  phone: z.string().trim().max(32).optional(),
  location: z.string().trim().max(128).optional().describe('Where they live, e.g. "Unit 4".'),
  stage: z.string().trim().max(64).default('New').describe('Stage label, normally one of list_stages.'),
  notes: z.string().trim().max(10000).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  spiritualBackground: z.string().trim().max(10000).optional(),
  metVia: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe('How we first met: Sign-up form, Outreach, A friend brought them, Gathering, Met on campus.'),
  inChurchLife: z.boolean().optional(),
  isStudent: z.boolean().optional(),
  createdById: z
    .string()
    .trim()
    .max(128)
    .optional()
    .describe('Firebase uid of the teammate who brought them in; becomes their visibleTo tie.'),
  createdByName: z.string().trim().max(128).optional(),
});

const createContact: ToolDef = {
  name: 'create_contact',
  title: 'Create a person',
  description:
    'Add a person to the directory. Mirrors the app record shape (name, contact details, stage, tags, ' +
    'kind flags) and writes an mcp_audit_logs entry.',
  inputSchema: CreateContactInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async run(ctx, args) {
    const input = CreateContactInput.parse(args);
    const now = new Date().toISOString();
    const createdBy = input.createdById?.trim() || null;

    const payload: FirestoreData = {
      name: input.name.trim(),
      email: input.email?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      location: input.location?.trim() ?? '',
      stage: input.stage.trim(),
      lastSeen: 'Just now',
      initials: initialsOf(input.name),
      createdAt: now,
      serverCreatedAt: ctx.backend.serverTimestamp(),
      createdBy,
      createdByName: input.createdByName?.trim() ?? null,
      visibleTo: createdBy ? [createdBy] : [],
    };

    if (input.notes) payload.notes = input.notes;
    if (input.tags) payload.tags = normalizeTags(input.tags);
    if (input.spiritualBackground) payload.spiritualBackground = input.spiritualBackground;
    if (input.metVia) payload.metVia = input.metVia;
    if (input.inChurchLife !== undefined) payload.inChurchLife = input.inChurchLife;
    if (input.isStudent !== undefined) payload.isStudent = input.isStudent;

    const id = await ctx.backend.addDoc('contacts', payload);
    await appendAudit(ctx.backend, ctx, {
      tool: 'create_contact',
      action: 'create',
      targetType: 'contact',
      targetId: id,
      summary: `Created ${payload.name}`,
      changes: { name: payload.name, stage: payload.stage },
    });

    const created = await ctx.backend.getDoc(`contacts/${id}`);
    return json({
      ok: true,
      contactId: id,
      contact: created ? normalizeContact(created) : { id, ...asRecord(payload) },
    });
  },
};

const UpdateContactInput = z.object({
  contactId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().max(128).optional(),
  phone: z.string().trim().max(32).optional(),
  location: z.string().trim().max(128).optional(),
  stage: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(10000).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  spiritualBackground: z.string().trim().max(10000).optional(),
  metVia: z.string().trim().max(64).optional(),
  inChurchLife: z.boolean().optional(),
  isStudent: z.boolean().optional(),
  updatedById: z.string().trim().max(128).optional(),
  updatedByName: z.string().trim().max(128).optional(),
});

const updateContact: ToolDef = {
  name: 'update_contact',
  title: 'Update a person',
  description:
    'Update fields on an existing person. Only the fields you pass change; an empty string or empty ' +
    'tag list clears a text field or tags. Writes an mcp_audit_logs entry.',
  inputSchema: UpdateContactInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = UpdateContactInput.parse(args);
    const patch: FirestoreData = {};

    if (input.name !== undefined) {
      patch.name = input.name.trim();
      patch.initials = initialsOf(input.name);
    }
    if (input.email !== undefined) patch.email = input.email.trim();
    if (input.phone !== undefined) patch.phone = input.phone.trim();
    if (input.location !== undefined) patch.location = input.location.trim();
    if (input.stage !== undefined) patch.stage = input.stage.trim();
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
    if (input.spiritualBackground !== undefined) {
      patch.spiritualBackground = input.spiritualBackground;
    }
    if (input.metVia !== undefined) patch.metVia = input.metVia;
    if (input.inChurchLife !== undefined) patch.inChurchLife = input.inChurchLife;
    if (input.isStudent !== undefined) patch.isStudent = input.isStudent;

    const changed = Object.keys(patch);
    if (changed.length > 0) {
      patch.updatedAt = new Date().toISOString();
      if (input.updatedById) patch.updatedBy = input.updatedById;
      if (input.updatedByName) patch.updatedByName = input.updatedByName;
    }

    const merged = await ctx.backend.runTransaction(async (tx) => {
      const current = await tx.get(`contacts/${input.contactId}`);
      if (!current) throw new Error(`No contact with id "${input.contactId}".`);
      if (changed.length > 0) tx.update(`contacts/${input.contactId}`, patch);
      return { ...current.data, ...patch };
    });

    await appendAudit(ctx.backend, ctx, {
      tool: 'update_contact',
      action: 'update',
      targetType: 'contact',
      targetId: input.contactId,
      summary: changed.length ? `Updated ${changed.join(', ')}` : 'No fields changed',
      changes: Object.fromEntries(changed.map((key) => [key, patch[key]])),
    });

    return json({
      ok: true,
      contactId: input.contactId,
      contact: normalizeContact({ id: input.contactId, data: merged }),
    });
  },
};

const LogInteractionInput = z.object({
  contactId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(10000).describe('What was said or done.'),
  type: z.enum(['chat', 'email', 'call', 'meeting']).default('chat'),
  dateTime: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe('ISO date or datetime of the interaction. Defaults to now.'),
  byId: z.string().trim().max(128).optional().describe('Firebase uid of the teammate who reached them.'),
  byName: z.string().trim().max(128).optional().describe('Display name for the teammate.'),
});

const logInteraction: ToolDef = {
  name: 'log_interaction',
  title: 'Log an interaction',
  description:
    'Append an interaction to a person\'s conversation history in one transaction with the contact\'s ' +
    'derived activity stamps (lastSeen, lastContactedBy, reachedAt). Writes an mcp_audit_logs entry.',
  inputSchema: LogInteractionInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async run(ctx, args) {
    const input = LogInteractionInput.parse(args);
    const contact = await ctx.backend.getDoc(`contacts/${input.contactId}`);
    if (!contact) throw new Error(`No contact with id "${input.contactId}".`);

    const contactName = asString(contact.data.name);
    const dateTime = input.dateTime?.trim() || new Date().toISOString();
    const authorName = input.byName?.trim() || ctx.actor;
    const authorId = input.byId?.trim() || null;
    const interactionId = crypto.randomUUID();
    const content = input.content.trim();

    const stamp = {
      lastSeen: dateTime,
      lastContactedDate: dateTime,
      lastContactedBy: authorName,
      lastContactedById: authorId,
      hasNewActivity: true,
      reachedAt: dateTime,
      updatedAt: new Date().toISOString(),
      updatedBy: authorId,
      updatedByName: authorName,
    };

    await ctx.backend.runTransaction(async (tx) => {
      const current = await tx.get(`contacts/${input.contactId}`);
      if (!current) throw new Error(`No contact with id "${input.contactId}".`);
      tx.set(`contacts/${input.contactId}/interactions/${interactionId}`, {
        userId: authorId ?? ctx.actor,
        userName: authorName,
        userPhoto: '',
        contactId: input.contactId,
        contactName,
        content,
        dateTime,
        type: input.type,
        createdAt: ctx.backend.serverTimestamp(),
      });
      tx.update(`contacts/${input.contactId}`, stamp);
    });

    await appendAudit(ctx.backend, ctx, {
      tool: 'log_interaction',
      action: 'create',
      targetType: 'interaction',
      targetId: interactionId,
      summary: `Logged ${input.type} with ${contactName || input.contactId}`,
      changes: { contactId: input.contactId, type: input.type, dateTime },
    });

    return json({
      ok: true,
      interactionId,
      contactId: input.contactId,
      contactName,
      type: input.type,
      dateTime,
    });
  },
};

// ─── Tasks ──────────────────────────────────────────────────────────────────

const ListTasksInput = z.object({
  status: z.enum(['pending', 'completed', 'canceled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional().describe('Free-text filter over title and contact name.'),
  limit: z.number().int().min(1).max(500).default(50),
});

const listTasks: ToolDef = {
  name: 'list_tasks',
  title: 'List to-dos',
  description:
    'List to-dos from the shared tasks collection with optional status, priority, assignee, person and ' +
    'free-text filters. Soonest due date first, undated last.',
  inputSchema: ListTasksInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = ListTasksInput.parse(args);
    const docs = await ctx.backend.listCollection('tasks', { limit: MAX_SCAN });
    let tasks = docs.map(normalizeTask);

    if (input.status) tasks = tasks.filter((task) => asString(task.status) === input.status);
    if (input.priority) tasks = tasks.filter((task) => asString(task.priority) === input.priority);
    if (input.assigneeId) {
      tasks = tasks.filter((task) => asString(task.assigneeId) === input.assigneeId);
    }
    if (input.contactId) {
      tasks = tasks.filter((task) => asString(task.contactId) === input.contactId);
    }
    if (input.query) {
      const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      tasks = tasks.filter((task) => {
        const haystack = textOf({ title: task.title, contactName: task.contactName });
        return terms.every((term) => haystack.includes(term));
      });
    }

    tasks.sort((left, right) => {
      const leftDue = dayOf(left.dueDate);
      const rightDue = dayOf(right.dueDate);
      if (!leftDue && !rightDue) return timeOf(right.createdAt) - timeOf(left.createdAt);
      if (!leftDue) return 1;
      if (!rightDue) return -1;
      if (leftDue === rightDue) return timeOf(right.createdAt) - timeOf(left.createdAt);
      return leftDue.localeCompare(rightDue);
    });

    return json({
      total: tasks.length,
      returned: Math.min(tasks.length, input.limit),
      limit: input.limit,
      tasks: tasks.slice(0, input.limit),
    });
  },
};

const CreateTaskInput = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .default(null)
    .describe('YYYY-MM-DD (or ISO datetime). null means undated.'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  contactId: z.string().trim().min(1).optional().describe('Link the to-do to a person.'),
  assigneeId: z.string().trim().max(128).optional(),
  assigneeName: z.string().trim().max(128).optional(),
  createdById: z.string().trim().max(128).optional(),
  createdByName: z.string().trim().max(128).optional(),
});

const createTask: ToolDef = {
  name: 'create_task',
  title: 'Create a to-do',
  description:
    'Create a to-do, optionally linked to a person and assigned to a teammate. Resolves the person\'s ' +
    'name for denormalised display and writes an mcp_audit_logs entry.',
  inputSchema: CreateTaskInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async run(ctx, args) {
    const input = CreateTaskInput.parse(args);
    const contactName = input.contactId
      ? await contactNameOf(ctx.backend, input.contactId)
      : null;

    const payload: FirestoreData = {
      title: input.title.trim(),
      dueDate: input.dueDate,
      priority: input.priority,
      status: 'pending',
      contactId: input.contactId ?? null,
      contactName,
      assigneeId: input.assigneeId ?? null,
      assigneeName: input.assigneeName ?? null,
      createdById: input.createdById ?? null,
      createdByName: input.createdByName ?? null,
      createdAt: ctx.backend.serverTimestamp(),
    };

    const id = await ctx.backend.addDoc('tasks', payload);
    await appendAudit(ctx.backend, ctx, {
      tool: 'create_task',
      action: 'create',
      targetType: 'task',
      targetId: id,
      summary: `Created to-do "${payload.title}"`,
      changes: { priority: payload.priority, dueDate: payload.dueDate, contactId: payload.contactId },
    });

    const created = await ctx.backend.getDoc(`tasks/${id}`);
    return json({
      ok: true,
      taskId: id,
      task: created ? normalizeTask(created) : { id, ...asRecord(payload) },
    });
  },
};

const UpdateTaskInput = z.object({
  taskId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500).optional(),
  dueDate: z.string().trim().max(40).nullable().optional().describe('null clears the due date.'),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'completed', 'canceled']).optional(),
  contactId: z.string().trim().min(1).nullable().optional().describe('null unlinks the person.'),
  assigneeId: z.string().trim().max(128).nullable().optional(),
  assigneeName: z.string().trim().max(128).nullable().optional(),
});

const updateTask: ToolDef = {
  name: 'update_task',
  title: 'Update a to-do',
  description:
    'Update or complete a to-do. Only the fields you pass change; null clears a nullable field. ' +
    'Writes an mcp_audit_logs entry.',
  inputSchema: UpdateTaskInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = UpdateTaskInput.parse(args);
    const patch: FirestoreData = {};

    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.assigneeName !== undefined) patch.assigneeName = input.assigneeName;
    if (input.contactId !== undefined) {
      patch.contactId = input.contactId;
      patch.contactName = input.contactId
        ? await contactNameOf(ctx.backend, input.contactId)
        : null;
    }

    const merged = await ctx.backend.runTransaction(async (tx) => {
      const current = await tx.get(`tasks/${input.taskId}`);
      if (!current) throw new Error(`No task with id "${input.taskId}".`);
      if (Object.keys(patch).length > 0) tx.update(`tasks/${input.taskId}`, patch);
      return { ...current.data, ...patch };
    });

    const changed = Object.keys(patch);

    await appendAudit(ctx.backend, ctx, {
      tool: 'update_task',
      action: 'update',
      targetType: 'task',
      targetId: input.taskId,
      summary: changed.length ? `Updated ${changed.join(', ')}` : 'No fields changed',
      changes: Object.fromEntries(changed.map((key) => [key, patch[key]])),
    });

    return json({
      ok: true,
      taskId: input.taskId,
      task: normalizeTask({ id: input.taskId, data: merged }),
    });
  },
};

// ─── Gatherings ─────────────────────────────────────────────────────────────

const ListGatheringsInput = z.object({
  from: z.string().regex(DATE_PATTERN).optional().describe('Inclusive start date (YYYY-MM-DD).'),
  to: z.string().regex(DATE_PATTERN).optional().describe('Inclusive end date (YYYY-MM-DD).'),
  includeCancelled: z.boolean().default(false),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
  limit: z.number().int().min(1).max(200).default(50),
});

const listGatherings: ToolDef = {
  name: 'list_gatherings',
  title: 'List gatherings',
  description:
    'List gatherings and Rhythm occasions from the events collection, with an inclusive date range and ' +
    'cancelled occasions excluded by default.',
  inputSchema: ListGatheringsInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = ListGatheringsInput.parse(args);
    const docs = await ctx.backend.listCollection('events', { limit: MAX_SCAN });
    let gatherings = docs.map(normalizeGathering);

    if (!input.includeCancelled) {
      gatherings = gatherings.filter((gathering) => gathering.cancelled !== true);
    }
    if (input.from) gatherings = gatherings.filter((gathering) => dayOf(gathering.date) >= input.from!);
    if (input.to) gatherings = gatherings.filter((gathering) => dayOf(gathering.date) <= input.to!);

    gatherings.sort((left, right) => {
      const factor = input.sortDirection === 'desc' ? -1 : 1;
      const byDate = dayOf(left.date).localeCompare(dayOf(right.date));
      if (byDate !== 0) return byDate * factor;
      return (Number(left.order ?? 0) - Number(right.order ?? 0)) * factor;
    });

    return json({
      total: gatherings.length,
      returned: Math.min(gatherings.length, input.limit),
      limit: input.limit,
      gatherings: gatherings.slice(0, input.limit),
    });
  },
};

const GetGatheringInput = z.object({
  gatheringId: z.string().trim().min(1).describe('Firestore document id from the events collection.'),
});

const getGathering: ToolDef = {
  name: 'get_gathering',
  title: 'Get one gathering',
  description:
    'Fetch one gathering with its attendance summary, the resolved roster, and the parent Rhythm when ' +
    'the occasion belongs to one.',
  inputSchema: GetGatheringInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = GetGatheringInput.parse(args);
    const gathering = await ctx.backend.getDoc(`events/${input.gatheringId}`);
    if (!gathering) throw new Error(`No gathering with id "${input.gatheringId}".`);

    const data = asRecord(gathering.data);
    const rhythmId = asString(data.rhythmId) || null;
    const rhythm = rhythmId ? await ctx.backend.getDoc(`rhythms/${rhythmId}`) : null;
    const rhythmData = rhythm ? asRecord(rhythm.data) : null;

    const attendance = data.attendance as
      | { present?: unknown; absent?: unknown }
      | undefined;
    const present = asStringArray(attendance?.present);
    const absent = asStringArray(attendance?.absent);
    const roster = asStringArray(
      data.rosterOverride ?? data.roster ?? rhythmData?.roster ?? []
    );

    return json({
      gathering: normalizeGathering(gathering),
      name: asString(data.name) || asString(rhythmData?.name),
      location: asString(data.location) || asString(rhythmData?.location) || null,
      roster,
      attendance: { present, absent, presentCount: present.length, absentCount: absent.length },
      rhythm: rhythm
        ? { id: rhythm.id, ...rhythmData }
        : null,
    });
  },
};

// ─── Prayers ────────────────────────────────────────────────────────────────

const ListPrayersInput = z.object({
  contactId: z.string().trim().min(1).optional().describe('Only this person\'s prayers.'),
  status: z.enum(['pending', 'answered', 'ongoing', 'unanswered']).optional(),
  teamOnly: z
    .boolean()
    .default(false)
    .describe('Only burdens carried by the whole team (absent teamPrayer means team).'),
  query: z.string().trim().min(1).optional().describe('Free-text filter over burden and answer.'),
  limit: z.number().int().min(1).max(200).default(50),
});

const listPrayers: ToolDef = {
  name: 'list_prayers',
  title: 'List prayers',
  description:
    'List prayer burdens and answers, newest first, filtered by person, status, team visibility or ' +
    'free text. Absent teamPrayer means the team carries it.',
  inputSchema: ListPrayersInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = ListPrayersInput.parse(args);
    const docs = input.contactId
      ? await ctx.backend.getDocsWhere('prayers', 'contactId', input.contactId, MAX_SCAN)
      : await ctx.backend.listCollection('prayers', { limit: MAX_SCAN });
    let prayers = docs.map(normalizePrayer);

    if (input.status) prayers = prayers.filter((prayer) => asString(prayer.status) === input.status);
    if (input.teamOnly) prayers = prayers.filter((prayer) => prayer.teamPrayer !== false);
    if (input.query) {
      const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      prayers = prayers.filter((prayer) => {
        const haystack = textOf({ burden: prayer.burden, answer: prayer.answer });
        return terms.every((term) => haystack.includes(term));
      });
    }

    prayers.sort((left, right) => {
      const leftTime = timeOf(left.date) || timeOf(left.updatedAt);
      const rightTime = timeOf(right.date) || timeOf(right.updatedAt);
      return rightTime - leftTime;
    });

    return json({
      total: prayers.length,
      returned: Math.min(prayers.length, input.limit),
      limit: input.limit,
      prayers: prayers.slice(0, input.limit),
    });
  },
};

// ─── Stages ─────────────────────────────────────────────────────────────────

const listStages: ToolDef = {
  name: 'list_stages',
  title: 'List stages',
  description:
    'The directory stage vocabulary in display order. Pass one of these labels as `stage` to ' +
    'list_contacts or create_contact.',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx) {
    const docs = await ctx.backend.listCollection('stages', { limit: 200 });
    const stages = docs
      .map((doc) => {
        const data = asRecord(doc.data);
        return {
          id: doc.id,
          label: asString(data.label),
          color: asString(data.color),
          order: Number(data.order ?? 0),
        };
      })
      .sort((left, right) => left.order - right.order);
    return json({ count: stages.length, stages });
  },
};

// ─── Coordination notes ─────────────────────────────────────────────────────

const ListCoordinationNotesInput = z.object({
  type: z.enum(['record', 'learning']).optional().describe('Only records or only learnings.'),
  series: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Event series filter, e.g. "Small Groups" or "Team" (case-insensitive).'),
  query: z.string().trim().min(1).optional().describe('Free-text filter over title, body and tags.'),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(30),
  bodyChars: z
    .number()
    .int()
    .min(0)
    .max(20000)
    .default(2000)
    .describe('Truncate each note body to this many characters (0 returns the whole body).'),
});

const listCoordinationNotes: ToolDef = {
  name: 'list_coordination_notes',
  title: 'List coordination notes',
  description:
    'Read the Board\'s notes archive (`board_notes`): records and learnings written from Coordination. ' +
    'Body text is truncated by default to keep responses readable; pass bodyChars to change it.',
  inputSchema: ListCoordinationNotesInput.shape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(ctx, args) {
    const input = ListCoordinationNotesInput.parse(args);
    const docs = await ctx.backend.listCollection('board_notes', { limit: MAX_SCAN });
    let notes = docs
      .map((doc): Record<string, unknown> => {
        const data = asRecord(doc.data);
        const body = asString(data.body);
        const truncated = input.bodyChars > 0 && body.length > input.bodyChars;
        return {
          ...data,
          id: doc.id,
          type: asString(data.type, 'record'),
          title: asString(data.title),
          series: asString(data.series) || null,
          body: truncated ? `${body.slice(0, input.bodyChars)}…` : body,
          bodyTruncated: truncated,
          tags: asStringArray(data.tags),
          archived: data.archivedAt != null,
          deleted: data.deletedAt != null,
        };
      })
      .filter((note) => note.deleted !== true);

    if (!input.includeArchived) notes = notes.filter((note) => note.archived !== true);
    if (input.type) notes = notes.filter((note) => asString(note.type) === input.type);
    if (input.series) {
      const wanted = input.series.toLowerCase();
      notes = notes.filter((note) => asString(note.series).toLowerCase() === wanted);
    }
    if (input.query) {
      const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      notes = notes.filter((note) => {
        const haystack = textOf({ title: note.title, body: note.body, tags: note.tags });
        return terms.every((term) => haystack.includes(term));
      });
    }

    notes.sort((left, right) => {
      const byDate = dayOf(right.date).localeCompare(dayOf(left.date));
      if (byDate !== 0) return byDate;
      return timeOf(right.createdAt) - timeOf(left.createdAt);
    });

    return json({
      total: notes.length,
      returned: Math.min(notes.length, input.limit),
      limit: input.limit,
      notes: notes.slice(0, input.limit),
    });
  },
};

// ─── Registration ───────────────────────────────────────────────────────────

export const TOOLS: readonly ToolDef[] = [
  listContacts,
  getContact,
  createContact,
  updateContact,
  logInteraction,
  listTasks,
  createTask,
  updateTask,
  listGatherings,
  getGathering,
  listPrayers,
  listStages,
  listCoordinationNotes,
];

export function createMcpServer(backend: FirestoreBackend, actor = DEFAULT_ACTOR): McpServer {
  const server = new McpServer(
    {
      name: 'cisa-work-tracker',
      version: '1.0.0',
      title: 'CISA Campus Work Tracker',
    },
    {
      instructions:
        'Read and manage the CISA Campus Work Tracker: people, interactions, to-dos, gatherings, ' +
        'prayers, directory stages and the Board\'s coordination notes. Every write is appended to ' +
        'mcp_audit_logs. Prefer list_contacts / list_tasks before creating anything, and confirm a ' +
        'person\'s id with get_contact before updating them.',
    }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args) => {
        try {
          const result = await tool.run({ backend, actor }, args);
          return {
            content: [{ type: 'text' as const, text: result.text }],
            isError: result.isError,
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${errorMessage(error)}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}
