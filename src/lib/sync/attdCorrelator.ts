import type { Contact, Gathering, Rhythm } from '../../types';

// Attd payload contract (attd issue #188).
// Kept here rather than in src/types.ts because the whole bridge is one
// feature: the correlator is the module that gives these shapes meaning.

export type AttdAttendanceStatus = 'present' | 'absent' | 'late';

export interface AttdSyncRecord {
  memberId?: string | null;
  attendee: string;
  status: AttdAttendanceStatus;
  isLate?: boolean;
  recordedAt?: string;
}

export interface AttdSyncPayload {
  attdEventId: string;
  eventName: string;
  frequency: string;
  repeatingDays: string[];
  eventTime?: string;
  sessionDate: string;
  records: AttdSyncRecord[];
}

export type AttendeeMatchType = 'alias' | 'name' | 'fuzzy' | 'new';

export interface AttendeeAlias {
  id?: string;
  attdMemberId: string | null;
  attdName: string;
  contactId: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface AttdEventMapping {
  id?: string;
  attdEventId: string;
  rhythmId: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface AttendeeCorrelation {
  memberId: string | null;
  attdName: string;
  status: AttdAttendanceStatus;
  isLate: boolean;
  recordedAt?: string;
  contactId: string | null;
  contactName: string | null;
  matchType: AttendeeMatchType;
  confidence: number;
}

export interface AttendanceConflict {
  contactId: string;
  contactName: string;
  attdStatus: AttendanceMark;
  cisaStatus: AttendanceMark;
}

export interface AttendancePreviewStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  matched: number;
  walkIns: number;
  conflicts: number;
}

export interface AttendancePreview {
  attdEventId: string;
  eventName: string;
  sessionDate: string;
  rhythmId: string | null;
  rhythmName: string | null;
  gatheringId: string | null;
  gatheringName: string | null;
  matchSource: 'mapping' | 'cadence' | 'date' | 'none';
  attendees: AttendeeCorrelation[];
  conflicts: AttendanceConflict[];
  stats: AttendancePreviewStats;
}

export interface PendingAttendanceImport {
  id: string;
  attdEventId: string;
  eventName: string;
  frequency: string;
  repeatingDays: string[];
  eventTime?: string;
  sessionDate: string;
  records: AttdSyncRecord[];
  payload?: AttdSyncPayload;
  preview: AttendancePreview;
  status: 'pending' | 'confirmed' | 'discarded';
  createdAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface AttdIntegrationSettings {
  attdSyncToken?: string;
  attdSyncUrl?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type AttendanceMark = 'present' | 'absent';

export const FUZZY_MATCH_THRESHOLD = 0.72;

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aPairs = new Map<string, number>();
  const bPairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    aPairs.set(pair, (aPairs.get(pair) ?? 0) + 1);
  }
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    bPairs.set(pair, (bPairs.get(pair) ?? 0) + 1);
  }
  let intersection = 0;
  for (const [pair, count] of aPairs) intersection += Math.min(count, bPairs.get(pair) ?? 0);
  return (2 * intersection) / (a.length + b.length - 2);
}

export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === '') return 0;
  if (right === '') return 0;
  if (left === right) return 1;
  const leftTokens = left.split(' ');
  const rightTokens = right.split(' ');
  const leftLast = leftTokens[leftTokens.length - 1];
  const rightLast = rightTokens[rightTokens.length - 1];
  const leftFirst = leftTokens[0];
  const rightFirst = rightTokens[0];
  if (leftLast === rightLast) {

    if (leftFirst === rightFirst) return 1;
    if (leftFirst === '') return 0;
    if (rightFirst === '') return 0;
    if (leftFirst[0] === rightFirst[0]) return 0.9;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let common = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) common += 1;
  });
  const tokenScore = (2 * common) / (leftSet.size + rightSet.size);
  const editScore = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  const bigramScore = diceCoefficient(left, right);
  return Math.max(tokenScore, editScore, bigramScore);
}

export function dayNameToNumber(day: string | number): number | null {
  if (typeof day === 'number') {
    if (Number.isInteger(day)) {
      if (day >= 0) {
        if (day <= 6) return day;
      }
    }
    return null;
  }
  const key = String(day).trim().toLowerCase().replace(/\.$/, '');
  const full = DAY_NAMES.indexOf(key);
  if (full >= 0) return full;
  for (let i = 0; i < DAY_NAMES.length; i += 1) {
    if (DAY_NAMES[i].startsWith(key)) {
      if (key.length >= 3) return i;
    }
  }
  return null;
}

