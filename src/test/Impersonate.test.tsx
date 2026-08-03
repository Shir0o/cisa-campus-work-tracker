import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Impersonation,
  impStaffTarget,
  impPersonaTarget,
  impContactTarget,
  DEFAULT_STAFF,
} from '../lib/impersonate';
import ImpersonatePicker from '../components/layout/ImpersonatePicker';
import ImpersonateBar from '../components/layout/ImpersonateBar';
import ImpersonateModal from '../components/layout/ImpersonateModal';

describe('Impersonation Data & Helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('resolves staff targets correctly', () => {
    const target = Impersonation.resolve('staff:u1');
    expect(target).not.toBeNull();
    expect(target?.name).toBe('Mei Tanaka');
    expect(target?.role).toBe('admin');

    const traineeTarget = Impersonation.resolve('staff:u4');
    expect(traineeTarget?.name).toBe('Caleb Owusu');
    expect(traineeTarget?.role).toBe('manager');
  });

  it('resolves persona targets correctly', () => {
    const student = Impersonation.resolve('persona:student');
    expect(student?.name).toBe('Alex Rivera');
    expect(student?.role).toBe('operator');

    const community = Impersonation.resolve('persona:community');
    expect(community?.name).toBe('David Chen');
    expect(community?.role).toBe('viewer');
  });

  it('resolves contact targets correctly when passed contacts roster', () => {
    const mockContacts = [{ id: 'c123', name: 'Sam Taylor', year: 'Senior', major: 'Math' }];
    const target = Impersonation.resolve('contact:c123', mockContacts);
    expect(target?.name).toBe('Sam Taylor');
    expect(target?.sub).toBe('Senior · Math');
    expect(target?.role).toBe('operator');
  });

  it('persists impersonation target key in localStorage', () => {
    expect(Impersonation.key()).toBeNull();
    Impersonation.set('staff:u2');
    expect(Impersonation.key()).toBe('staff:u2');
    expect(Impersonation.current()?.name).toBe('Jordan Park');

    Impersonation.set(null);
    expect(Impersonation.key()).toBeNull();
  });
});

describe('ImpersonatePicker Component', () => {
  it('renders team, personas, and roster items and filters by search query', () => {
    const onPick = vi.fn();
    render(<ImpersonatePicker currentKey={null} onPick={onPick} />);

    expect(screen.getByText('The team')).toBeInTheDocument();
    expect(screen.getByText('Students & friends')).toBeInTheDocument();
    expect(screen.getByText('Mei Tanaka')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Find a person/i);
    fireEvent.change(searchInput, { target: { value: 'Jordan' } });

    expect(screen.getByText('Jordan Park')).toBeInTheDocument();
    expect(screen.queryByText('Mei Tanaka')).not.toBeInTheDocument();

    const pickButton = screen.getByRole('button', { name: /Jordan Park/i });
    fireEvent.click(pickButton);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].key).toBe('staff:u2');
  });
});

describe('ImpersonateBar Component', () => {
  it('renders active target banner and fires switch/exit callbacks', () => {
    const target = impStaffTarget(DEFAULT_STAFF[0]);
    const onSwitch = vi.fn();
    const onExit = vi.fn();

    render(<ImpersonateBar target={target} onSwitch={onSwitch} onExit={onExit} />);

    expect(screen.getByText(/You're seeing CISA as/i)).toBeInTheDocument();
    expect(screen.getByText('Mei Tanaka')).toBeInTheDocument();

    const switchBtn = screen.getByRole('button', { name: /Someone else/i });
    fireEvent.click(switchBtn);
    expect(onSwitch).toHaveBeenCalledTimes(1);

    const exitBtn = screen.getByRole('button', { name: /Back to my view/i });
    fireEvent.click(exitBtn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('ImpersonateModal Component', () => {
  it('renders modal when open and closes on ESC key or close button', () => {
    const onClose = vi.fn();
    const onPick = vi.fn();

    const { rerender } = render(
      <ImpersonateModal isOpen={false} currentKey={null} onPick={onPick} onClose={onClose} />,
    );
    expect(screen.queryByText('See it as they do')).not.toBeInTheDocument();

    rerender(
      <ImpersonateModal isOpen={true} currentKey={null} onPick={onPick} onClose={onClose} />,
    );
    expect(screen.getByText('See it as they do')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
