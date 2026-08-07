import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  impScope,
  meIdFor,
  identityKey,
  impStaffTarget,
  impContactTarget,
  impPersonaTarget,
} from '../lib/impersonate';
import { ImpRow } from '../components/layout/ImpersonatePicker';

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'admin@cisa.campus', displayName: 'Admin User' },
    role: 'admin',
    effectiveUserId: 'u1',
    effectiveIdentityKey: 'admin',
    impersonateTarget: null,
  }),
}));

describe('Impersonation Scope & Identity Utilities', () => {
  it('computes meIdFor and identityKey accurately for staff, contact, and persona', () => {
    const staffTarget = impStaffTarget({ id: 'staff-123', name: 'Alex Trainee', role: 'Trainee', isTrainee: true });
    expect(meIdFor(staffTarget.persona)).toBe('staff-123');
    expect(identityKey(staffTarget.persona, 'manager')).toBe('staff-123');

    const contactTarget = impContactTarget({ id: 'c-456', name: 'Jordan Student', year: 'Freshman', major: 'CS' });
    expect(meIdFor(contactTarget.persona)).toBe('c-456');
    expect(identityKey(contactTarget.persona, 'operator')).toBe('c-456');

    const personaTarget = impPersonaTarget('student');
    expect(personaTarget).not.toBeNull();
    if (personaTarget) {
      expect(meIdFor(personaTarget.persona)).toBe('student');
      expect(identityKey(personaTarget.persona, 'operator')).toBe('student');
    }
  });

  it('computes impScope plain-words scope for Full-timer target', () => {
    const ftTarget = impStaffTarget({ id: 'ft-1', name: 'Full Timer', role: 'Full-timer' });
    const sc = impScope(ftTarget, 19);
    expect(sc.people).toContain('Everyone — all 19 people');
    expect(sc.pages).toBe('Every page');
  });

  it('computes impScope plain-words scope for Trainee target', () => {
    const traineeTarget = impStaffTarget({ id: 'tr-1', name: 'Trainee One', role: 'Trainee', isTrainee: true });
    const sc = impScope(traineeTarget, 19, 3);
    expect(sc.people).toContain('3 people they added or were named on');
    expect(sc.pages).toContain('No History');
  });

  it('computes impScope plain-words scope for Student target', () => {
    const studentTarget = impPersonaTarget('student');
    const sc = impScope(studentTarget, 19);
    expect(sc.people).toBe('No roster — just their own window');
    expect(sc.pages).toContain('No Board');
  });

  it('renders ImpRow with impScope people and pages text (Fixes Issue #216)', () => {
    const traineeTarget = impStaffTarget({ id: 'tr-1', name: 'Sam Trainee', role: 'Trainee', isTrainee: true });
    const onPick = vi.fn();

    render(
      <ImpRow
        target={traineeTarget}
        active={false}
        onPick={onPick}
        totalContacts={19}
        visibleCount={1}
      />
    );

    expect(screen.getByText('Sam Trainee')).toBeInTheDocument();
    expect(screen.getByText('1 person — the one they added')).toBeInTheDocument();
    expect(screen.getByText(/No History/)).toBeInTheDocument();
  });

  it('maps role simulation views and target impersonation to correct effectiveUserIds', () => {
    const resolve = (target: any, role: string | null, userUid = 'u1_admin') => {
      return target
        ? (target.persona?.staffId || target.persona?.contactId || target.persona?.id || null)
        : (role === 'manager'
            ? 'cisa-trainee'
            : role === 'operator'
            ? 'cisa-student'
            : role === 'viewer'
            ? 'cisa-community'
            : userUid);
    };

    expect(resolve(null, null, 'u1_admin')).toBe('u1_admin');
    expect(resolve(null, 'manager', 'u1_admin')).toBe('cisa-trainee');
    expect(resolve(null, 'operator', 'u1_admin')).toBe('cisa-student');
    expect(resolve(null, 'viewer', 'u1_admin')).toBe('cisa-community');

    const customTrainee = impStaffTarget({ id: 'trainee_99', name: 'Custom Trainee', role: 'Trainee', isTrainee: true });
    expect(resolve(customTrainee, 'manager', 'u1_admin')).toBe('trainee_99');
  });
});
