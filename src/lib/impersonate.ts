import { AppRole } from './permissions';
import { ImpersonateTarget } from '../types';

export const IMP_KEY = 'cisa.impersonate.v1';

export interface StaffItem {
  id: string;
  name: string;
  initials?: string;
  role: string;
  email?: string;
  isTrainee?: boolean;
}

export const DEFAULT_TEST_ACCOUNTS: StaffItem[] = [
  { id: 'cisa-admin', name: 'cisa-admin', email: 'cisa-admin@cisa.campus', role: 'admin', isTrainee: false },
  { id: 'cisa-trainee', name: 'cisa-trainee', email: 'cisa-trainee@cisa.campus', role: 'manager', isTrainee: true },
];

export const DEFAULT_STAFF: StaffItem[] = DEFAULT_TEST_ACCOUNTS;

export function impFirst(name: string): string {
  return (name || '').split(' ')[0];
}

export function impInits(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

export function cleanCisaName(name: string): string {
  let cleanName = name || '';
  if (cleanName.toLowerCase().startsWith('cisa-')) {
    cleanName = cleanName.replace(/\s*\([^)]*\)$/, '').trim();
  }
  return cleanName;
}

export function impStaffTarget(s: StaffItem | any): ImpersonateTarget {
  const id = s.uid || s.id || '';
  const rawName = s.displayName || s.name || (s.email ? s.email.split('@')[0] : 'Team Member');
  const cleanName = cleanCisaName(rawName);
  const roleStr = s.role || 'manager';

  // Only the two live roles have a workspace (cut-or-keep §1). An unknown or
  // legacy role is never handed the full workspace by accident: it falls to
  // the least-privilege role, and the picker does not offer it at all.
  const roleKey: AppRole = roleStr === 'admin' || roleStr === 'Full-timer' ? 'admin' : 'manager';
  const isTrainee = roleKey === 'manager';

  const roleLabelMap: Record<AppRole, string> = {
    admin: 'Full-timer',
    manager: 'Trainee',
  };
  const roleLabel = roleLabelMap[roleKey] || 'Full-timer';

  const initials = s.initials || impInits(cleanName);
  const sub = s.email ? `${roleLabel} · ${s.email}` : s.sub || roleLabel;

  return {
    key: `staff:${id}`,
    name: cleanName,
    initials,
    sub,
    note: isTrainee ? "The trainee's workspace" : 'The full workspace',
    role: roleKey,
    persona: {
      id: isTrainee ? 'trainee' : 'ft',
      name: cleanName,
      first: impFirst(cleanName),
      initials,
      role: roleLabel,
      roleShort: isTrainee ? 'In training' : 'Full-time',
      subtitle: s.email || roleLabel,
      staffId: id,
    },
  };
}

export function meIdFor(persona: any): string {
  return (persona && (persona.staffId || persona.contactId || persona.id)) || 'u1';
}

export function identityKey(persona: any, role?: AppRole | string | null): string {
  return (persona && (persona.staffId || persona.contactId || persona.id)) || role || 'anon';
}

export const IMP_SCOPE_LABEL: Record<string, string> = {
  board: 'Board',
  history: 'History',
  attendance: 'Gatherings',
  prayer: 'On our hearts',
  answered: 'Answered',
  contacts: 'People',
  coordination: 'Coordination Notes',
  settings: 'Settings',
};

export const IMP_SCOPE_ORDER = ['board', 'history', 'attendance', 'prayer', 'contacts', 'answered', 'coordination'];

function impList(a: string[]): string {
  return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
}

export function impScope(
  target: ImpersonateTarget | null | undefined,
  totalContacts = 0,
  visibleCount?: number
): { people: string; pages: string } {
  if (!target) return { people: '', pages: '' };
  const role = target.role;

  let people: string;
  if (role === 'admin') {
    people = totalContacts > 0 ? `Everyone — all ${totalContacts} people` : 'Everyone — all roster people';
  } else {
    const n = visibleCount !== undefined ? visibleCount : 0;
    people = n === 1 ? '1 person — the one they added' : `${n} people they added or were named on`;
  }

  const missingKeys: string[] = [];
  if (role === 'manager') {
    missingKeys.push('history', 'attendance', 'prayer', 'answered', 'coordination', 'settings');
  }

  const missingLabels = missingKeys.map((k) => IMP_SCOPE_LABEL[k] || k);
  const pages = !missingLabels.length
    ? 'Every page'
    : missingLabels.length <= 3
    ? 'No ' + impList(missingLabels)
    : `No ${missingLabels.slice(0, 3).join(', ')} or ${missingLabels.length - 3} more`;

  return { people, pages };
}

export const Impersonation = {
  key(): string | null {
    try {
      return localStorage.getItem(IMP_KEY) || null;
    } catch {
      return null;
    }
  },
  set(k: string | null) {
    try {
      if (k) {
        localStorage.setItem(IMP_KEY, k);
      } else {
        localStorage.removeItem(IMP_KEY);
      }
    } catch {
      // ignore storage errors
    }
  },
  resolve(k: string | null, users: any[] = []): ImpersonateTarget | null {
    if (!k) return null;
    const i = k.indexOf(':');
    if (i === -1) return null;
    const kind = k.slice(0, i);
    const id = k.slice(i + 1);

    if (kind === 'staff') {
      const u = users.find((x) => (x.uid || x.id) === id);
      if (u) return impStaffTarget(u);
      const s = DEFAULT_TEST_ACCOUNTS.find((x) => x.id === id);
      return s ? impStaffTarget(s) : null;
    }
    return null;
  },
  current(users: any[] = []): ImpersonateTarget | null {
    return this.resolve(this.key(), users);
  },
};