export function isPresentStatus(status: AttdAttendanceStatus): boolean {
  return status === 'present' || status === 'late';
}

export function resolveGatheringForSession(
  rhythmId: string,
  sessionDate: string,
  gatherings: Gathering[],
): Gathering | null {
  for (const gathering of gatherings) {
    if (gathering.rhythmId === rhythmId) {
      if (gathering.date === sessionDate) return gathering;
    }
  }
  return null;
}

export interface ResolveRhythmInput {
  payload: Pick<AttdSyncPayload, 'attdEventId' | 'eventName' | 'frequency' | 'repeatingDays' | 'sessionDate'>;
  rhythms: Rhythm[];
  mappings: AttdEventMapping[];
  gatherings: Gathering[];
}

export interface ResolvedRhythm {
  rhythm: Rhythm | null;
  gathering: Gathering | null;
  source: 'mapping' | 'cadence' | 'date' | 'none';
}

export function resolveRhythmForEvent(input: ResolveRhythmInput): ResolvedRhythm {
  const { payload, rhythms, mappings, gatherings } = input;
  let rhythm: Rhythm | null = null;
  let source: ResolvedRhythm['source'] = 'none';

  for (const mapping of mappings) {
    const mappingEventId = mapping.attdEventId ? mapping.attdEventId : mapping.id;
    if (mappingEventId === payload.attdEventId) {
      for (const candidate of rhythms) {
        if (candidate.id === mapping.rhythmId) {
          rhythm = candidate;
          source = 'mapping';
          break;
        }
      }
      break;
    }
  }

  if (rhythm === null) {
    const repeatingDays: number[] = [];
    for (const day of payload.repeatingDays) {
      const number = dayNameToNumber(day);
      if (number !== null) repeatingDays.push(number);
    }
    const candidates: Rhythm[] = [];
    if (payload.frequency.toLowerCase() === 'weekly') {
      for (const candidate of rhythms) {
        if (candidate.cadence.type !== 'weekly') continue;
        let overlaps = false;
        for (const cadenceDay of candidate.cadence.days) {
          if (repeatingDays.includes(cadenceDay)) overlaps = true;
        }
        if (overlaps) candidates.push(candidate);
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => nameSimilarity(payload.eventName, b.name) - nameSimilarity(payload.eventName, a.name));
      rhythm = candidates[0];
      source = 'cadence';
    }
  }

  if (rhythm !== null) {
    const gathering = resolveGatheringForSession(rhythm.id, payload.sessionDate, gatherings);
    return { rhythm, gathering, source };
  }

  for (const gathering of gatherings) {
    if (gathering.date === payload.sessionDate) {
      return { rhythm: null, gathering, source: 'date' };
    }
  }

  return { rhythm: null, gathering: null, source: 'none' };
}

export interface CorrelateAttendeesInput {
  records: AttdSyncRecord[];
  contacts: Contact[];
  aliases: AttendeeAlias[];
}

