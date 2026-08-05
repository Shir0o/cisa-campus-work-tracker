import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { statusPillClass, Avatar, StatusPills, StageChip, SectionHead, Figure } from '../components/landing/primitives';
import { ReachCard } from '../components/landing/ReachCard';
import { getGreeting, stageColor } from '../components/landing/helpers';

describe('statusPillClass', () => {
  it('returns active classes for each tone', () => {
    expect(statusPillClass(true, 'ongoing')).toContain('text-primary');
    expect(statusPillClass(true, 'answered')).toContain('text-on-tertiary-container');
    expect(statusPillClass(true, 'archived')).toContain('text-on-surface-variant');
  });

  it('returns inactive classes', () => {
    expect(statusPillClass(false, 'ongoing')).toContain('border-outline-variant');
  });
});

describe('getGreeting', () => {
  it('returns Good evening after 18:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 20, 0));
    expect(getGreeting()).toBe('Good evening');
    vi.useRealTimers();
  });

  it('returns Good morning before noon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0));
    expect(getGreeting()).toBe('Good morning');
    vi.useRealTimers();
  });

  it('returns Good afternoon between noon and 18', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0));
    expect(getGreeting()).toBe('Good afternoon');
    vi.useRealTimers();
  });
});

describe('stageColor', () => {
  it('returns fallback when label not found', () => {
    expect(stageColor([], 'unknown')).toContain('bg-surface-variant');
  });

  it('returns matching stage color', () => {
    const stages = [{ label: 'Active', color: 'bg-green text-white' }] as any;
    expect(stageColor(stages, 'Active')).toBe('bg-green text-white');
  });
});

describe('primitives components', () => {
  it('renders Avatar with avatar image and initials fallback', () => {
    const { rerender } = render(
      <Avatar contact={{ id: 'c1', name: 'John Doe', avatar: 'https://example.com/a.jpg' } as any} size="sm" />
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/a.jpg');

    rerender(<Avatar contact={{ id: 'c2', name: 'Jane Doe' } as any} />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders StatusPills with disabled state', () => {
    render(
      <StatusPills
        value="ongoing"
        options={[
          { val: 'ongoing', label: 'Ongoing', tone: 'ongoing' },
          { val: 'answered', label: 'Answered', tone: 'answered' },
        ]}
        onChange={vi.fn()}
        disabled={true}
      />
    );
    expect(screen.getByText('Ongoing')).toBeDisabled();
  });

  it('renders StageChip, SectionHead and Figure', () => {
    const onLink = vi.fn();
    render(
      <div>
        <StageChip stage="Prospect" stages={[{ label: 'Prospect', color: 'bg-blue' }] as any} />
        <SectionHead title="Test Section" sub="Sub heading" linkLabel="Learn More" onLink={onLink} action={<button>Action</button>} />
        <Figure n={42} label="Items" />
      </div>
    );
    expect(screen.getByText('Prospect')).toBeInTheDocument();
    expect(screen.getByText('Test Section')).toBeInTheDocument();
    expect(screen.getByText('Sub heading')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders ReachCard with phone, email, and not connected states', () => {
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const { rerender } = render(
      <ReachCard
        contact={{ id: 'c1', name: 'Alice', phone: '1234567890' } as any}
        days={3}
        note="A nice note"
        stages={[]}
        onOpen={onOpen}
        onMessage={onMessage}
        statusNode={<span>Awaiting look</span>}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('A nice note')).toBeInTheDocument();
    expect(screen.getByText('Awaiting look')).toBeInTheDocument();

    const msgBtn = screen.getByRole('button', { name: /Message/i });
    msgBtn.click();
    expect(onMessage).toHaveBeenCalled();

    rerender(
      <ReachCard
        contact={{ id: 'c2', name: 'Bob', email: 'bob@example.com' } as any}
        days={NaN}
        stages={[]}
        onOpen={onOpen}
      />
    );
    expect(screen.getByText('Not connected yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Email/i })).toHaveAttribute('href', 'mailto:bob@example.com');
  });
});
