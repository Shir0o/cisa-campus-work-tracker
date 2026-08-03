import { AppRole } from './permissions';
import { ImpersonateTarget } from '../types';

export const IMP_KEY = 'cisa.impersonate.v1';

export interface StaffItem {
  id: string;
  name: string;
  initials: string;
  role: string;
  isTrainee?: boolean;
}

export const DEFAULT_STAFF: StaffItem[] = [
  { id: 'u1', name: 'Mei Tanaka', initials: 'MT', role: 'Campus Director', isTrainee: false },
  { id: 'u2', name: 'Jordan Park', initials: 'JP', role: 'Discipleship Lead', isTrainee: false },
  { id: 'u3', name: 'Ana Beltrán', initials: 'AB', role: 'Outreach', isTrainee: false },
  { id: 'u4', name: 'Caleb Owusu', initials: 'CO', role: 'Small Group Lead', isTrainee: true },
  { id: 'u5', name: 'Priya Raman', initials: 'PR', role: 'Prayer Coordinator', isTrainee: true },
];

export const PERSONAS: Record<string, { name: string; initials: string; subtitle: string; role: AppRole }> = {
  student: {
    name: 'Alex Rivera',
    initials: 'AR',
    subtitle: 'Sophomore · Computer Science',
    role: 'operator',
  },
  community: {
    name: 'David Chen',
    initials: 'DC',
    subtitle: 'Alumnus · Friend of CISA',
    role: 'viewer',
  },
};

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

export function impStaffTarget(s: StaffItem): ImpersonateTarget {
  const isTrainee = !!s.isTrainee;
  return {
    key: `staff:${s.id}`,
    name: s.name,
    initials: s.initials,
    sub: s.role,
    note: isTrainee ? "The trainee's workspace" : 'The full workspace',
    role: isTrainee ? 'manager' : 'admin',
    persona: {
      id: isTrainee ? 'trainee' : 'ft',
      name: s.name,
      first: impFirst(s.name),
      initials: s.initials,
      role: s.role,
      roleShort: isTrainee ? 'In training' : 'Full-time',
      subtitle: s.role,
      staffId: s.id,
    },
  };
}

export function impPersonaTarget(k: string): ImpersonateTarget | null {
  const p = PERSONAS[k];
  if (!p) return null;
  return {
    key: `persona:${k}`,
    name: p.name,
    initials: p.initials,
    sub: p.subtitle,
    note: k === 'student' ? "A student's own window" : 'A friend of the work',
    role: p.role,
    persona: p,
  };
}

export function impContactTarget(c: { id: string; name: string; year?: string; major?: string; owner?: string }): ImpersonateTarget {
  const sub = [c.year, c.major].filter(Boolean).join(' · ');
  const initials = impInits(c.name);
  return {
    key: `contact:${c.id}`,
    name: c.name,
    initials,
    sub: sub || 'Student',
    note: "A student's own window",
    role: 'operator',
    persona: {
      id: 'student',
      name: c.name,
      first: impFirst(c.name),
      initials,
      role: 'Student',
      roleShort: 'Student',
      subtitle: sub || 'Student',
      caredById: c.owner || 'u1',
      contactId: c.id,
    },
  };
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
  resolve(k: string | null, contacts: any[] = []): ImpersonateTarget | null {
    if (!k) return null;
    const i = k.indexOf(':');
    if (i === -1) return null;
    const kind = k.slice(0, i);
    const id = k.slice(i + 1);

    if (kind === 'staff') {
      const s = DEFAULT_STAFF.find((x) => x.id === id);
      return s ? impStaffTarget(s) : null;
    }
    if (kind === 'persona') return impPersonaTarget(id);
    if (kind === 'contact') {
      const c = contacts.find((x) => x.id === id);
      return c ? impContactTarget(c) : null;
    }
    return null;
  },
  current(contacts: any[] = []): ImpersonateTarget | null {
    return this.resolve(this.key(), contacts);
  },
};