export function correlateAttendees(input: CorrelateAttendeesInput): AttendeeCorrelation[] {
  const { records, contacts, aliases } = input;
  const contactById = new Map<string, Contact>();
  for (const contact of contacts) contactById.set(contact.id, contact);

  const out: AttendeeCorrelation[] = [];
  for (const record of records) {
    const base: AttendeeCorrelation = {
      memberId: record.memberId ?? null,
      attdName: record.attendee,
      status: record.status,
      isLate: record.isLate === true,
      recordedAt: record.recordedAt,
      contactId: null,
      contactName: null,
      matchType: 'new',
      confidence: 0,
    };
    let resolved: AttendeeCorrelation | null = null;

    if (record.memberId) {
      for (const alias of aliases) {
        const aliasMemberId = alias.attdMemberId ? alias.attdMemberId : alias.id;
        if (aliasMemberId === record.memberId) {
          const contact = contactById.get(alias.contactId);
          if (contact) {
            resolved = { ...base, contactId: contact.id, contactName: contact.name, matchType: 'alias', confidence: 1 };
            break;
          }
        }
      }
    }

    if (resolved === null) {
      const normalized = normalizeName(record.attendee);
      for (const contact of contacts) {
        if (normalizeName(contact.name) === normalized) {
          resolved = { ...base, contactId: contact.id, contactName: contact.name, matchType: 'name', confidence: 1 };
          break;
        }
      }
    }

    if (resolved === null) {
      const normalized = normalizeName(record.attendee);
      for (const alias of aliases) {
        if (normalizeName(alias.attdName) === normalized) {
          const contact = contactById.get(alias.contactId);
          if (contact) {
            resolved = { ...base, contactId: contact.id, contactName: contact.name, matchType: 'name', confidence: 0.95 };
            break;
          }
        }
      }
    }

    if (resolved === null) {
      let bestContact: Contact | null = null;
      let bestScore = 0;
      for (const contact of contacts) {
        const score = nameSimilarity(record.attendee, contact.name);
        if (score > bestScore) {
          bestScore = score;
          bestContact = contact;
        }
      }
      if (bestContact) {
        if (bestScore >= FUZZY_MATCH_THRESHOLD) {
          resolved = { ...base, contactId: bestContact.id, contactName: bestContact.name, matchType: 'fuzzy', confidence: Number(bestScore.toFixed(2)) };
        }
      }
    }

    out.push(resolved ?? base);
  }
  return out;
}

export function detectConflicts(
  attendees: AttendeeCorrelation[],
  gathering: Gathering | null,
): AttendanceConflict[] {
  if (gathering === null) return [];
  const attendance = gathering.attendance;
  if (attendance === undefined) return [];
  const conflicts: AttendanceConflict[] = [];
  for (const attendee of attendees) {
    if (attendee.contactId === null) continue;
    let cisaStatus: AttendanceMark | null = null;
    if (attendance.present.includes(attendee.contactId)) cisaStatus = 'present';
    else if (attendance.absent.includes(attendee.contactId)) cisaStatus = 'absent';
    if (cisaStatus === null) continue;
    const attdStatus: AttendanceMark = isPresentStatus(attendee.status) ? 'present' : 'absent';
    if (cisaStatus !== attdStatus) {
      conflicts.push({
        contactId: attendee.contactId,
        contactName: attendee.contactName ?? attendee.attdName,
        attdStatus,
        cisaStatus,
      });
    }
  }
  return conflicts;
}

export interface BuildAttendancePreviewInput {
  payload: AttdSyncPayload;
  contacts: Contact[];
  rhythms: Rhythm[];
  mappings: AttdEventMapping[];
  gatherings: Gathering[];
  aliases: AttendeeAlias[];
}

export function buildAttendancePreview(input: BuildAttendancePreviewInput): AttendancePreview {
  const { payload, contacts, rhythms, mappings, gatherings, aliases } = input;
  const resolved = resolveRhythmForEvent({ payload, rhythms, mappings, gatherings });
  const attendees = correlateAttendees({ records: payload.records, contacts, aliases });
  const conflicts = detectConflicts(attendees, resolved.gathering);

  let present = 0;
  let late = 0;
  let absent = 0;
  let matched = 0;
  let walkIns = 0;
  for (const attendee of attendees) {
    if (attendee.status === 'present') present += 1;
    else if (attendee.status === 'late') late += 1;
    else absent += 1;
    if (attendee.contactId === null) walkIns += 1;
    else matched += 1;
  }

  return {
    attdEventId: payload.attdEventId,
    eventName: payload.eventName,
    sessionDate: payload.sessionDate,
    rhythmId: resolved.rhythm ? resolved.rhythm.id : null,
    rhythmName: resolved.rhythm ? resolved.rhythm.name : null,
    gatheringId: resolved.gathering ? resolved.gathering.id : null,
    gatheringName: resolved.gathering ? resolved.gathering.name : null,
    matchSource: resolved.source,
    attendees,
    conflicts,
    stats: {
      total: attendees.length,
      present,
      late,
      absent,
      matched,
      walkIns,
      conflicts: conflicts.length,
    },
  };
}

// Stable synonyms for callers that name the work rather than the module.
export const matchAttendees = correlateAttendees;
export const resolveRhythm = resolveRhythmForEvent;
export const correlateAttendance = correlateAttendees;
export const buildCorrelationPreview = buildAttendancePreview;
